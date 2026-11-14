import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { measureAlerts, judge, customKeyFromLabel, parseNumber, metricDefs } from '../../apps/app/src/lib/measureLogic.ts';

// Migration 0195 (mục 6 báo cáo đối thủ): số đo nhập tay + ngưỡng cảnh báo. Ghi mới đi theo hàng đợi offline (ON CONFLICT DO NOTHING).

const AREA = '20000000-0000-4000-8000-0000000000e1';
const CYC = '30000000-0000-4000-8000-0000000000e1';
const rid = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Ao 1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  const add = (u, n, metric, value, at = 'now()') => asUser(db, u,
    `insert into measure_readings (id,cycle_id,organization_id,metric,value,measured_at,created_by,source)
     values ($1,$2,(select owner_org_id from production_cycles where id=$2),$3,$4,${at},$5,'offline') on conflict (id) do nothing`, [rid(n), CYC, metric, value, u]);
  return { db, owner, wk, other, org, org2, add };
}

test('nhân viên ghi số đo bằng hàng đợi offline; gửi lặp không nhân đôi; khu lấy từ vụ; người ngoài không ghi/không thấy', async () => {
  const { db, wk, other, add } = await setup();
  await add(wk, 1, 'ph', 7.8);
  await add(wk, 1, 'ph', 7.8);
  await add(wk, 2, 'salinity', 15);
  assert.equal((await db.query(`select count(*)::int n from measure_readings`)).rows[0].n, 2);
  assert.equal((await db.query(`select area_id from measure_readings where id=$1`, [rid(1)])).rows[0].area_id, AREA);
  assert.equal((await asUser(db, wk, `select count(*)::int n from measure_readings`)).rows[0].n, 2);
  assert.match(await expectError(add(other, 3, 'ph', 7)), /row-level|violates/i);
  assert.equal((await asUser(db, other, `select count(*)::int n from measure_readings`)).rows[0].n, 0);
  assert.match(await expectError(add(wk, 4, 'Độ mặn', 1)), /check/i);
  assert.match(await expectError(add(wk, 5, 'ph', 7, `now() + interval '3 days'`)), /INVALID_DATE/);
});

test('hủy số đo: cần lý do; người ngoài không hủy; không sửa/xóa trực tiếp', async () => {
  const { db, owner, wk, other, add } = await setup();
  await add(wk, 1, 'do', 2.1);
  assert.match(await expectError(asUser(db, other, `select void_measure_reading($1,'nhầm')`, [rid(1)])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, wk, `select void_measure_reading($1,'x')`, [rid(1)])), /INVALID_REASON/);
  await asUser(db, wk, `select void_measure_reading($1,'Đọc nhầm máy')`, [rid(1)]);
  assert.equal((await db.query(`select void_reason from measure_readings where id=$1`, [rid(1)])).rows[0].void_reason, 'Đọc nhầm máy');
  await add(owner, 2, 'do', 5);
  assert.match(await expectError(asUser(db, wk, `update measure_readings set value=9 where id=$1`, [rid(2)])), /permission denied/i);
  assert.match(await expectError(asUser(db, owner, `delete from measure_readings where id=$1`, [rid(2)])), /permission denied/i);
});

test('ngưỡng: chỉ chủ/quản lý đặt; nhân viên chỉ đọc; chỉ số riêng cần tên và đơn vị; thấp nhất ≤ cao nhất; cơ sở khác không thấy', async () => {
  const { db, owner, wk, other, org } = await setup();
  const set = (u, m, label, unit, lo, hi, active = true) => asUser(db, u, `select set_measure_limit($1,$2,$3,$4,$5,$6,$7)`, [org, m, label, unit, lo, hi, active]);
  assert.match(await expectError(set(wk, 'ph', null, null, 7, 8.5)), /FORBIDDEN/);
  assert.match(await expectError(set(other, 'ph', null, null, 7, 8.5)), /FORBIDDEN/);
  await set(owner, 'ph', null, null, 7, 8.5);
  await set(owner, 'ph', null, null, 7.2, 8.4);   // đặt lại = cập nhật, không nhân đôi
  assert.equal((await db.query(`select count(*)::int n from measure_limits`)).rows[0].n, 1);
  assert.match(await expectError(set(owner, 'ph', null, null, 9, 8)), /INVALID_RANGE/);
  assert.match(await expectError(set(owner, 'x_nh3', null, null, 0, 0.1)), /INVALID_METRIC/);
  await set(owner, 'x_nh3', 'NH3', 'mg/l', null, 0.1);
  assert.equal((await asUser(db, wk, `select count(*)::int n from measure_limits`)).rows[0].n, 2);
  assert.equal((await asUser(db, other, `select count(*)::int n from measure_limits`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, owner, `update measure_limits set min_value=0`)), /permission denied/i);
});

test('logic cảnh báo: chưa đặt ngưỡng thì không báo; chỉ xét số đo mới nhất; bỏ số đã hủy', () => {
  const limits = [{ metric: 'ph', min_value: 7, max_value: 8.5 }, { metric: 'do', min_value: 4, max_value: null }, { metric: 'ec', min_value: null, max_value: null }];
  assert.equal(judge(6.5, limits[0]), 'low');
  assert.equal(judge(9, limits[0]), 'high');
  assert.equal(judge(8, limits[0]), 'ok');
  assert.equal(judge(3, limits[1]), 'low');
  assert.equal(judge(99, limits[2]), null);
  assert.equal(judge(1, undefined), null);
  const rs = [
    { id: 'a', metric: 'ph', value: 6.5, measured_at: '2026-11-01T06:00:00Z' },
    { id: 'b', metric: 'ph', value: 7.8, measured_at: '2026-11-02T06:00:00Z' },   // mới hơn, đã ổn → không báo
    { id: 'c', metric: 'do', value: 2, measured_at: '2026-11-02T07:00:00Z' },
    { id: 'd', metric: 'do', value: 9, measured_at: '2026-11-03T07:00:00Z', voided_at: '2026-11-03T08:00:00Z' },  // đã hủy → bỏ qua
    { id: 'e', metric: 'ec', value: 50, measured_at: '2026-11-02T07:00:00Z' },
  ];
  const al = measureAlerts(rs, limits);
  assert.deepEqual(al.map((a) => [a.reading.id, a.verdict]), [['c', 'low']]);
  assert.equal(customKeyFromLabel('Đạm NH3 (mg/l)'), 'x_dam_nh3_mg_l');
  assert.equal(parseNumber('7,8'), 7.8);
  assert.equal(parseNumber('abc'), NaN);
  assert.ok(metricDefs([], 'aquatic').some((m) => m.key === 'salinity') && !metricDefs([], 'aquatic').some((m) => m.key === 'ec'));
  assert.ok(metricDefs([{ metric: 'x_nh3', label: 'NH3', unit: 'mg/l', min_value: null, max_value: 0.1 }], 'aquatic').some((m) => m.key === 'x_nh3'));
});
