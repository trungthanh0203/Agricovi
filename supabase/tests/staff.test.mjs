import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError, uid } from './harness.mjs';

/** Mô phỏng Edge Function: precheck -> tạo user Auth -> finalize (chạy bằng quyền cao như service_role). */
async function createStaff(db, owner, org, phone, roles = ['worker'], name = 'Nguyễn Văn A', n = 50, mode = 'self_hourly', team = null) {
  const arr = `{${roles.join(',')}}`;
  const pre = (await db.query(`select phone, auth_email from staff_precheck($1,$2,$3,$4::member_role[])`, [owner, org, phone, arr])).rows[0];
  const id = uid(n);
  await db.query(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values ($1,$1,'authenticated','authenticated',$2,'hash-tam')`, [id, pre.auth_email]);
  await db.query(`select staff_finalize($1,$2,$3,$4,$5,$6,$7::member_role[],$8,$9)`, [owner, org, id, pre.phone, pre.auth_email, name, arr, mode, team]);
  return { id, ...pre };
}

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into production_areas (id, organization_id, name) values ('20000000-0000-4000-8000-0000000000cc',$1,'N1')`, [org]);
  return { db, owner, org };
}

test('chuẩn hóa số điện thoại và ghép email ẩn theo cấu hình tên miền', async () => {
  const { db } = await setup();
  const norm = async (p) => (await db.query(`select normalize_vn_phone($1) n`, [p])).rows[0].n;
  assert.equal(await norm('0912 345 678'), '0912345678');
  assert.equal(await norm('+84912345678'), '0912345678');
  assert.equal(await norm('84912345678'), '0912345678');
  assert.equal(await norm('0212345678'), null); // đầu số cố định không hợp lệ cho nhân viên
  assert.equal(await norm('12345'), null);

  assert.equal((await asAnon(db, `select login_email_for_phone('0912345678') e`)).rows[0].e, '0912345678@sdt.agricovi.com');
  await db.query(`update platform_settings set value = '"nongtrai.vn"' where key = 'login_email_domain'`);
  assert.equal((await asAnon(db, `select login_email_for_phone('0912345678') e`)).rows[0].e, '0912345678@sdt.nongtrai.vn');
});

test('đổi tên miền không làm hỏng đăng nhập của tài khoản đã tạo', async () => {
  const { db, owner, org } = await setup();
  const s = await createStaff(db, owner, org, '0912345678');
  await db.query(`update platform_settings set value = '"nongtrai.vn"' where key = 'login_email_domain'`);
  assert.equal((await asAnon(db, `select login_email_for_phone('0912345678') e`)).rows[0].e, s.auth_email);
  assert.match(s.auth_email, /@sdt\.agricovi\.com$/);
});

test('chỉ chủ cơ sở tạo được; số điện thoại trùng bị từ chối; người dùng thường không gọi được hàm tạo', async () => {
  const { db, owner, org } = await setup();
  const other = await addUser(db, 2);
  assert.match(await expectError(db.query(`select * from staff_precheck($1,$2,'0912345678','{worker}'::member_role[])`, [other, org])), /FORBIDDEN/);
  assert.match(await expectError(db.query(`select * from staff_precheck($1,$2,'abc','{worker}'::member_role[])`, [owner, org])), /INVALID_PHONE/);
  assert.match(await expectError(db.query(`select * from staff_precheck($1,$2,'0912345678','{owner}'::member_role[])`, [owner, org])), /INVALID_ROLE/);
  await createStaff(db, owner, org, '0912345678');
  assert.match(await expectError(db.query(`select * from staff_precheck($1,$2,'+84 912 345 678','{worker}'::member_role[])`, [owner, org])), /PHONE_IN_USE/);
  // người dùng đã đăng nhập không gọi được hàm dành cho Edge Function
  assert.match(await expectError(asUser(db, owner, `select * from staff_precheck($1,$2,'0987654321','{worker}'::member_role[])`, [owner, org])), /permission denied/);
  assert.match(await expectError(asAnon(db, `select * from staff_precheck($1,$2,'0987654321','{worker}'::member_role[])`, [owner, org])), /permission denied/);
});

test('nhân viên mới bị khóa dữ liệu tới khi ĐỔI mật khẩu thật sự; đổi xong thì vào được', async () => {
  const { db, owner, org } = await setup();
  const s = await createStaff(db, owner, org, '0912345678');

  const st = (await asUser(db, s.id, `select * from my_staff_status()`)).rows[0];
  assert.equal(st.is_staff, true);
  assert.equal(st.must_change, true);
  assert.equal(st.expired, false);

  // đang bị khóa: không thấy tổ chức, khu trồng, thành viên
  assert.equal((await asUser(db, s.id, `select count(*)::int n from organizations`)).rows[0].n, 0);
  assert.equal((await asUser(db, s.id, `select count(*)::int n from production_areas`)).rows[0].n, 0);

  // báo "đã đổi" mà chưa đổi thật => từ chối
  assert.match(await expectError(asUser(db, s.id, `select staff_password_changed()`)), /NOT_CHANGED/);
  assert.equal((await asUser(db, s.id, `select count(*)::int n from organizations`)).rows[0].n, 0);

  // đổi mật khẩu (Auth cập nhật băm), rồi xác nhận
  await db.query(`update auth.users set encrypted_password = 'hash-moi' where id = $1`, [s.id]);
  await asUser(db, s.id, `select staff_password_changed()`);
  assert.equal((await asUser(db, s.id, `select count(*)::int n from organizations`)).rows[0].n, 1);
  assert.equal((await asUser(db, s.id, `select count(*)::int n from production_areas`)).rows[0].n, 1);
  assert.equal((await asUser(db, s.id, `select must_change from my_staff_status()`)).rows[0].must_change, false);
});

test('mật khẩu tạm hết hạn: không mở khóa được, chủ đặt lại thì khóa lại và có hạn mới', async () => {
  const { db, owner, org } = await setup();
  const s = await createStaff(db, owner, org, '0912345678');
  await db.query(`update staff_accounts set temp_password_expires_at = now() - interval '1 day' where user_id = $1`, [s.id]);
  assert.equal((await asUser(db, s.id, `select expired from my_staff_status()`)).rows[0].expired, true);
  await db.query(`update auth.users set encrypted_password = 'hash-moi' where id = $1`, [s.id]);
  assert.match(await expectError(asUser(db, s.id, `select staff_password_changed()`)), /TEMP_EXPIRED/);
  assert.equal((await asUser(db, s.id, `select count(*)::int n from organizations`)).rows[0].n, 0);

  // chủ đặt lại: Auth đặt mật khẩu tạm mới rồi gọi staff_reset
  await db.query(`update auth.users set encrypted_password = 'hash-tam-2' where id = $1`, [s.id]);
  await db.query(`select staff_reset($1,$2,$3)`, [owner, org, s.id]);
  const st = (await asUser(db, s.id, `select must_change, expired from my_staff_status()`)).rows[0];
  assert.deepEqual(st, { must_change: true, expired: false });
  // người không phải chủ không đặt lại được
  const other = await addUser(db, 2);
  assert.match(await expectError(db.query(`select staff_reset($1,$2,$3)`, [other, org, s.id])), /FORBIDDEN/);
});

test('nhân viên đã mở khóa: có đúng vai trò, có hồ sơ lao động, không tự tạo cơ sở; chủ thấy danh sách kèm số điện thoại', async () => {
  const { db, owner, org } = await setup();
  const s = await createStaff(db, owner, org, '0912345678', ['worker'], 'Trần Thị B');
  await db.query(`update auth.users set encrypted_password = 'hash-moi' where id = $1`, [s.id]);
  await asUser(db, s.id, `select staff_password_changed()`);

  assert.deepEqual((await asUser(db, s.id, `select roles::text[] as roles from organization_memberships where user_id = auth.uid()`)).rows[0].roles, ['worker']);
  const wp = (await db.query(`select full_name, phone, work_mode, user_id from worker_profiles where user_id = $1`, [s.id])).rows[0];
  assert.deepEqual({ ...wp }, { full_name: 'Trần Thị B', phone: '0912345678', work_mode: 'self_hourly', user_id: s.id });

  assert.match(await expectError(asUser(db, s.id, `select create_organization('household','Hộ riêng')`)), /STAFF_ACCOUNT/);

  const list = (await asUser(db, owner, `select is_staff, phone, full_name, must_change_password, work_mode from list_org_members($1) where is_staff`, [org])).rows;
  assert.deepEqual(list, [{ is_staff: true, phone: '0912345678', full_name: 'Trần Thị B', must_change_password: false, work_mode: 'self_hourly' }]);
  // nhân viên không xem được danh sách tài khoản nhân viên
  assert.match(await expectError(asUser(db, s.id, `select * from list_org_members($1)`, [org])), /FORBIDDEN/);
});
