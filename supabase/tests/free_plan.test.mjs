import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0232 (D218): gói Khởi đầu miễn phí 12 tháng: 1 phân khu, 1 ô, 1 nhân viên; đăng ký mới tự duyệt.

async function free() {
  const db = await createDb();
  await db.exec("update platform_settings set value = 'true'::jsonb where key in ('trial_scope_enabled','signup_auto_approve')");
  return db;
}

test('đăng ký tự duyệt: có cơ sở ngay, gói Khởi đầu 365 ngày', async () => {
  const db = await free();
  const u = await addUser(db, 1);
  await db.query(`select owner_signup_finalize($1,'0912345678','a@sdt.test','Chủ A','Trại A','household'::org_type,null)`, [u]);
  const o = (await db.query(`select status, organization_id from owner_signups where user_id=$1`, [u])).rows[0];
  assert.equal(o.status, 'approved');
  const s = (await db.query(`select is_scoped_trial, max_cycles, round(extract(epoch from period_end - period_start)/86400) d from subscriptions where organization_id=$1`, [o.organization_id])).rows[0];
  assert.deepEqual({ ...s, d: Number(s.d) }, { is_scoped_trial: true, max_cycles: 1, d: 365 });
});

test('tắt tự duyệt: đăng ký vẫn chờ duyệt như cũ', async () => {
  const db = await free();
  await db.exec("update platform_settings set value = 'false'::jsonb where key = 'signup_auto_approve'");
  const u = await addUser(db, 1);
  await db.query(`select owner_signup_finalize($1,'0912345678','a@sdt.test','Chủ A','Trại A','household'::org_type,null)`, [u]);
  assert.equal((await db.query(`select status from owner_signups where user_id=$1`, [u])).rows[0].status, 'pending');
});

test('gói Khởi đầu: 1 phân khu, 1 ô; nâng gói thì thêm được', async () => {
  const db = await free();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại B') id`)).rows[0].id;
  const A1 = '20000000-0000-4000-8000-0000000000f1', A2 = '20000000-0000-4000-8000-0000000000f2';
  const C1 = '20000000-0000-4000-8000-0000000000f3', C2 = '20000000-0000-4000-8000-0000000000f4';
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu 1')`, [A1, org]);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu 2')`, [A2, org]), /FREE_AREA_LIMIT/);
  await db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Ô 1',$3)`, [C1, org, A1]);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Ô 2',$3)`, [C2, org, A1]), /FREE_CELL_LIMIT/);
  await db.query(`update subscriptions set is_scoped_trial=false, status='active' where organization_id=$1`, [org]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu 2')`, [A2, org]);
});

test('gói Khởi đầu: chủ + 1 nhân viên; nhân viên thứ 2 bị chặn', async () => {
  const db = await free();
  const owner = await addUser(db, 1), w1 = await addUser(db, 2), w2 = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại C') id`)).rows[0].id;
  const add = (u) => db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, u]);
  await add(w1);
  await assert.rejects(add(w2), /FREE_STAFF_LIMIT/);
  await db.query(`update subscriptions set is_scoped_trial=false where organization_id=$1`, [org]);
  await add(w2);
});
