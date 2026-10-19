import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

const HH_A = '10000000-0000-4000-8000-00000000000a';
const HH_B = '10000000-0000-4000-8000-00000000000b';
const HTX = '10000000-0000-4000-8000-0000000000c1';
const AREA_A = '20000000-0000-4000-8000-00000000000a';
const cropId = `(select id from crop_types where code='melon')`;
const wtype = `(select id from work_types where code='irrigation')`;

async function setup() {
  const db = await createDb();
  const a = await addUser(db, 1); // chủ hộ A
  const b = await addUser(db, 2); // chủ hộ B
  const c = await addUser(db, 3); // chủ HTX
  const w = await addUser(db, 4); // nhân viên của hộ A
  await db.query(`insert into organizations (id,type,name,created_by) values ($1,'household','Hộ A',$4),($2,'household','Hộ B',$5),($3,'cooperative','HTX',$6)`,
    [HH_A, HH_B, HTX, a, b, c]);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [HH_A, w]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA_A, HH_A]);
  await db.query(`insert into cooperative_memberships (household_org_id,cooperative_org_id,status,joined_at) values ($1,$2,'active',now())`, [HH_A, HTX]);
  return { db, a, b, c, w };
}

test('hộ tạo vụ riêng: HTX KHÔNG thấy; vụ ghi theo HTX: HTX thấy', async () => {
  const { db, a, c } = await setup();
  const own = '30000000-0000-4000-8000-000000000001';
  const coop = '30000000-0000-4000-8000-000000000002';
  await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`, [own, HH_A, AREA_A]);
  await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`, [coop, HTX, AREA_A]);

  const seenByHtx = (await asUser(db, c, `select id from production_cycles`)).rows.map((r) => r.id);
  assert.deepEqual(seenByHtx, [coop]);
  const seenByHousehold = (await asUser(db, a, `select id from production_cycles order by id`)).rows.map((r) => r.id);
  assert.deepEqual(seenByHousehold, [own, coop]);
});

test('hạn mức tính theo chủ vụ: vụ HTX dùng quỹ HTX, vụ riêng dùng gói hộ', async () => {
  const { db, a } = await setup();
  // gói hộ 2 vụ riêng; tạo 2 vụ riêng + 3 vụ của HTX (quỹ HTX 5) đều được
  for (let i = 1; i <= 2; i++)
    await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`,
      [`30000000-0000-4000-8000-00000000010${i}`, HH_A, AREA_A]);
  for (let i = 1; i <= 3; i++)
    await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`,
      [`30000000-0000-4000-8000-00000000020${i}`, HTX, AREA_A]);
  const msg = await expectError(asUser(db, a,
    `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-000000000301',$1,$2,${cropId},'active')`, [HH_A, AREA_A]));
  assert.match(msg, /QUOTA_EXCEEDED/);
});

test('hộ không ghi được vụ theo HTX mà mình không phải thành viên; người ngoài bị chặn', async () => {
  const { db, b } = await setup();
  const areaB = '20000000-0000-4000-8000-00000000000b';
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu B')`, [areaB, HH_B]);
  const msg = await expectError(asUser(db, b,
    `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-000000000401',$1,$2,${cropId},'active')`, [HTX, areaB]));
  assert.match(msg, /row-level security/);
  const msg2 = await expectError(asUser(db, b,
    `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-000000000402',$1,$2,${cropId},'active')`, [HH_B, AREA_A]));
  assert.match(msg2, /row-level security/);
});

test('nhật ký: nhân viên ghi được, ghi lặp cùng id không trùng; organization_id do máy chủ gán', async () => {
  const { db, a, w, b } = await setup();
  const cyc = '30000000-0000-4000-8000-000000000001';
  await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`, [cyc, HH_A, AREA_A]);
  const logId = '40000000-0000-4000-8000-000000000001';
  const ins = `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,source)
               values ($1,$2,$3,${wtype},now(),$4,'offline') on conflict (id) do nothing`;
  // gửi sai organization_id (HH_B) -> bị ghi đè đúng chủ vụ
  await asUser(db, w, ins, [logId, HH_B, cyc, w]);
  await asUser(db, w, ins, [logId, HH_B, cyc, w]); // đồng bộ lặp
  const rows = (await db.query(`select organization_id from activity_logs`)).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization_id, HH_A);
  // hộ B không thấy
  assert.equal((await asUser(db, b, `select count(*)::int n from activity_logs`)).rows[0].n, 0);
  // không ai xóa được nhật ký (chỉ hủy có lý do)
  const del = await asUser(db, w, `delete from activity_logs where id=$1 returning id`, [logId]).catch((e) => e);
  assert.ok(del instanceof Error || del.rows.length === 0);
  // người ngoài cơ sở không sửa được; chính người ghi sửa được bản ghi của mình trong 24 giờ (bước B, giả định A10)
  assert.equal((await asUser(db, b, `update activity_logs set note='x' where id=$1 returning id`, [logId])).rows.length, 0);
  assert.equal((await asUser(db, w, `update activity_logs set note='x' where id=$1 returning id`, [logId])).rows.length, 1);
});

test('sửa nhật ký bởi quản lý để lại audit trước/sau và tăng version', async () => {
  const { db, a, w } = await setup();
  const cyc = '30000000-0000-4000-8000-000000000001';
  await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`, [cyc, HH_A, AREA_A]);
  const logId = '40000000-0000-4000-8000-000000000002';
  await asUser(db, w, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,note)
                       values ($1,$2,$3,${wtype},now(),$4,'cũ')`, [logId, HH_A, cyc, w]);
  await asUser(db, a, `update activity_logs set note='mới' where id=$1`, [logId]);
  const r = await db.query(`select version, note from activity_logs where id=$1`, [logId]);
  assert.equal(r.rows[0].version, 2);
  const audit = await db.query(`select before->>'note' b, after->>'note' a from audit_events where entity='activity_logs' and action='UPDATE'`);
  assert.equal(audit.rows[0].b, 'cũ');
  assert.equal(audit.rows[0].a, 'mới');
});

test('audit không sửa/xóa được; người dùng không ghi audit trực tiếp', async () => {
  const { db, a } = await setup();
  const msg = await expectError(db.query(`delete from audit_events`));
  assert.match(msg, /AUDIT_IMMUTABLE/);
  const m2 = await expectError(asUser(db, a, `insert into audit_events (action, entity) values ('x','y')`));
  assert.match(m2, /permission denied|row-level security/);
});
