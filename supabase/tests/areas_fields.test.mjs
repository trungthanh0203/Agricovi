import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0080 (D98, P1/M1): mã + loại + kiểu chuồng của khu; mã lô/đơn vị đếm/cán bộ phụ trách của vụ; ghi việc cho khu không gắn vụ.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1), AREA_B = id('2', 2), FAC = id('2', 3), CYC = id('3', 1), CYC2 = id('3', 2);
const wt = `(select id from work_types limit 1)`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Cơ sở B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name,code,housing) values ($1,$2,'Dãy thịt 2','C-THIT-02','semi_open')`, [AREA, org]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Dãy thịt 3')`, [AREA_B, org]);
  await db.query(`insert into production_areas (id,organization_id,name,kind) values ($1,$2,'Cổng chính','facility')`, [FAC, org]);
  const cyc = (c, a, code) => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,code) values ($1,$2,$3,(select id from crop_types limit 1),'active',$4)`, [c, org, a, code]);
  return { db, owner, wk, other, org, org2, cyc };
}

test('mã khu duy nhất trong cơ sở (không phân biệt hoa thường); kiểu nhà/chuồng tối đa 40 ký tự', async () => {
  const { db, org, org2 } = await setup();
  assert.match(await expectError(db.query(`insert into production_areas (id,organization_id,name,code) values (gen_random_uuid(),$1,'X','c-thit-02')`, [org])), /production_areas_code_uq|duplicate/i);
  await db.query(`insert into production_areas (id,organization_id,name,code) values (gen_random_uuid(),$1,'Y','C-THIT-02')`, [org2]); // cơ sở khác dùng lại được
  assert.match(await expectError(db.query(`insert into production_areas (id,organization_id,name,housing) values (gen_random_uuid(),$1,'Z',repeat('x',41))`, [org])), /check|housing/i);
});

test('khu cơ sở vật chất không tạo được vụ; khu đã có vụ không đổi thành cơ sở vật chất', async () => {
  const { db, cyc } = await setup();
  assert.match(await expectError(cyc(CYC, FAC, null)), /FACILITY_AREA/);
  await cyc(CYC, AREA, null);
  assert.match(await expectError(db.query(`update production_areas set kind='facility' where id=$1`, [AREA])), /AREA_HAS_CYCLES/);
  await db.query(`update production_areas set kind='facility' where id=$1`, [AREA_B]); // khu chưa có vụ đổi được
});

test('set_cycle_ext: đặt mã lô, đơn vị đếm, cán bộ phụ trách; mã trùng bị từ chối; nhân viên không sửa được', async () => {
  const { db, owner, wk, cyc } = await setup();
  await cyc(CYC, AREA, 'LO-THIT-09');
  await cyc(CYC2, AREA_B, null);
  await asUser(db, owner, `select set_cycle_ext($1,'LO-THIT-10','con','Thú y Nam','0900000000')`, [CYC2]);
  const r = (await db.query(`select code,count_unit,supervisor_name,supervisor_phone from production_cycles where id=$1`, [CYC2])).rows[0];
  assert.deepEqual(r, { code: 'LO-THIT-10', count_unit: 'con', supervisor_name: 'Thú y Nam', supervisor_phone: '0900000000' });
  assert.match(await expectError(asUser(db, owner, `select set_cycle_ext($1,'lo-thit-09',null,null,null)`, [CYC2])), /DUPLICATE_CODE/);
  assert.match(await expectError(asUser(db, wk, `select set_cycle_ext($1,'A',null,null,null)`, [CYC2])), /FORBIDDEN/);
  await asUser(db, owner, `select set_cycle_ext($1,'  ',null,'',null)`, [CYC2]); // trống = bỏ
  assert.equal((await db.query(`select code from production_cycles where id=$1`, [CYC2])).rows[0].code, null);
});

test('ghi việc cho khu không gắn vụ: nhân viên ghi được; sai cơ sở hoặc ngoài phạm vi trang trại bị chặn', async () => {
  const { db, owner, wk, org, org2 } = await setup();
  const ins = (u, n, o, a) => asUser(db, u, `insert into activity_logs (id,organization_id,area_id,work_type_id,performed_at,created_by,source)
    values ($1,$2,$3,${wt},now(),$4,'online')`, [id('a', n), o, a, u]);
  await ins(wk, 1, org, FAC); // thay thuốc hố sát trùng ở Cổng chính, không có vụ
  assert.equal((await asUser(db, wk, `select count(*)::int n from activity_logs where area_id=$1 and cycle_id is null`, [FAC])).rows[0].n, 1);
  assert.match(await expectError(ins(owner, 2, org2, FAC)), /INVALID_AREA|row-level|FORBIDDEN/i);
  await asUser(db, owner, `select set_member_areas($1,$2,$3::uuid[])`, [org, wk, [AREA]]);
  assert.match(await expectError(ins(wk, 3, org, FAC)), /FORBIDDEN|row-level/i);
  await ins(wk, 4, org, AREA); // trong phạm vi được giao thì ghi được
});
