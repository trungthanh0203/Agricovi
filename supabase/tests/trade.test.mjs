import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0046 (W4): giao thương, báo giá, hộp thư, thông báo, báo cáo vi phạm.
async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), mod = await addUser(db, 2), buyer = await addUser(db, 3), buyer2 = await addUser(db, 4), seller = await addUser(db, 5),
    phoneUser = await addUser(db, 6), staff = await addUser(db, 7), plain = await addUser(db, 8);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','moderator',true)`);
  const org = (await asUser(db, seller, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  await db.query(`insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name) values ($1,$2,'0900000007','0900000007@sdt.agricovi.com','Công')`, [staff, org]);
  for (const [u, name] of [[buyer, 'Nguyễn Văn An'], [buyer2, 'Trần Thị Bình'], [seller, 'Chủ Vườn'], [phoneUser, 'Người Điện Thoại'], [plain, 'Không Xác Nhận']]) {
    await asUser(db, u, `select ensure_buyer_profile($1,'individual',null)`, [name]);
  }
  await db.query(`update buyer_profiles set login_kind='phone' where user_id=$1`, [phoneUser]);
  await db.query(`update auth.users set email_confirmed_at = now() where id = any ($1::uuid[])`, [[buyer, buyer2, seller, mod]]);
  const cat = (await db.query(`select id from product_categories where slug='dua-luoi-dua-hau'`)).rows[0].id;
  return { db, admin, mod, buyer, buyer2, seller, phoneUser, staff, plain, org, cat };
}
const post = (db, u, cat, over = {}) => asUser(db, u,
  `select create_trade_post($1,$2,$3,$4,$5,$6,$7,$8,'Đức Hòa',$9,$10,$11,$12,$13,$14) r`,
  [over.kind ?? 'buy', over.cat ?? cat, over.product ?? 'Dưa lưới Taki', over.qty ?? 2, over.unit ?? 'tấn', over.pmin ?? 40000, over.pmax ?? 50000, over.province ?? 'Hà Nội',
    over.when ?? '2026-12-01', over.days ?? 14, over.quality ?? ['VietGAP'], over.desc ?? 'Cần giao tại chợ đầu mối', over.images ?? [], over.org ?? null]);
const approve = (db, mod, id) => asUser(db, mod, `select site_review_trade_post($1,'approve',null)`, [id]);

test('khách chỉ thấy tóm tắt tin đã duyệt; chi tiết và bảng gốc không đọc được khi chưa đăng nhập', async () => {
  const { db, mod, buyer, cat } = await setup();
  const r = (await post(db, buyer, cat)).rows[0].r;
  assert.equal(r.status, 'pending');
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 0);
  await approve(db, mod, r.id);
  const v = (await asAnon(db, `select * from public_trade_posts`)).rows[0];
  assert.deepEqual([v.title, v.category_name, v.province, Number(v.quantity), v.unit, v.kind], ['Cần mua Dưa lưới Taki 2 tấn · Hà Nội', 'Dưa lưới, dưa hấu', 'Hà Nội', 2, 'tấn', 'buy']);
  assert.equal(v.description, undefined);                 // không có mô tả/ảnh/người đăng trong dữ liệu công khai
  assert.equal(v.user_id, undefined);
  assert.match(await expectError(asAnon(db, `select get_trade_post($1)`, [r.id])), /permission|denied/i);
  assert.match(await expectError(asAnon(db, `select * from trade_posts`)), /permission|denied/i);
});

test('đăng tin: cần email đã xác nhận; chặn liên hệ trong nội dung; kiểm tra loại tin, danh mục, ảnh', async () => {
  const { db, buyer, plain, phoneUser, staff, org, cat } = await setup();
  assert.match(await expectError(post(db, plain, cat)), /VERIFY/);
  assert.match(await expectError(post(db, phoneUser, cat)), /VERIFY/);
  assert.match(await expectError(post(db, staff, cat)), /FORBIDDEN/);
  assert.match(await expectError(post(db, buyer, cat, { kind: 'sell' })), /FORBIDDEN/);          // tin bán phải chọn cơ sở
  assert.match(await expectError(post(db, buyer, cat, { org })), /INVALID/);                      // tin mua không gắn cơ sở
  for (const desc of ['Gọi 0912 345 678 nhé', 'xem http://spam.vn', 'mail a@b.com', 'liên hệ zalo của tôi']) {
    assert.match(await expectError(post(db, buyer, cat, { desc })), /CONTACT/);
  }
  assert.match(await expectError(post(db, buyer, cat, { product: 'Dưa 0912345678' })), /CONTACT/);
  assert.match(await expectError(post(db, buyer, cat, { cat: '00000000-0000-4000-8000-000000000999' })), /INVALID/);
  assert.match(await expectError(post(db, buyer, cat, { qty: 0 })), /INVALID/);
  assert.match(await expectError(post(db, buyer, cat, { pmin: 50000, pmax: 40000 })), /INVALID/);
  assert.match(await expectError(post(db, buyer, cat, { images: ['http://x/a.png'] })), /INVALID/);
  assert.match(await expectError(post(db, buyer, cat, { images: ['data:image/png;base64,AA', 'data:image/png;base64,AA', 'data:image/png;base64,AA'] })), /INVALID/);
  const ok = (await post(db, buyer, cat, { images: ['data:image/jpeg;base64,/9j/4AAQ'] })).rows[0].r;
  assert.equal(ok.status, 'pending');
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='trade'`, [buyer])).rows[0].n, 1);   // báo "đang chờ duyệt"
});

test('giới hạn số tin còn hiệu lực và số tin mỗi ngày; tin bán do chủ cơ sở đăng', async () => {
  const { db, buyer, seller, org, cat } = await setup();
  for (let i = 0; i < 5; i++) await post(db, buyer, cat, { product: 'Dưa ' + i });
  assert.match(await expectError(post(db, buyer, cat)), /LIMIT/);
  const s = (await post(db, seller, cat, { kind: 'sell', org })).rows[0].r;
  assert.equal(s.status, 'pending');
  for (let i = 0; i < 3; i++) await post(db, seller, cat, { kind: 'sell', org, product: 'Bán ' + i });
  assert.match(await expectError(post(db, buyer, cat, { product: 'Thêm' })), /LIMIT|RATE_LIMIT/);
});

test('duyệt tin: kiểm duyệt viên duyệt/từ chối/ẩn; người đã có tin được duyệt thì tin sau tự duyệt, bị từ chối thì lại phải duyệt', async () => {
  const { db, mod, buyer, buyer2, cat } = await setup();
  const a = (await post(db, buyer, cat)).rows[0].r;
  assert.match(await expectError(asUser(db, buyer2, `select site_review_trade_post($1,'approve',null)`, [a.id])), /FORBIDDEN/);
  assert.equal((await asUser(db, mod, `select site_list_trade_posts('pending',50) l`)).rows[0].l.length, 1);
  assert.match(await expectError(asUser(db, mod, `select site_review_trade_post($1,'reject','')`, [a.id])), /INVALID/);
  await approve(db, mod, a.id);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%đã được duyệt%'`, [buyer])).rows[0].n, 1);
  const b = (await post(db, buyer, cat, { product: 'Bưởi' })).rows[0].r;
  assert.equal(b.status, 'published');                                         // tự duyệt
  await asUser(db, mod, `select site_review_trade_post($1,'hide','Quảng cáo trá hình')`, [b.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 1);
  const c = (await post(db, buyer, cat, { product: 'Cam' })).rows[0].r;
  assert.equal(c.status, 'pending');                                           // vừa bị ẩn: lại phải duyệt
  const mine = (await asUser(db, buyer, `select list_my_trade_posts() l`)).rows[0].l;
  assert.deepEqual(mine.map((x) => x.status).sort(), ['hidden', 'pending', 'published']);
  assert.equal(mine.find((x) => x.status === 'hidden').review_note, 'Quảng cáo trá hình');
});

test('chi tiết tin cần đăng nhập; người đăng tin mua ẩn danh; tin chờ duyệt chỉ chủ tin và kiểm duyệt thấy', async () => {
  const { db, mod, buyer, buyer2, seller, org, cat } = await setup();
  const a = (await post(db, buyer, cat, { desc: 'Cần hàng đồng đều' })).rows[0].r;
  assert.match(await expectError(asUser(db, buyer2, `select get_trade_post($1)`, [a.id])), /NOT_FOUND/);       // chưa duyệt
  assert.equal((await asUser(db, buyer, `select get_trade_post($1) d`, [a.id])).rows[0].d.is_owner, true);
  assert.equal((await asUser(db, mod, `select get_trade_post($1) d`, [a.id])).rows[0].d.description, 'Cần hàng đồng đều');
  await approve(db, mod, a.id);
  const d = (await asUser(db, buyer2, `select get_trade_post($1) d`, [a.id])).rows[0].d;
  assert.deepEqual([d.is_owner, d.poster.anonymous, d.poster.label, d.description, d.responses], [false, true, 'Người mua tại Hà Nội', 'Cần hàng đồng đều', null]);
  assert.equal(JSON.stringify(d).includes(buyer), false);                                                      // không lộ mã người đăng
  const s = (await post(db, seller, cat, { kind: 'sell', org })).rows[0].r;
  await approve(db, mod, s.id);
  assert.equal((await asUser(db, buyer2, `select get_trade_post($1) d`, [s.id])).rows[0].d.poster.name, 'Vườn Thành Công');   // tin bán hiện tên cơ sở
});

test('báo giá → chấp nhận → hộp thư; liên hệ chỉ mở khi hai bên cùng đồng ý; tin nhắn bị lọc liên hệ tới lúc đó', async () => {
  const { db, mod, buyer, buyer2, seller, org, cat } = await setup();
  const a = (await post(db, buyer, cat)).rows[0].r;
  await approve(db, mod, a.id);
  const resp = (u, over = {}) => asUser(db, u, `select respond_trade_post($1,$2,$3,'2026-12-05',$4,$5) id`, [a.id, over.price ?? 45000, 2, over.note ?? 'Giao tận nơi', over.org ?? null]);
  assert.match(await expectError(resp(buyer)), /INVALID/);                       // không báo giá vào tin của mình
  assert.match(await expectError(resp(buyer2)), /FORBIDDEN/);                    // tin mua: phải là cơ sở
  assert.match(await expectError(resp(seller, { org, note: 'gọi 0912345678' })), /CONTACT/);
  const rid = (await resp(seller, { org })).rows[0].id;
  assert.match(await expectError(resp(seller, { org })), /INVALID/);             // đã gửi rồi
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%báo giá mới%'`, [buyer])).rows[0].n, 1);
  const owner = (await asUser(db, buyer, `select get_trade_post($1) d`, [a.id])).rows[0].d;
  assert.deepEqual([owner.responses.length, owner.responses[0].name, Number(owner.responses[0].price), owner.responses[0].conversation_id], [1, 'Vườn Thành Công', 45000, null]);
  assert.equal((await asUser(db, seller, `select get_trade_post($1) d`, [a.id])).rows[0].d.my_response.status, 'open');
  assert.match(await expectError(asUser(db, seller, `select decide_trade_response($1,true,false)`, [rid])), /FORBIDDEN/);   // chỉ chủ tin
  const conv = (await asUser(db, buyer, `select decide_trade_response($1,true,true) c`, [rid])).rows[0].c;
  assert.ok(conv);
  assert.match(await expectError(asUser(db, buyer, `select decide_trade_response($1,true,false)`, [rid])), /INVALID/);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%được chấp nhận%'`, [seller])).rows[0].n, 1);
  // hộp thư
  const list = (await asUser(db, seller, `select list_my_conversations() l`)).rows[0].l;
  assert.deepEqual([list.length, list[0].unread, list[0].with_whom], [1, 0, 'Nguyễn Văn An']);   // tin hệ thống chào mừng không tính là chưa đọc
  assert.match(await expectError(asUser(db, buyer2, `select get_conversation($1)`, [conv])), /FORBIDDEN/);
  const g = (await asUser(db, seller, `select get_conversation($1) g`, [conv])).rows[0].g;
  assert.deepEqual([g.messages.length, g.messages[0].system, g.me_share, g.other_share], [1, true, false, true]);
  assert.equal((await asUser(db, seller, `select list_my_conversations() l`)).rows[0].l[0].unread, 0);
  // chưa đủ hai bên đồng ý: lọc liên hệ, khóa liên hệ
  assert.match(await expectError(asUser(db, seller, `select send_message($1,'Gọi tôi 0912345678')`, [conv])), /CONTACT/);
  assert.match(await expectError(asUser(db, seller, `select get_conversation_contacts($1)`, [conv])), /LOCKED/);
  await asUser(db, seller, `select send_message($1,'Chào anh, tôi giao được 2 tấn')`, [conv]);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='message'`, [buyer])).rows[0].n, 1);
  await asUser(db, seller, `select send_message($1,'Anh xác nhận giúp')`, [conv]);
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='message'`, [buyer])).rows[0].n, 1);   // không dồn thông báo
  await db.query(`update buyer_profiles set phone='0911222333' where user_id=$1`, [buyer]);
  await asUser(db, seller, `select set_share_contact($1,true)`, [conv]);                    // chủ tin đã đồng ý lúc chấp nhận; nay bên kia cũng đồng ý
  assert.equal((await asUser(db, seller, `select get_conversation_contacts($1) c`, [conv])).rows[0].c[0].phone, '0911222333');
});

test('liên hệ mở khi cả hai chia sẻ; sau đó tin nhắn có số điện thoại được phép', async () => {
  const { db, mod, buyer, seller, org, cat } = await setup();
  const a = (await post(db, buyer, cat)).rows[0].r;
  await approve(db, mod, a.id);
  const rid = (await asUser(db, seller, `select respond_trade_post($1,45000,2,null,null,$2) id`, [a.id, org])).rows[0].id;
  const conv = (await asUser(db, buyer, `select decide_trade_response($1,true,false) c`, [rid])).rows[0].c;
  await db.query(`update buyer_profiles set phone='0911222333' where user_id=$1`, [buyer]);
  await asUser(db, buyer, `select set_share_contact($1,true)`, [conv]);
  assert.match(await expectError(asUser(db, seller, `select get_conversation_contacts($1)`, [conv])), /LOCKED/);
  await asUser(db, seller, `select set_share_contact($1,true)`, [conv]);
  const c = (await asUser(db, seller, `select get_conversation_contacts($1) c`, [conv])).rows[0].c;
  assert.deepEqual([c.length, c[0].phone, c[0].email], [1, '0911222333', 'u3@test.local']);
  await asUser(db, seller, `select send_message($1,'Số tôi 0912345678')`, [conv]);                         // đã đồng ý cả hai: không lọc
  await asUser(db, buyer, `select set_share_contact($1,false)`, [conv]);                                    // thu hồi
  assert.match(await expectError(asUser(db, seller, `select get_conversation_contacts($1)`, [conv])), /LOCKED/);
});

test('từ chối, rút báo giá, đóng, gia hạn và hết hạn tin', async () => {
  const { db, mod, buyer, buyer2, seller, org, cat } = await setup();
  const a = (await post(db, buyer, cat)).rows[0].r;
  await approve(db, mod, a.id);
  const rid = (await asUser(db, seller, `select respond_trade_post($1,null,null,null,null,$2) id`, [a.id, org])).rows[0].id;
  await asUser(db, buyer, `select decide_trade_response($1,false,false)`, [rid]);
  assert.equal((await db.query(`select status from trade_responses where id=$1`, [rid])).rows[0].status, 'declined');
  assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1 and title like '%chưa được chọn%'`, [seller])).rows[0].n, 1);
  assert.match(await expectError(asUser(db, seller, `select withdraw_trade_response($1)`, [rid])), /NOT_FOUND/);
  // hết hạn: biến mất khỏi danh sách công khai và không nhận báo giá nữa
  await db.query(`update trade_posts set expires_at = now() - interval '1 day' where id=$1`, [a.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, buyer2, `select respond_trade_post($1,null,null,null,null,null)`, [a.id])), /NOT_FOUND/);
  await asUser(db, buyer, `select extend_trade_post($1,7)`, [a.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, buyer2, `select close_trade_post($1)`, [a.id])), /NOT_FOUND/);       // chỉ chủ tin
  await asUser(db, buyer, `select close_trade_post($1)`, [a.id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 0);
});

test('thông báo: đếm chưa đọc, đánh dấu đã đọc, chỉ của chính mình', async () => {
  const { db, buyer, buyer2, cat } = await setup();
  await post(db, buyer, cat);
  assert.equal((await asUser(db, buyer, `select unread_notification_count() n`)).rows[0].n, 1);
  assert.equal((await asUser(db, buyer2, `select unread_notification_count() n`)).rows[0].n, 0);
  const n = (await asUser(db, buyer, `select list_my_notifications(10) l`)).rows[0].l;
  assert.equal(n.length, 1);
  await asUser(db, buyer2, `select mark_notifications_read(null)`);
  assert.equal((await asUser(db, buyer, `select unread_notification_count() n`)).rows[0].n, 1);
  await asUser(db, buyer, `select mark_notifications_read($1::uuid[])`, [[n[0].id]]);
  assert.equal((await asUser(db, buyer, `select unread_notification_count() n`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, buyer, `select notify($1,'x','y','z',null)`, [buyer])), /permission|denied/i);
});

test('báo cáo vi phạm: người dùng báo cáo, kiểm duyệt ẩn tin và khóa người đăng; tổng quan có số liệu', async () => {
  const { db, admin, mod, buyer, buyer2, cat } = await setup();
  const a = (await post(db, buyer, cat)).rows[0].r;
  await approve(db, mod, a.id);
  assert.match(await expectError(asUser(db, buyer2, `select report_abuse('trade_post',$1,'abc')`, [a.id])), /check|violates/i);   // lý do quá ngắn
  await asUser(db, buyer2, `select report_abuse('trade_post',$1,'Tin có dấu hiệu lừa đảo')`, [a.id]);
  assert.match(await expectError(asUser(db, buyer2, `select report_abuse('trade_post',$1,'Tin có dấu hiệu lừa đảo')`, [a.id])), /INVALID/);
  assert.match(await expectError(asUser(db, buyer2, `select site_list_reports('open')`)), /FORBIDDEN/);
  const ov = (await asUser(db, mod, `select site_overview() o`)).rows[0].o;
  assert.deepEqual([Number(ov.reports_open), Number(ov.trade_published), Number(ov.users_total)], [1, 1, 5]);
  const rep = (await asUser(db, mod, `select site_list_reports('open') l`)).rows[0].l;
  assert.deepEqual([rep.length, rep[0].reporter, rep[0].target_label.startsWith('Cần mua')], [1, 'Trần Thị Bình', true]);
  await asUser(db, mod, `select site_handle_report($1,'handled','Đã ẩn tin','hide_post')`, [rep[0].id]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_trade_posts`)).rows[0].n, 0);
  await asUser(db, buyer2, `select report_abuse('user',$1,'Đăng tin rác nhiều lần')`, [buyer]);
  const r2 = (await asUser(db, mod, `select site_list_reports('open') l`)).rows[0].l[0];
  await asUser(db, mod, `select site_handle_report($1,'handled','Khóa tài khoản','block_user')`, [r2.id]);
  assert.match(await expectError(post(db, buyer, cat, { product: 'Mới' })), /đã bị khóa/);
  assert.match(await expectError(asUser(db, mod, `select site_handle_report($1,'handled',null,'xoa_het')`, [r2.id])), /INVALID/);
  void admin;
});

test('yêu cầu báo giá ghi nhận người gửi đã đăng nhập; họ xem lại được; khách không để lại mã người dùng', async () => {
  const { db, buyer, buyer2 } = await setup();
  await asUser(db, buyer, `select submit_quote_request('general',null,'Nguyễn Văn An','0912345678',null,'100 kg','Cần báo giá')`);
  await asAnon(db, `select submit_quote_request('general',null,'Khách','0988000111',null,null,'Hỏi chung')`);
  assert.deepEqual((await db.query(`select user_id is not null as u from quote_requests order by created_at`)).rows.map((r) => r.u), [true, false]);
  assert.equal((await asUser(db, buyer, `select my_sent_quotes() l`)).rows[0].l.length, 1);
  assert.equal((await asUser(db, buyer2, `select my_sent_quotes() l`)).rows[0].l.length, 0);
});
