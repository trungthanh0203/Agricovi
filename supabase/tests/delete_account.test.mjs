import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser } from './harness.mjs';

// supabase/maintenance/delete_account.sql: xóa tài khoản + cơ sở + dữ liệu liên quan; xem trước không xóa; giữ nguyên dữ liệu người khác.
const read = (f) => readFileSync(new URL(`../maintenance/${f}`, import.meta.url), 'utf8');
const del = (confirm) => read('delete_account.sql').replace("'nguyentruonggiang123@gmail.com'", "'u1@test.local'").replace("v_confirm constant text := 'KHONG'", `v_confirm constant text := '${confirm}'`);
const sample = (f, from, mode) => read(f).replace(`'${from}'`, "'u1@test.local'");
const one = async (db, sql) => (await db.query(sql)).rows[0];

test('xóa tài khoản chủ HTX và mọi thứ liên quan; người khác và hộ độc lập giữ nguyên', async () => {
  const db = await createDb();
  const target = await addUser(db, 1), farmer = await addUser(db, 2), staff = await addUser(db, 3), other = await addUser(db, 4);
  const coop = (await asUser(db, target, `select create_organization('cooperative','HTX cần xóa') id`)).rows[0].id;
  const managed = (await asUser(db, target, `select create_member_household($1,'Hộ do HTX tạo') id`, [coop])).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ độc lập') id`)).rows[0].id;
  const inv = (await asUser(db, target, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv, hh]);
  // nhân viên (tài khoản số điện thoại) của HTX
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [coop, staff]);
  await db.query(`insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name) values ($1,$2,'0912345678','0912345678@sdt.test','Nhân viên')`, [staff, coop]);
  // tài khoản đích còn là thành viên của cơ sở của người khác và có dấu vết trong dữ liệu ở đó
  const otherOrg = (await asUser(db, other, `select create_organization('household','Cơ sở người khác') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [otherOrg, target]);
  await db.query(`insert into production_areas (id,organization_id,name,created_by) values ('a0000000-0000-4000-8000-000000000001',$1,'Khu của người khác',$2)`, [otherOrg, target]);
  await db.query(`insert into organization_invitations (organization_id,email,roles,invited_by) values ($1,'u1@test.local',array['worker']::member_role[],$2)`, [otherOrg, other]);

  // dữ liệu: đủ bộ mẫu (bản nhỏ + lớn + hộ) trong HTX và hộ do HTX tạo; hộ độc lập có dữ liệu riêng
  await db.exec(sample('seed_sample_htx.sql', 'trungthanhfx23@gmail.com'));
  await db.exec(sample('seed_sample_htx_coso_lon.sql', 'plaumai.tnb@gmail.com'));
  await db.exec(sample('seed_sample_htx_ho.sql', 'plaumai.tnb@gmail.com'));
  await db.query(`insert into production_areas (id,organization_id,name) values ('a0000000-0000-4000-8000-000000000009',$1,'Vườn hộ độc lập')`, [hh]);
  await db.query(`insert into expense_records (id,organization_id,category,kind,amount,expense_date) values ('e0000000-0000-4000-8000-000000000009',$1,'other','cash_paid',500,current_date)`, [hh]);

  const snap = async () => one(db, `select
    (select count(*)::int from organizations) orgs, (select count(*)::int from auth.users) users,
    (select count(*)::int from production_cycles) cycles, (select count(*)::int from activity_logs) logs,
    (select count(*)::int from procurement_receipts) receipts, (select count(*)::int from inventory_transactions) txns,
    (select count(*)::int from cooperative_memberships) coopm`);
  const before = await snap();
  assert.ok(before.cycles > 200 && before.logs > 5000 && before.receipts > 30, JSON.stringify(before));

  // xem trước: không đổi gì
  await db.exec(del('KHONG'));
  assert.deepEqual(await snap(), before);

  // xóa thật
  await db.exec(del('XOA-TAI-KHOAN'));
  const after = await snap();
  assert.equal((await one(db, `select count(*)::int n from auth.users where id in ('${target}','${staff}')`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from auth.users where id in ('${farmer}','${other}')`)).n, 2);
  assert.equal((await one(db, `select count(*)::int n from organizations where id in ('${coop}','${managed}')`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from organizations where id in ('${hh}','${otherOrg}')`)).n, 2);
  assert.equal(after.orgs, 2); assert.equal(after.users, 2);
  assert.deepEqual([after.receipts, after.coopm], [0, 0]);
  // còn lại chỉ là vụ, nhật ký, giao dịch kho của HỘ ĐỘC LẬP (vụ riêng từ bộ mẫu hộ), không còn gì của HTX/hộ đã xóa
  assert.ok(after.cycles > 0 && after.logs > 0 && after.txns > 0);
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id <> '${hh}'`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from activity_logs where organization_id <> '${hh}'`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from inventory_transactions where organization_id <> '${hh}'`)).n, 0);
  // dữ liệu hộ độc lập và cơ sở người khác còn nguyên; dấu vết người tạo ở cơ sở khác được bỏ liên kết
  assert.equal((await one(db, `select count(*)::int n from production_areas where organization_id='${hh}'`)).n, 4);   // 1 phân khu + 2 nhà màng của bộ mẫu hộ + 1 khu tự thêm
  assert.equal((await one(db, `select count(*)::int n from expense_records where id='e0000000-0000-4000-8000-000000000009'`)).n, 1);
  const area = await one(db, `select created_by from production_areas where id='a0000000-0000-4000-8000-000000000001'`);
  assert.equal(area.created_by, null);
  // không còn dòng nào của cơ sở/ người đã xóa ở BẤT KỲ bảng nào của schema public
  const tabs = (await db.query(`select table_name t, column_name c from information_schema.columns where table_schema='public' and column_name in ('organization_id','owner_org_id','cooperative_org_id','household_org_id','user_id','created_by') and table_name not like 'pg_%'`)).rows;
  for (const { t, c } of tabs) {
    const n = (await one(db, `select count(*)::int n from ${t} where ${c} in ('${coop}','${managed}','${target}','${staff}')`)).n;
    assert.equal(n, 0, `${t}.${c} còn ${n} dòng`);
  }
  // lời mời gửi tới email đã bị xóa; đăng ký lại từ đầu được
  assert.equal((await one(db, `select count(*)::int n from organization_invitations where lower(email)='u1@test.local'`)).n, 0);
  const again = await addUser(db, 7);
  await db.query(`update auth.users set email='u1@test.local' where id='${again}'`);
  const org2 = (await asUser(db, again, `select create_organization('cooperative','HTX đăng ký lại') id`)).rows[0].id;
  assert.ok(org2);
});

test('từ chối xóa tài khoản quản trị nền tảng; email không tồn tại thì không làm gì', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await assert.rejects(db.exec(del('XOA-TAI-KHOAN')), /quản trị nền tảng/);
  await db.query(`delete from platform_admins`);
  await db.exec(del('XOA-TAI-KHOAN').replace("'u1@test.local'", "'khong-ton-tai@x.vn'"));   // không có tài khoản: chỉ báo
  assert.equal((await one(db, `select count(*)::int n from auth.users`)).n, 1);
});
