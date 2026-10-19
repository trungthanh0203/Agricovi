import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

const ORG_A = '10000000-0000-4000-8000-00000000000a';
const ORG_B = '10000000-0000-4000-8000-00000000000b';
const HTX1 = '10000000-0000-4000-8000-0000000000c1';
const HTX2 = '10000000-0000-4000-8000-0000000000c2';
const AREA_A = '20000000-0000-4000-8000-00000000000a';

async function setup() {
  const db = await createDb();
  const a = await addUser(db, 1); // chủ hộ A
  const b = await addUser(db, 2); // chủ hộ B
  const c = await addUser(db, 3); // chủ HTX 1
  await db.query(`insert into organizations (id, type, name, created_by) values
    ($1,'household','Hộ A',$4), ($2,'household','Hộ B',$5), ($3,'cooperative','HTX 1',$6)`,
    [ORG_A, ORG_B, HTX1, a, b, c]);
  await db.query(`insert into production_areas (id, organization_id, name) values ($1,$2,'Nhà màng 1')`, [AREA_A, ORG_A]);
  return { db, a, b, c };
}

const crop = `(select id from crop_types where code='melon')`;
const cycle = (db, id, org, area, status) =>
  db.query(`insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
            values ($1,$2,$3,${crop},$4)`, [id, org, area, status]);

test('tổ chức mới tự có gói dùng thử và chủ là owner', async () => {
  const { db } = await setup();
  const r = await db.query(`select status, max_cycles from subscriptions where organization_id = $1`, [ORG_A]);
  assert.equal(r.rows[0].status, 'trial');
  assert.equal(r.rows[0].max_cycles, 2);
  const h = await db.query(`select status, max_cycles from subscriptions where organization_id = $1`, [HTX1]);
  assert.equal(h.rows[0].max_cycles, 5);
});

test('hạn mức vụ: vụ thứ 3 bị từ chối, vụ chuẩn bị không tính', async () => {
  const { db } = await setup();
  const c1 = '30000000-0000-4000-8000-000000000001';
  const c2 = '30000000-0000-4000-8000-000000000002';
  const c3 = '30000000-0000-4000-8000-000000000003';
  await cycle(db, c1, ORG_A, AREA_A, 'active');
  await cycle(db, c2, ORG_A, AREA_A, 'paused'); // tạm dừng vẫn tính
  await cycle(db, c3, ORG_A, AREA_A, 'preparing'); // không tính
  const msg = await expectError(db.query(`update production_cycles set status='active' where id=$1`, [c3]));
  assert.match(msg, /QUOTA_EXCEEDED/);
  await db.query(`update production_cycles set status='ended' where id=$1`, [c1]);
  await db.query(`update production_cycles set status='active' where id=$1`, [c3]); // giờ được
});

test('hạn mức không lách được qua RLS/API trực tiếp', async () => {
  const { db, a } = await setup();
  await cycle(db, '30000000-0000-4000-8000-000000000001', ORG_A, AREA_A, 'active');
  await cycle(db, '30000000-0000-4000-8000-000000000002', ORG_A, AREA_A, 'active');
  const msg = await expectError(asUser(db, a,
    `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
     values ('30000000-0000-4000-8000-000000000009', $1, $2, ${crop}, 'active')`, [ORG_A, AREA_A]));
  assert.match(msg, /QUOTA_EXCEEDED/);
});

test('hết hạn gói: không tạo được vụ mới nhưng vẫn đọc dữ liệu', async () => {
  const { db, a } = await setup();
  await cycle(db, '30000000-0000-4000-8000-000000000001', ORG_A, AREA_A, 'active');
  await db.query(`update subscriptions set period_start = now() - interval '60 days', period_end = now() - interval '1 day' where organization_id=$1`, [ORG_A]);
  const msg = await expectError(cycle(db, '30000000-0000-4000-8000-000000000002', ORG_A, AREA_A, 'active'));
  assert.match(msg, /QUOTA_NO_SUBSCRIPTION/);
  const r = await asUser(db, a, `select count(*)::int n from production_cycles`);
  assert.equal(r.rows[0].n, 1);
});

test('mỗi hộ chỉ thuộc một HTX hoạt động', async () => {
  const { db } = await setup();
  const c = await addUser(db, 4);
  await db.query(`insert into organizations (id, type, name, created_by) values ($1,'cooperative','HTX 2',$2)`, [HTX2, c]);
  await db.query(`insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at) values ($1,$2,'active',now())`, [ORG_A, HTX1]);
  const msg = await expectError(db.query(
    `insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at) values ($1,$2,'active',now())`, [ORG_A, HTX2]));
  assert.match(msg, /one_active_coop_per_household|duplicate key/);
});

test('cách ly dữ liệu giữa tổ chức', async () => {
  const { db, a, b } = await setup();
  await cycle(db, '30000000-0000-4000-8000-000000000001', ORG_A, AREA_A, 'active');
  const asB = await asUser(db, b, `select count(*)::int n from production_cycles`);
  assert.equal(asB.rows[0].n, 0);
  const orgs = await asUser(db, b, `select count(*)::int n from organizations`);
  assert.equal(orgs.rows[0].n, 1); // chỉ thấy Hộ B
  const sub = await asUser(db, a, `select count(*)::int n from subscriptions`);
  assert.equal(sub.rows[0].n, 1);
});

test('chủ hộ không tự sửa được gói của mình', async () => {
  const { db, a } = await setup();
  const r = await asUser(db, a, `update subscriptions set max_cycles = 999 where organization_id=$1 returning id`, [ORG_A]);
  assert.equal(r.rows.length, 0); // RLS chặn: 0 hàng bị sửa
  const s = await db.query(`select max_cycles from subscriptions where organization_id=$1`, [ORG_A]);
  assert.equal(s.rows[0].max_cycles, 2);
});
