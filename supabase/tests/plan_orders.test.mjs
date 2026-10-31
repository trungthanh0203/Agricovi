import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0141: chủ cơ sở xem các gói và gửi yêu cầu mua; quản trị nền tảng duyệt (ghi nhận thanh toán + kích hoạt gói) hoặc từ chối.

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1);
  const owner = await addUser(db, 2);
  const mgr = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await db.query(`delete from plan_tiers`);                                            // bỏ gói mẫu của hệ thống, dùng bộ gói của bài thử
  await db.query(`insert into plan_tiers (org_type, name, max_cycles, price_per_quarter, ranking_weight, is_trial_default, is_active) values
    ('household','Dùng thử',2,0,0,true,true), ('household','Cơ bản',3,300000,1,false,true), ('household','Nâng cao',10,900000,2,false,true),
    ('household','Cũ đã ngừng',5,500000,1,false,false), ('cooperative','HTX 1',20,2000000,3,false,true)`);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const plan = async (name) => (await db.query(`select id from plan_tiers where name=$1`, [name])).rows[0].id;
  const order = (who, p, q = 2, extra = {}) => asUser(db, who, `select create_plan_order($1,$2,$3,$4,$5,$6,$7) id`,
    [org, p, q, extra.name ?? 'Nguyễn Văn A', extra.phone ?? '0912 345 678', extra.addr ?? '12 Đường X, Đà Lạt', extra.note ?? null]);
  return { db, admin, owner, mgr, org, plan, order };
}

test('danh sách gói mua được: đúng loại cơ sở, đang mở bán, không phải gói dùng thử; chỉ chủ xem', async () => {
  const { db, owner, mgr, org } = await setup();
  const list = (await asUser(db, owner, `select list_purchasable_plans($1) r`, [org])).rows[0].r;
  assert.deepEqual(list.map((p) => p.name), ['Cơ bản', 'Nâng cao']);
  assert.match(await expectError(asUser(db, mgr, `select list_purchasable_plans($1)`, [org])), /FORBIDDEN/);
});

test('tạo yêu cầu mua: chụp lại tên và giá gói, tính tổng tiền; kiểm tra thông tin; tối đa 3 yêu cầu chờ; chỉ chủ', async () => {
  const { db, owner, mgr, org, plan, order } = await setup();
  const id = (await order(owner, await plan('Cơ bản'), 2, { note: 'Gọi buổi sáng' })).rows[0].id;
  const o = (await db.query(`select plan_name, quarters, price_per_quarter, amount, status, note from plan_orders where id=$1`, [id])).rows[0];
  assert.deepEqual(o, { plan_name: 'Cơ bản', quarters: 2, price_per_quarter: 300000, amount: 600000, status: 'pending', note: 'Gọi buổi sáng' });
  await db.query(`update plan_tiers set price_per_quarter = 999 where name='Cơ bản'`);                  // đổi giá sau không đổi đơn cũ
  assert.equal((await db.query(`select amount::text a from plan_orders where id=$1`, [id])).rows[0].a, '600000');
  assert.match(await expectError(order(owner, await plan('Cũ đã ngừng'))), /INVALID_PLAN/);              // gói đã ngừng bán
  assert.match(await expectError(order(owner, await plan('HTX 1'))), /INVALID_PLAN/);                    // sai loại cơ sở
  assert.match(await expectError(order(owner, await plan('Dùng thử'))), /INVALID_PLAN/);
  assert.match(await expectError(order(owner, await plan('Cơ bản'), 9)), /INVALID_QUARTERS/);
  assert.match(await expectError(order(owner, await plan('Cơ bản'), 1, { name: 'A' })), /INVALID_NAME/);
  assert.match(await expectError(order(owner, await plan('Cơ bản'), 1, { phone: '123' })), /INVALID_PHONE/);
  assert.match(await expectError(order(owner, await plan('Cơ bản'), 1, { addr: '' })), /INVALID_ADDRESS/);
  assert.match(await expectError(order(mgr, await plan('Cơ bản'))), /FORBIDDEN/);
  await order(owner, await plan('Nâng cao')); await order(owner, await plan('Nâng cao'));
  assert.match(await expectError(order(owner, await plan('Nâng cao'))), /TOO_MANY/);
  const mine = (await asUser(db, owner, `select my_plan_orders($1) r`, [org])).rows[0].r;
  assert.equal(mine.length, 3); assert.equal(mine[0].status, 'pending');
  assert.match(await expectError(asAnon(db, `select * from list_purchasable_plans('${org}')`)), /permission denied/);
});

test('duyệt: ghi nhận thanh toán và kích hoạt gói, đơn thành Đã duyệt; không duyệt hai lần; người thường không duyệt được', async () => {
  const { db, admin, owner, org, plan, order } = await setup();
  const id = (await order(owner, await plan('Cơ bản'), 2)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select admin_decide_plan_order($1,true)`, [id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select admin_list_plan_orders()`)), /FORBIDDEN/);
  const list = (await asUser(db, admin, `select admin_list_plan_orders('pending') r`)).rows[0].r;
  assert.equal(list.length, 1); assert.deepEqual([list[0].org_name, list[0].plan_name, list[0].amount], ['Vườn A', 'Cơ bản', 600000]);
  const sid = (await asUser(db, admin, `select admin_decide_plan_order($1,true,null,null,'Chuyển khoản') s`, [id])).rows[0].s;
  const sub = (await db.query(`select s.status::text st, s.max_cycles, t.name, (s.period_end = s.period_start + interval '6 months') m from subscriptions s join plan_tiers t on t.id=s.plan_tier_id where s.id=$1`, [sid])).rows[0];
  assert.deepEqual([sub.st, sub.max_cycles, sub.name, sub.m], ['active', 3, 'Cơ bản', true]);               // 2 quý = 6 tháng
  assert.deepEqual((await db.query(`select amount::text a, method from payment_records where subscription_id=$1`, [sid])).rows[0], { a: '600000', method: 'Chuyển khoản' });
  const o = (await db.query(`select status, subscription_id from plan_orders where id=$1`, [id])).rows[0];
  assert.deepEqual([o.status, o.subscription_id], ['approved', sid]);
  assert.match(await expectError(asUser(db, admin, `select admin_decide_plan_order($1,true)`, [id])), /ALREADY_DECIDED/);
  const usage = (await asUser(db, owner, `select max_cycles from org_plan_usage($1)`, [org])).rows[0];
  assert.equal(usage.max_cycles, 3);                                                                       // chủ thấy gói mới ngay
});

test('từ chối: cần lý do, chủ thấy lý do; quản trị sửa được số quý và số tiền khi duyệt', async () => {
  const { db, admin, owner, org, plan, order } = await setup();
  const a = (await order(owner, await plan('Cơ bản'), 1)).rows[0].id;
  assert.match(await expectError(asUser(db, admin, `select admin_decide_plan_order($1,false)`, [a])), /REASON_REQUIRED/);
  await asUser(db, admin, `select admin_decide_plan_order($1,false,null,null,null,'Không liên hệ được')`, [a]);
  const mine = (await asUser(db, owner, `select my_plan_orders($1) r`, [org])).rows[0].r;
  assert.deepEqual([mine[0].status, mine[0].admin_note], ['rejected', 'Không liên hệ được']);
  const b = (await order(owner, await plan('Nâng cao'), 1)).rows[0].id;
  const sid = (await asUser(db, admin, `select admin_decide_plan_order($1,true,800000,4,'Tiền mặt','Giảm giá mua 4 quý') s`, [b])).rows[0].s;
  assert.equal((await db.query(`select amount::text a from payment_records where subscription_id=$1`, [sid])).rows[0].a, '800000');
  assert.equal((await db.query(`select (period_end = period_start + interval '12 months') m from subscriptions where id=$1`, [sid])).rows[0].m, true);
});

test('hàm cho Edge Function không cấp cho người dùng; dữ liệu soạn email có thông tin đơn và email nhận', async () => {
  const { db, owner, org, plan, order } = await setup();
  const id = (await order(owner, await plan('Cơ bản'), 1)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select plan_order_mail_data($1)`, [id])), /permission denied/);
  const d = (await db.query(`select plan_order_mail_data($1) d`, [id])).rows[0].d;
  assert.deepEqual([d.plan_name, d.org_name, d.full_name], ['Cơ bản', 'Vườn A', 'Nguyễn Văn A']);
  assert.ok(d.to_email === null || typeof d.to_email === 'string');
  await db.query(`select plan_order_email_result($1,'sent')`, [id]);
  assert.equal((await db.query(`select email_status from plan_orders where id=$1`, [id])).rows[0].email_status, 'sent');
  assert.ok(org);
});
