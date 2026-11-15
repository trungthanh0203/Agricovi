import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0206 (D169): công do chủ nhập được duyệt ngay; quản lý nhập vẫn chờ xác nhận.

const id = (n) => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('chủ nhập công: hợp lệ ngay (đủ số phút); quản lý nhập: chờ xác nhận; vẫn chặn trùng giờ', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  const ww = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Công nhân','self_hourly') returning id`, [org, wk])).rows[0].id;

  const a = (await asUser(db, owner, `select * from record_shift($1,$2,now() - interval '3 days', now() - interval '3 days' + interval '4 hours', 30)`, [id(1), ww])).rows[0];
  assert.deepEqual([a.status, a.approved_minutes, a.source], ['confirmed', 210, 'admin']);
  assert.ok(a.confirmed_at && a.confirmed_by);

  const b = (await asUser(db, mgr, `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '4 hours', 30)`, [id(2), ww])).rows[0];
  assert.deepEqual([b.status, b.approved_minutes], ['needs_confirmation', null]);

  assert.match(await expectError(asUser(db, owner, `select * from record_shift($1,$2,now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 0)`, [id(3), ww])), /DUPLICATE/);
});
