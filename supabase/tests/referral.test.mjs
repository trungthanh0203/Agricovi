import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0159 (D131): mã giới thiệu, đối tác, hoa hồng.

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), a = await addUser(db, 2), b = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const partner = (data) => asUser(db, admin, `select admin_partner_save(null, $1::jsonb) id`, [JSON.stringify(data)]).then((r) => r.rows[0].id);
  const makeOrg = (u, name, ref = null) => asUser(db, u, `select create_organization('household', $1, $2) id`, [name, ref]).then((r) => r.rows[0].id);
  return { db, admin, a, b, partner, makeOrg };
}
const DL = { code: 'DL-HUNG', kind: 'agent', name: 'Đại lý Hùng', commission_pct: 20, renewal_pct: 5, months_eligible: 12, hold_days: 30 };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('nhập mã khi tạo cơ sở: gắn đối tác một lần; mã sai vẫn tạo được cơ sở nhưng không gắn đối tác; không tự sửa được', async () => {
  const { db, a, b, partner, makeOrg } = await setup();
  const pid = await partner(DL);
  // mã sai KHÔNG chặn: cơ sở vẫn được tạo, chỉ không gắn đối tác
  assert.equal((await asUser(db, a, `select referral_code_valid('SAI-MA') v, referral_code_valid(' dl-hung ') w`)).rows[0].v, false);
  assert.equal((await asUser(db, a, `select referral_code_valid(' dl-hung ') w`)).rows[0].w, true);
  const bad = await makeOrg(a, 'Vườn lỗi mã', 'SAI-MA');
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [bad])).rows[0].referred_by, null);
  await db.query(`delete from organization_memberships where organization_id = $1`, [bad]);
  await db.query(`delete from organizations where id = $1`, [bad]);
  const org = await makeOrg(a, 'Vườn A', ' dl-hung ');
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [org])).rows[0].referred_by, pid);
  // không có mã: vẫn tạo được
  const org2 = await makeOrg(b, 'Vườn B');
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [org2])).rows[0].referred_by, null);
  // chủ cơ sở không tự đổi người giới thiệu (kể cả ghi trực tiếp)
  await asUser(db, b, `update organizations set referred_by = $2 where id = $1`, [org2, pid]);
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [org2])).rows[0].referred_by, null);
  await asUser(db, a, `update organizations set referred_by = null where id = $1`, [org]);
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [org])).rows[0].referred_by, pid);
});

test('ghi nhận thanh toán tạo hoa hồng; chờ đủ ngày mới chi được; chi hai lần bị chặn; hết thời hạn hưởng thì theo tỷ lệ tái ký', async () => {
  const { db, admin, a, partner, makeOrg } = await setup();
  const pid = await partner(DL);
  const org = await makeOrg(a, 'Vườn A', 'DL-HUNG');
  const plan = (await db.query(`select id from plan_tiers where org_type = 'household' and is_active order by price_per_quarter limit 1`)).rows[0].id;
  // thanh toán đầu cách đây 400 ngày -> hoa hồng 20%, đã quá hạn chờ
  await asUser(db, admin, `select admin_record_payment($1, 1000000, $2::date, 'Chuyển khoản', '', 1, $3)`, [org, daysAgo(400), plan]);
  let d = (await asUser(db, admin, `select admin_partner_detail($1) d`, [pid])).rows[0].d;
  assert.equal(d.commissions.length, 1);
  assert.equal(Number(d.commissions[0].amount), 200000);
  assert.equal(d.commissions[0].status, 'payable');
  // thanh toán hôm nay (đã quá 12 tháng kể từ lần đầu) -> tỷ lệ tái ký 5%, còn đang chờ xác nhận
  await asUser(db, admin, `select admin_record_payment($1, 1000000, $2::date, 'Tiền mặt', '', 1, $3)`, [org, daysAgo(0), plan]);
  d = (await asUser(db, admin, `select admin_partner_detail($1) d`, [pid])).rows[0].d;
  assert.equal(d.commissions.length, 2);
  const renew = d.commissions.find((c) => c.status === 'waiting');
  assert.equal(Number(renew.amount), 50000);
  // khoản chưa đến hạn không chi được
  assert.match(await expectError(asUser(db, admin, `select admin_commission_pay(array[$1]::uuid[], current_date, 'Chuyển khoản', '')`, [renew.id])), /NOT_PAYABLE/);
  // chi khoản đến hạn; chi lại bị chặn
  const due = d.commissions.find((c) => c.status === 'payable');
  assert.equal((await asUser(db, admin, `select admin_commission_pay(array[$1]::uuid[], current_date, 'Chuyển khoản', 'Tháng 11') n`, [due.id])).rows[0].n, 1);
  assert.match(await expectError(asUser(db, admin, `select admin_commission_pay(array[$1]::uuid[], current_date, 'x', '')`, [due.id])), /NOT_PAYABLE/);
  // hủy khoản đang chờ cần lý do
  assert.match(await expectError(asUser(db, admin, `select admin_commission_void($1, 'ngắn')`, [renew.id])), /REASON_REQUIRED/);
  await asUser(db, admin, `select admin_commission_void($1, 'Khách đã hoàn tiền')`, [renew.id]);
  const l = (await asUser(db, admin, `select admin_partner_list() l`)).rows[0].l[0];
  assert.equal(Number(l.paid), 200000);
  assert.equal(Number(l.revenue), 2000000);
  assert.equal(l.referred, 1);
  // đối tác bị khóa thì không phát sinh hoa hồng mới
  await asUser(db, admin, `select admin_partner_save($1, $2::jsonb)`, [pid, JSON.stringify({ ...DL, active: false })]);
  await asUser(db, admin, `select admin_record_payment($1, 500000, $2::date, 'Tiền mặt', '', 1, $3)`, [org, daysAgo(0), plan]);
  assert.equal((await db.query(`select count(*)::int n from referral_commissions`)).rows[0].n, 2);
});

test('người dùng có mã riêng, giới thiệu người khác; không tự giới thiệu mình; phần quản trị chỉ dành cho quản trị nền tảng', async () => {
  const { db, admin, a, b, makeOrg } = await setup();
  const orgA = await makeOrg(a, 'Vườn A');
  const mine = (await asUser(db, a, `select my_referral($1) r`, [orgA])).rows[0].r;
  assert.match(mine.code, /^ND-[A-Z0-9]{6}$/);
  assert.equal((await asUser(db, a, `select my_referral($1) r`, [orgA])).rows[0].r.code, mine.code);   // mã không đổi
  assert.match(await expectError(asUser(db, b, `select my_referral($1)`, [orgA])), /FORBIDDEN/);       // người khác không xem được
  const orgB = await makeOrg(b, 'Vườn B', mine.code);
  assert.equal((await asUser(db, a, `select my_referral($1) r`, [orgA])).rows[0].r.referred, 1);
  assert.match(await expectError(asUser(db, admin, `select admin_org_set_referral($1, $2, 'thử tự giới thiệu')`, [orgA, mine.code])), /INVALID_REF/);
  // quản trị gắn/gỡ đối tác cho cơ sở có lý do
  await asUser(db, admin, `select admin_org_set_referral($1, '', 'Khách gọi báo nhập nhầm')`, [orgB]);
  assert.equal((await asUser(db, admin, `select admin_org_referral($1) r`, [orgB])).rows[0].r, null);
  // người thường không gọi được hàm quản trị
  for (const sql of [`select admin_partner_list()`, `select admin_partner_detail(gen_random_uuid())`, `select admin_org_referral('${orgA}')`]) {
    assert.match(await expectError(asUser(db, a, sql)), /FORBIDDEN/);
  }
  assert.match(await expectError(asUser(db, a, `select admin_partner_save(null, '{"code":"AB-CD","name":"x"}'::jsonb)`)), /FORBIDDEN/);
  // dữ liệu thô không đọc được trực tiếp
  assert.equal((await asUser(db, a, `select count(*)::int n from referral_partners`)).rows[0].n, 0);
});

test('kiểm tra khi lưu đối tác; đăng ký bằng điện thoại mang mã sang khi duyệt', async () => {
  const { db, admin, partner } = await setup();
  const bad = (patch) => expectError(asUser(db, admin, `select admin_partner_save(null, $1::jsonb)`, [JSON.stringify({ ...DL, ...patch })]));
  assert.match(await bad({ code: 'a b' }), /INVALID_CODE/);
  assert.match(await bad({ commission_pct: 120 }), /INVALID_VALUE/);
  assert.match(await bad({ kind: 'lạ' }), /INVALID_VALUE/);
  assert.match(await bad({ name: '' }), /INVALID_NAME/);
  const pid = await partner(DL);
  assert.match(await bad({}), /CODE_IN_USE/);

  const u = await addUser(db, 9);
  await db.query(`select owner_signup_finalize($1, '0912345678', 'x@sdt.test', 'Nguyễn Văn A', 'Vườn Z', 'household', null, 'dl-hung')`, [u]);
  // mã sai: vẫn ghi đăng ký, không lưu mã
  const u2 = await addUser(db, 10);
  await db.query(`select owner_signup_finalize($1, '0912345679', 'y@sdt.test', 'Nguyễn Văn B', 'Vườn Y', 'household', null, 'SAI')`, [u2]);
  assert.equal((await db.query(`select ref_code from owner_signups where user_id = $1`, [u2])).rows[0].ref_code, null);
  const sid = (await asUser(db, admin, `select admin_list_signups('pending') l`)).rows[0].l.find((x) => x.phone === '0912345678');
  assert.equal(sid.ref_code, 'DL-HUNG');
  const org = (await asUser(db, admin, `select admin_decide_signup($1, true, null) o`, [sid.id])).rows[0].o;
  assert.equal((await db.query(`select referred_by from organizations where id = $1`, [org])).rows[0].referred_by, pid);
});
