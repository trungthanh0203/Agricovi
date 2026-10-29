import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0134: chủ cơ sở đăng ký bằng số điện thoại (không email), chờ quản trị nền tảng duyệt rồi mới có cơ sở.

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await db.query(`insert into plan_tiers (org_type, name, max_cycles, price_per_quarter, ranking_weight, is_trial_default, is_active)
                  values ('household','Dùng thử',2,0,1,true,true) on conflict do nothing`);
  let n = 10;
  // Edge Function: kiểm tra rồi ghi (giả lập bằng quyền service)
  const signup = async (phone, { name = 'Chị Lan', org = 'Vườn nhà Lan', type = 'household', ip = 'ip-1' } = {}) => {
    const pre = (await db.query(`select * from owner_signup_precheck($1,$2)`, [phone, ip])).rows[0];
    const user = await addUser(db, ++n);
    const id = (await db.query(`select owner_signup_finalize($1,$2,$3,$4,$5,$6::org_type,$7) id`, [user, pre.phone, pre.auth_email, name, org, type, ip])).rows[0].id;
    return { user, id, pre };
  };
  return { db, admin, signup };
}

test('đăng ký: số điện thoại chuẩn hóa thành email ẩn giống nhân viên; trùng số bị từ chối; sai định dạng bị từ chối', async () => {
  const { db, signup } = await setup();
  const a = await signup('0912 345 678');
  assert.equal(a.pre.phone, '0912345678'); assert.match(a.pre.auth_email, /^0912345678@sdt\./);
  assert.equal((await db.query(`select login_email_for_phone('0912345678') e`)).rows[0].e, a.pre.auth_email);   // đăng nhập bằng số điện thoại dùng được ngay
  assert.match(await expectError(db.query(`select * from owner_signup_precheck('0912345678','ip-2')`)), /PHONE_IN_USE/);
  assert.match(await expectError(db.query(`select * from owner_signup_precheck('123','ip-2')`)), /INVALID_PHONE/);
});

test('giới hạn đăng ký theo mạng (3 lần mỗi giờ); nhiều mạng khác nhau thì không bị giới hạn', async () => {
  const { db, signup } = await setup();
  await signup('0911111111', { ip: 'x' }); await signup('0922222222', { ip: 'x' }); await signup('0933333333', { ip: 'x' });
  assert.match(await expectError(db.query(`select * from owner_signup_precheck('0944444444','x')`)), /RATE_LIMIT/);
  assert.equal((await db.query(`select * from owner_signup_precheck('0944444444','y')`)).rows.length, 1);
  await db.query(`update owner_signups set created_at = now() - interval '2 hours'`);
  assert.equal((await db.query(`select * from owner_signup_precheck('0944444444','x')`)).rows.length, 1);       // qua 1 giờ thì được lại
});

test('chờ duyệt: người đăng ký xem được trạng thái của mình, chưa có cơ sở và không tự tạo cơ sở được', async () => {
  const { db, signup } = await setup();
  const a = await signup('0912345678');
  const st = (await asUser(db, a.user, `select my_owner_signup() s`)).rows[0].s;
  assert.deepEqual([st.status, st.org_name, st.phone], ['pending', 'Vườn nhà Lan', '0912345678']);
  assert.match(await expectError(asUser(db, a.user, `select create_organization('household','Cơ sở lách')`)), /PENDING_APPROVAL/);
  assert.equal((await db.query(`select count(*)::int c from organizations`)).rows[0].c, 0);
  // người khác không thấy đăng ký của mình
  const b = await signup('0987654321');
  assert.equal((await asUser(db, b.user, `select count(*)::int c from owner_signups`)).rows[0].c, 1);
  assert.equal((await asUser(db, await addUser(db, 99), `select my_owner_signup() s`)).rows[0].s, null);
});

test('duyệt: quản trị nền tảng tạo cơ sở cho người đăng ký (chủ, có gói dùng thử); người thường không duyệt được; không duyệt hai lần', async () => {
  const { db, admin, signup } = await setup();
  const a = await signup('0912345678', { org: 'Vườn nhà Lan', type: 'household' });
  assert.match(await expectError(asUser(db, a.user, `select admin_decide_signup($1,true)`, [a.id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, a.user, `select admin_list_signups()`)), /FORBIDDEN/);
  const list = (await asUser(db, admin, `select admin_list_signups('pending') r`)).rows[0].r;
  assert.equal(list.length, 1); assert.equal(list[0].phone, '0912345678');
  const org = (await asUser(db, admin, `select admin_decide_signup($1,true) o`, [a.id])).rows[0].o;
  const o = (await db.query(`select name, type::text t, created_by from organizations where id=$1`, [org])).rows[0];
  assert.deepEqual([o.name, o.t, o.created_by], ['Vườn nhà Lan', 'household', a.user]);
  assert.equal((await db.query(`select count(*)::int c from organization_memberships where organization_id=$1 and user_id=$2 and status='active'`, [org, a.user])).rows[0].c, 1);
  assert.equal((await db.query(`select count(*)::int c from subscriptions where organization_id=$1`, [org])).rows[0].c, 1);
  const st = (await asUser(db, a.user, `select my_owner_signup() s`)).rows[0].s;
  assert.equal(st.status, 'approved');
  assert.match(await expectError(asUser(db, admin, `select admin_decide_signup($1,true)`, [a.id])), /ALREADY_DECIDED/);
  assert.equal((await db.query(`select count(*)::int c from audit_events where action='approve_signup'`)).rows[0].c, 1);
});

test('từ chối: cần lý do, người đăng ký thấy lý do và vẫn không tự tạo cơ sở được', async () => {
  const { db, admin, signup } = await setup();
  const a = await signup('0912345678');
  assert.match(await expectError(asUser(db, admin, `select admin_decide_signup($1,false,'')`, [a.id])), /REASON_REQUIRED/);
  await asUser(db, admin, `select admin_decide_signup($1,false,'Không liên hệ được qua Zalo')`, [a.id]);
  const st = (await asUser(db, a.user, `select my_owner_signup() s`)).rows[0].s;
  assert.deepEqual([st.status, st.note], ['rejected', 'Không liên hệ được qua Zalo']);
  assert.match(await expectError(asUser(db, a.user, `select create_organization('household','X lách')`)), /PENDING_APPROVAL/);
  assert.equal((await asUser(db, admin, `select jsonb_array_length(admin_list_signups('rejected')) n`)).rows[0].n, 1);
});

test('quyền thực thi: khách không gọi được; hàm cho Edge Function không cấp cho người dùng đã đăng nhập; kiểm tra quản trị cho đặt lại mật khẩu', async () => {
  const { db, admin, signup } = await setup();
  const a = await signup('0912345678');
  assert.match(await expectError(asAnon(db, `select my_owner_signup()`)), /permission denied/);
  assert.match(await expectError(asAnon(db, `select * from owner_signup_precheck('0911111111','z')`)), /permission denied/);
  assert.match(await expectError(asUser(db, a.user, `select * from owner_signup_precheck('0911111111','z')`)), /permission denied/);
  // kiểm tra quản trị (cho hành động đặt lại mật khẩu): chỉ quản trị viên, chỉ đăng ký đã duyệt
  assert.match(await expectError(db.query(`select * from owner_signup_admin_check($1,$2)`, [a.user, a.id])), /FORBIDDEN/);
  assert.equal((await db.query(`select * from owner_signup_admin_check($1,$2)`, [admin, a.id])).rows.length, 0);   // chưa duyệt
  await asUser(db, admin, `select admin_decide_signup($1,true)`, [a.id]);
  assert.deepEqual((await db.query(`select * from owner_signup_admin_check($1,$2)`, [admin, a.id])).rows[0], { user_id: a.user, phone: '0912345678' });
});
