import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { polygonAreaM2, selfIntersects, toGeoJson } from '../../apps/app/src/lib/geo.ts';

// Migration 0196 (mục 9): bản đồ thửa — tính năng nâng cao mặc định tắt, ranh khu ở bảng riêng, diện tích máy chủ tự tính.

const AREA = '20000000-0000-4000-8000-0000000000d1';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn')`, [AREA, org]);
  return { db, owner, wk, other, org };
}

// hình vuông khoảng 100 m × 100 m ở vĩ độ ~10°N
const D = 0.0009043;                     // ~100 m theo vĩ độ
const sq = (lat, lng) => {
  const dl = D / Math.cos(lat * Math.PI / 180);
  return [[lat, lng], [lat, lng + dl], [lat + D, lng + dl], [lat + D, lng]];
};

test('tính năng nâng cao: mặc định tắt (chưa có dòng), chỉ chủ bật được, thành viên chỉ đọc, cơ sở khác không thấy', async () => {
  const { db, owner, wk, other, org } = await setup();
  assert.equal((await asUser(db, wk, `select count(*)::int n from org_features`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, wk, `select set_org_feature($1,'map',true)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_org_feature($1,'map',true)`, [org])), /FORBIDDEN/);
  await asUser(db, owner, `select set_org_feature($1,'map',true)`, [org]);
  await asUser(db, owner, `select set_org_feature($1,'map',true)`, [org]);
  assert.equal((await asUser(db, wk, `select enabled from org_features where feature='map'`)).rows[0].enabled, true);
  assert.equal((await asUser(db, other, `select count(*)::int n from org_features`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, owner, `select set_org_feature($1,'Bad Name',true)`, [org])), /INVALID_FEATURE/);
  assert.match(await expectError(asUser(db, owner, `update org_features set enabled=false`)), /permission denied/i);
});

test('vẽ ranh: chỉ chủ/quản lý; máy chủ tự tính diện tích khớp với app; đặt lại = cập nhật; xóa được', async () => {
  const { db, owner, wk, other } = await setup();
  const ring = sq(10, 106);
  await asUser(db, owner, `select set_area_boundary($1,$2::jsonb,'draw')`, [AREA, JSON.stringify(ring)]);
  const r = (await db.query(`select area_m2, point_count, center_lat from area_geo where area_id=$1`, [AREA])).rows[0];
  assert.equal(r.point_count, 4);
  assert.ok(Math.abs(Number(r.area_m2) - 10000) < 120, `diện tích ~10.000 m², được ${r.area_m2}`);
  assert.ok(Math.abs(Number(r.area_m2) - polygonAreaM2(ring)) < 1, 'máy chủ và app tính cùng công thức');
  await asUser(db, owner, `select set_area_boundary($1,$2::jsonb,'gps')`, [AREA, JSON.stringify(ring.slice(0, 3))]);
  assert.equal((await db.query(`select count(*)::int n from area_geo`)).rows[0].n, 1);
  assert.equal((await asUser(db, wk, `select count(*)::int n from area_geo`)).rows[0].n, 1);   // thành viên xem được
  assert.equal((await asUser(db, other, `select count(*)::int n from area_geo`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, wk, `select set_area_boundary($1,$2::jsonb)`, [AREA, JSON.stringify(ring)])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_area_boundary($1,$2::jsonb)`, [AREA, JSON.stringify(ring)])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, wk, `select clear_area_boundary($1)`, [AREA])), /FORBIDDEN/);
  await asUser(db, owner, `select clear_area_boundary($1)`, [AREA]);
  assert.equal((await db.query(`select count(*)::int n from area_geo`)).rows[0].n, 0);
});

test('ranh không hợp lệ bị từ chối; không ghi trực tiếp vào bảng', async () => {
  const { db, owner } = await setup();
  const call = (ring) => asUser(db, owner, `select set_area_boundary($1,$2::jsonb)`, [AREA, JSON.stringify(ring)]);
  assert.match(await expectError(call([[10, 106], [10.1, 106]])), /INVALID_GEO/);              // < 3 điểm
  assert.match(await expectError(call([[10, 106], [10.1, 106], [95, 106]])), /INVALID_GEO/);   // vĩ độ ngoài phạm vi
  assert.match(await expectError(call([[10, 106], [10.1, 106], [10.1]])), /INVALID_GEO/);      // điểm thiếu kinh độ
  assert.match(await expectError(call([[10, 106], [10.1, 106], ['a', 'b']])), /INVALID_GEO/);
  assert.match(await expectError(call(Array.from({ length: 201 }, (_, i) => [10 + i * 1e-5, 106 + (i % 2) * 1e-5]))), /INVALID_GEO/);
  assert.match(await expectError(asUser(db, owner, `insert into area_geo (area_id,organization_id,ring,point_count,area_m2,center_lat,center_lng) values ($1,(select organization_id from production_areas where id=$1),'[]',3,1,0,0)`, [AREA])), /permission denied/i);
});

test('logic hình học: tự cắt nhau, GeoJSON khép kín', () => {
  const bow = [[0, 0], [0.001, 0.001], [0.001, 0], [0, 0.001]];
  assert.equal(selfIntersects(bow), true);
  assert.equal(selfIntersects(sq(10, 106)), false);
  const g = toGeoJson(sq(10, 106));
  assert.deepEqual(g.geometry.coordinates[0][0], g.geometry.coordinates[0][4]);
  assert.equal(g.geometry.coordinates[0][0][0], 106);   // kinh độ trước
});
