import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0228 (D201): loại lần đọc ảnh 'timesheet' (bảng chấm công giấy): quyền, hạn mức dùng chung, loại cũ không đổi.

const ID = (n) => `78000000-0000-4000-8000-0000000000e${n}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), lead = await addUser(db, 3), emp = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[]), ($1,$4,array['worker']::member_role[])`, [org, mgr, lead, emp]);
  const wl = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Tổ trưởng') returning id`, [org, lead])).rows[0].id;
  await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Lan')`, [org, emp]);
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ('79000000-0000-4000-8000-0000000000e1',$1,'Tổ 1',$2)`, [org, wl]);
  // đủ lượt đọc để thử: gói dùng thử cho 2 lượt/tháng theo cấu hình mặc định; tăng lên cho dễ thử
  await db.query(`update platform_settings set value = '20'::jsonb where key = 'invoice_scan_trial_limit'`);
  return { db, owner, mgr, lead, emp, org };
}
const begin = (db, u, org, id, kind) => asUser(db, u, `select begin_invoice_scan($1,$2,1,$3) r`, [org, id, kind]).then((r) => r.rows[0].r);

test('chủ, quản lý, tổ trưởng đọc được bảng chấm công; nhân viên thường không', async () => {
  const { db, owner, mgr, lead, emp, org } = await setup();
  assert.equal((await begin(db, owner, org, ID(1), 'timesheet')).remaining, 19);
  await begin(db, mgr, org, ID(2), 'timesheet');
  await begin(db, lead, org, ID(3), 'timesheet');
  await assert.rejects(begin(db, emp, org, ID(4), 'timesheet'), /FORBIDDEN/);
});

test('loại đọc dùng chung hạn mức; gọi lặp cùng mã không tính thêm; loại lạ bị từ chối; lượt hết thì báo', async () => {
  const { db, owner, org } = await setup();
  await begin(db, owner, org, ID(1), 'timesheet');
  const again = await begin(db, owner, org, ID(1), 'timesheet');
  assert.equal(again.used, 1);
  await assert.rejects(begin(db, owner, org, ID(2), 'xyz'), /BAD_REQUEST/);
  await db.query(`update platform_settings set value = '1'::jsonb where key = 'invoice_scan_trial_limit'`);
  await assert.rejects(begin(db, owner, org, ID(3), 'timesheet'), /SCAN_LIMIT/);
});

test('lần đọc lỗi không tính vào hạn mức; loại hóa đơn và nhãn vẫn dùng được như cũ', async () => {
  const { db, owner, org } = await setup();
  await begin(db, owner, org, ID(1), 'timesheet');
  await asUser(db, owner, `select finish_invoice_scan($1,false,0,100,'m')`, [ID(1)]);
  assert.equal((await asUser(db, owner, `select get_invoice_scan_usage($1) r`, [org])).rows[0].r.used, 0);
  await begin(db, owner, org, ID(2), 'invoice');
  await begin(db, owner, org, ID(3), 'label');
  assert.equal((await asUser(db, owner, `select get_invoice_scan_usage($1) r`, [org])).rows[0].r.used, 2);
});
