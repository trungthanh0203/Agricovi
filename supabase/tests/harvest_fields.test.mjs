import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

// Migration 0082 (D98, P1/M3): mã lô thu hoạch tự sinh, số đơn vị + dữ liệu form động, sự cố có nguyên nhân/loại mới,
// quy tắc kim gãy chưa xử lý => thu/bán phải ghi lý do (chỉ chạy khi vụ có sự cố kim gãy).

const AREA = '20000000-0000-4000-8000-0000000000d1';
const CYC = '30000000-0000-4000-8000-0000000000d1';
const CYC2 = '30000000-0000-4000-8000-0000000000d2';
const hid = (n) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iid = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng')`, [AREA, org]);
  const cyc = (c, code) => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,code) values ($1,$2,$3,(select id from crop_types limit 1),'active',$4)`, [c, org, AREA, code]);
  await cyc(CYC, 'LO-THIT-10');
  await cyc(CYC2, null);
  const harvest = (n, cyc = CYC, extra = '', cols = '') => db.query(
    `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity${cols}) values ($1,$2,$3,now(),10${extra})`, [hid(n), org, cyc]);
  const lot = async (n) => (await db.query(`select lot_code from harvest_records where id=$1`, [hid(n)])).rows[0].lot_code;
  const report = (n, kind, cause = null, cyc = CYC) => asUser(db, owner, `select report_incident($1,$2,$3,current_date,null,'medium','Mô tả',null,null,null,$4)`, [iid(n), cyc, kind, cause]);
  return { db, owner, org, harvest, lot, report };
}

test('mã lô thu hoạch tự sinh theo mã vụ + số thứ tự; vụ chưa có mã dùng VU-xxxxxx; không sửa được', async () => {
  const { db, harvest, lot } = await setup();
  await harvest(1); await harvest(2); await harvest(3, CYC2);
  assert.equal(await lot(1), 'LO-THIT-10/L01');
  assert.equal(await lot(2), 'LO-THIT-10/L02');
  assert.match(await lot(3), /^VU-[0-9A-F]{6}\/L01$/);
  assert.match(await expectError(db.query(`update harvest_records set lot_code='X' where id=$1`, [hid(1)])), /IMMUTABLE_FIELD/);
});

test('số đơn vị (quả/con) và dữ liệu form động lưu cùng phiếu; sửa qua update_harvest; extra phải là đối tượng', async () => {
  const { db, owner, harvest } = await setup();
  await harvest(1, CYC, `, 50, '{"brix": 13.8, "ear_tags": "A1,A2"}'::jsonb`, ',unit_count,extra');
  const r = (await db.query(`select unit_count, extra->>'brix' b from harvest_records where id=$1`, [hid(1)])).rows[0];
  assert.deepEqual(r, { unit_count: 50, b: '13.8' });
  await asUser(db, owner, `select update_harvest($1,1,$2,$3::jsonb)`, [hid(1), uid(901), JSON.stringify({ unit_count: 48, extra: { brix: 14.2 } })]);
  const u = (await db.query(`select unit_count, extra->>'brix' b, version from harvest_records where id=$1`, [hid(1)])).rows[0];
  assert.deepEqual(u, { unit_count: 48, b: '14.2', version: 2 });
  assert.match(await expectError(harvest(2, CYC, `, 0`, ',unit_count')), /check|unit_count/i);
  assert.match(await expectError(harvest(3, CYC, `, '[1]'::jsonb`, ',extra')), /check|extra/i);
});

test('sự cố: có nguyên nhân, loại thiết bị/chuồng và kim gãy; sửa nguyên nhân; loại lạ bị từ chối', async () => {
  const { db, owner, report } = await setup();
  await report(1, 'equipment', 'Quạt hỏng do chập điện');
  assert.equal((await db.query(`select cause from cycle_incidents where id=$1`, [iid(1)])).rows[0].cause, 'Quạt hỏng do chập điện');
  const v = (await db.query(`select version from cycle_incidents where id=$1`, [iid(1)])).rows[0].version;
  await asUser(db, owner, `select update_incident($1,$2,$3::jsonb)`, [iid(1), v, JSON.stringify({ cause: 'Đã thay quạt' })]);
  assert.equal((await db.query(`select cause from cycle_incidents where id=$1`, [iid(1)])).rows[0].cause, 'Đã thay quạt');
  assert.match(await expectError(report(2, 'khong_co')), /INVALID_KIND/);
});

test('kim gãy chưa xử lý: thu/bán phải ghi lý do; đóng sự cố hoặc vụ khác thì không bị hỏi', async () => {
  const { db, owner, harvest, report } = await setup();
  await harvest(1);                                   // chưa có sự cố: ghi bình thường
  await report(1, 'broken_needle', 'Kim gãy khi tiêm vaccine');
  assert.match(await expectError(harvest(2)), /NEEDLE_REASON/);
  assert.match(await expectError(db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values ($1,(select owner_org_id from production_cycles where id=$2),$2,current_date,5,1000)`, [hid(50), CYC])), /NEEDLE_REASON/);
  await harvest(3, CYC, `, 'Đã tìm thấy và xử lý con bị gãy kim'`, ',withdrawal_reason'); // có lý do thì ghi được
  await harvest(4, CYC2);                              // vụ khác không bị ảnh hưởng
  await asUser(db, owner, `select close_incident($1, 'Đã xử lý cá thể')`, [iid(1)]);
  await harvest(5);                                    // đã đóng: hết cảnh báo
});
