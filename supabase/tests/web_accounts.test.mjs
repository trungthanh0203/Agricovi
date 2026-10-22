import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0045 (W3): tài khoản website — người mua, nhân viên bị chặn, yêu thích, địa chỉ, gian hàng, người dùng website.
async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), chief = await addUser(db, 2), owner = await addUser(db, 3), editor = await addUser(db, 4), worker = await addUser(db, 5),
    buyer = await addUser(db, 6), buyer2 = await addUser(db, 7), staff = await addUser(db, 8), owner2 = await addUser(db, 9);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','chief_editor',true)`);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  const org2 = (await asUser(db, owner2, `select create_organization('household','Vườn Khác') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['profile_editor']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, editor, worker]);
  await db.query(`insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name) values ($1,$2,'0900000008','0900000008@sdt.agricovi.com','Công')`, [staff, org]);
  const prof = (await asUser(db, owner, `insert into business_profiles (organization_id, display_name, description, province, location_precision)
    values ($1,'Vườn Thành Công','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP','Long An','district') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  const listing = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from) values ($1,$2,'Dưa lưới Taki','kg',40000) returning id`, [prof, org])).rows[0].id;
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  return { db, admin, chief, owner, editor, worker, buyer, buyer2, staff, owner2, org, org2, prof, listing };
}

test('nhân viên (tài khoản số điện thoại do chủ tạo) không dùng được website; khách chưa đăng nhập bị từ chối', async () => {
  const { db, staff, buyer } = await setup();
  assert.match(await expectError(asAnon(db, `select get_my_web_account()`)), /permission|denied|AUTH/i);
  assert.equal((await asUser(db, staff, `select get_my_web_account() a`)).rows[0].a.staff, true);
  for (const sql of [`select ensure_buyer_profile('Công','individual',null)`, `select list_my_favorites()`, `select my_shop()`, `select my_quote_requests(null)`,
    `select toggle_favorite('supplier','00000000-0000-4000-8000-000000000001',true)`]) {
    assert.match(await expectError(asUser(db, staff, sql)), /FORBIDDEN/);
  }
  assert.equal((await asUser(db, buyer, `select get_my_web_account() a`)).rows[0].a.staff, false);
});

test('hồ sơ người mua: tạo ở lần đầu, chạy lại không nhân đôi, sửa được, người khác không đọc được', async () => {
  const { db, buyer, buyer2, owner, org } = await setup();
  assert.equal((await asUser(db, buyer, `select get_my_web_account() a`)).rows[0].a.profile, null);
  const a = (await asUser(db, buyer, `select ensure_buyer_profile('Nguyễn Văn An','restaurant','Nhà hàng Sen') a`)).rows[0].a;
  assert.deepEqual([a.profile.full_name, a.profile.buyer_kind, a.profile.company, a.email], ['Nguyễn Văn An', 'restaurant', 'Nhà hàng Sen', 'u6@test.local']);
  await asUser(db, buyer, `select ensure_buyer_profile('Tên khác',null,null)`);
  assert.equal((await db.query(`select count(*)::int n from buyer_profiles`)).rows[0].n, 1);
  assert.equal((await asUser(db, buyer, `select full_name from buyer_profiles`)).rows[0].full_name, 'Nguyễn Văn An');
  assert.equal((await asUser(db, buyer2, `select count(*)::int n from buyer_profiles`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, buyer2, `select ensure_buyer_profile('A',null,null)`)), /INVALID/);
  await asUser(db, buyer, `select update_my_buyer_profile('Nguyễn An','business','Công ty X','0123456789','0912 345 678')`);
  const p = (await asUser(db, buyer, `select get_my_web_account() a`)).rows[0].a.profile;
  assert.deepEqual([p.full_name, p.buyer_kind, p.tax_code, p.phone], ['Nguyễn An', 'business', '0123456789', '0912345678']);
  assert.match(await expectError(asUser(db, buyer, `select update_my_buyer_profile('Nguyễn An','la',null,null,null)`)), /INVALID/);
  assert.match(await expectError(asUser(db, buyer, `update buyer_profiles set status='active'`)), /permission|denied/i);
  // chủ cơ sở thấy cơ sở của mình ở tài khoản website
  const acc = (await asUser(db, owner, `select get_my_web_account() a`)).rows[0].a;
  assert.deepEqual(acc.orgs.map((o) => [o.org_id, o.is_owner]), [[org, true]]);
});

test('quản trị website xem, tìm và khóa người dùng; người bị khóa không dùng được website', async () => {
  const { db, chief, buyer, buyer2 } = await setup();
  await asUser(db, buyer, `select ensure_buyer_profile('Nguyễn Văn An','individual',null)`);
  await asUser(db, buyer2, `select ensure_buyer_profile('Trần Thị Bình','trader',null)`);
  assert.match(await expectError(asUser(db, buyer, `select site_list_users(null,10)`)), /FORBIDDEN/);
  const all = (await asUser(db, chief, `select site_list_users(null,10) l`)).rows[0].l;
  assert.equal(all.length, 2);
  assert.deepEqual((await asUser(db, chief, `select site_list_users('tran thi',10) l`)).rows[0].l.map((x) => x.full_name), ['Trần Thị Bình']);
  assert.match(await expectError(asUser(db, chief, `select site_set_user_status($1,'blocked','')`, [buyer])), /INVALID/);
  await asUser(db, chief, `select site_set_user_status($1,'blocked','Đăng tin rác nhiều lần')`, [buyer]);
  assert.match(await expectError(asUser(db, buyer, `select list_my_favorites()`)), /đã bị khóa/);
  await asUser(db, chief, `select site_set_user_status($1,'active',null)`, [buyer]);
  await asUser(db, buyer, `select list_my_favorites()`);
  assert.ok((await db.query(`select 1 from audit_events where action in ('site_user_blocked','site_user_active')`)).rows.length >= 2);
});

test('yêu thích: thêm/bỏ nhà cung cấp và sản phẩm, chỉ của chính mình, mục không công khai bị từ chối', async () => {
  const { db, buyer, buyer2, prof, listing } = await setup();
  await asUser(db, buyer, `select ensure_buyer_profile('Nguyễn Văn An','individual',null)`);
  await asUser(db, buyer, `select toggle_favorite('supplier',$1,true)`, [prof]);
  await asUser(db, buyer, `select toggle_favorite('supplier',$1,true)`, [prof]);   // lặp lại không lỗi
  await asUser(db, buyer, `select toggle_favorite('product',$1,true)`, [listing]);
  const f = (await asUser(db, buyer, `select list_my_favorites() f`)).rows[0].f;
  assert.deepEqual([f.suppliers.length, f.products.length, f.suppliers[0].name, f.products[0].name, Number(f.products[0].price_from)], [1, 1, 'Vườn Thành Công', 'Dưa lưới Taki', 40000]);
  assert.equal((await asUser(db, buyer2, `select list_my_favorites() f`)).rows[0].f.suppliers.length, 0);
  assert.match(await expectError(asUser(db, buyer, `select toggle_favorite('supplier','00000000-0000-4000-8000-000000000999',true)`)), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, buyer, `select toggle_favorite('khac',$1,true)`, [prof])), /INVALID/);
  assert.match(await expectError(asUser(db, buyer, `insert into favorite_suppliers (user_id, profile_id) values ($1,$2)`, [buyer, prof])), /permission|denied/i);
  await asUser(db, buyer, `select toggle_favorite('supplier',$1,false)`, [prof]);
  assert.equal((await asUser(db, buyer, `select list_my_favorites() f`)).rows[0].f.suppliers.length, 0);
});

test('sổ địa chỉ: mặc định đổi đúng, kiểm tra số điện thoại, tối đa 10, chỉ xóa địa chỉ của mình', async () => {
  const { db, buyer, buyer2 } = await setup();
  const save = (u, id, label, def = false, phone = '0912345678') => asUser(db, u, `select save_buyer_address($1,$2,'Nguyễn An',$3,'Hà Nội','Cầu Giấy','Số 1 phố A',$4) id`, [id, label, phone, def]);
  const a1 = (await save(buyer, null, 'Nhà')).rows[0].id;
  assert.equal((await db.query(`select is_default from buyer_addresses where id=$1`, [a1])).rows[0].is_default, true);   // địa chỉ đầu tiên là mặc định
  const a2 = (await save(buyer, null, 'Cơ quan', true)).rows[0].id;
  assert.deepEqual((await db.query(`select id, is_default from buyer_addresses where user_id=$1 order by label`, [buyer])).rows.map((r) => [r.id === a2, r.is_default]), [[true, true], [false, false]]);
  assert.match(await expectError(save(buyer, null, 'Sai', false, '123')), /INVALID/);
  assert.equal((await asUser(db, buyer2, `select count(*)::int n from buyer_addresses`)).rows[0].n, 0);
  assert.match(await expectError(save(buyer2, a1, 'Chiếm')), /NOT_FOUND/);
  await asUser(db, buyer2, `select delete_buyer_address($1)`, [a1]);
  assert.equal((await db.query(`select count(*)::int n from buyer_addresses where id=$1`, [a1])).rows[0].n, 1);
  for (let i = 0; i < 8; i++) await save(buyer, null, 'Đ' + i);
  assert.match(await expectError(save(buyer, null, 'Thừa')), /LIMIT/);
  await asUser(db, buyer, `select delete_buyer_address($1)`, [a1]);
  assert.equal((await asUser(db, buyer, `select count(*)::int n from buyer_addresses`)).rows[0].n, 9);
});

test('gian hàng: chủ và biên tập hồ sơ xem và sửa nhanh tình trạng cung ứng (hiện ngay); nhân viên thường và cơ sở khác không được', async () => {
  const { db, owner, editor, worker, owner2, listing } = await setup();
  const shop = (await asUser(db, editor, `select my_shop() s`)).rows[0].s;
  assert.equal(shop.orgs.length, 1);
  assert.deepEqual([shop.orgs[0].org_name, shop.orgs[0].listings[0].name, shop.orgs[0].listings[0].supply], ['Vườn Thành Công', 'Dưa lưới Taki', null]);
  await asUser(db, editor, `select set_listing_supply($1,'available',null,null,'Có 2 tấn')`, [listing]);
  assert.equal((await asAnon(db, `select supply_status from public_products`)).rows[0].supply_status, 'available');
  assert.equal((await asUser(db, owner, `select my_shop() s`)).rows[0].s.orgs[0].listings[0].supply.status, 'available');
  await asUser(db, owner, `select set_listing_supply($1,'expected','2026-12-01','2026-12-30',null)`, [listing]);
  assert.equal((await asAnon(db, `select supply_status from public_products`)).rows[0].supply_status, 'expected');
  assert.match(await expectError(asUser(db, owner, `select set_listing_supply($1,'khac',null,null,null)`, [listing])), /INVALID/);
  assert.match(await expectError(asUser(db, owner, `select set_listing_supply($1,'expected','2026-12-30','2026-12-01',null)`, [listing])), /INVALID/);
  assert.match(await expectError(asUser(db, worker, `select set_listing_supply($1,'available',null,null,null)`, [listing])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner2, `select set_listing_supply($1,'available',null,null,null)`, [listing])), /FORBIDDEN/);
  assert.equal((await asUser(db, worker, `select my_shop() s`)).rows[0].s.orgs.length, 0);
  assert.equal((await asUser(db, owner2, `select my_shop() s`)).rows[0].s.orgs[0].listings.length, 0);
});

test('yêu cầu báo giá gửi tới cơ sở: chủ và biên tập hồ sơ thấy và đánh dấu đã xử lý; cơ sở khác không thấy', async () => {
  const { db, owner, editor, worker, owner2, listing } = await setup();
  await asAnon(db, `select submit_quote_request('product',$1,'Nguyễn Văn An','0912345678',null,'100 kg','Cần báo giá 100 kg')`, [listing]);
  await asAnon(db, `select submit_quote_request('general',null,'Khách khác','0988000111',null,null,'Hỏi chung')`);
  assert.equal((await asUser(db, owner, `select my_shop() s`)).rows[0].s.orgs[0].quotes_new, 1);
  const list = (await asUser(db, editor, `select my_quote_requests(null) l`)).rows[0].l;
  assert.equal(list.length, 1);                                       // chỉ yêu cầu gắn với cơ sở này, không phải yêu cầu chung
  assert.deepEqual([list[0].target_name, list[0].sender_phone, list[0].status], ['Dưa lưới Taki', '0912345678', 'new']);
  assert.equal((await asUser(db, owner2, `select my_quote_requests(null) l`)).rows[0].l.length, 0);
  assert.equal((await asUser(db, worker, `select my_quote_requests(null) l`)).rows[0].l.length, 0);
  assert.match(await expectError(asUser(db, owner2, `select set_my_quote($1,'handled',null)`, [list[0].id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_my_quote($1,'spam',null)`, [list[0].id])), /INVALID/);
  await asUser(db, owner, `select set_my_quote($1,'handled','Đã gọi lại')`, [list[0].id]);
  assert.equal((await asUser(db, owner, `select my_shop() s`)).rows[0].s.orgs[0].quotes_new, 0);
  assert.equal((await asUser(db, owner, `select my_quote_requests('handled') l`)).rows[0].l[0].note, 'Đã gọi lại');
});

test('đăng ký bằng số điện thoại: chỉ service_role kiểm tra; trùng số nhân viên hoặc số đã có thì từ chối; đăng nhập dùng email ẩn', async () => {
  const { db, buyer } = await setup();
  assert.match(await expectError(asUser(db, buyer, `select web_phone_precheck('0912345678')`)), /permission|denied/i);
  assert.match(await expectError(asAnon(db, `select web_phone_precheck('0912345678')`)), /permission|denied/i);
  assert.equal((await db.query(`select web_phone_precheck('0912 345 678') e`)).rows[0].e, '0912345678@sdt.agricovi.com');
  assert.match(await expectError(db.query(`select web_phone_precheck('123')`)), /INVALID/);
  assert.match(await expectError(db.query(`select web_phone_precheck('0900000008')`)), /EXISTS/);              // trùng số nhân viên
  await db.query(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000aa','0912345678@sdt.agricovi.com')`);
  assert.match(await expectError(db.query(`select web_phone_precheck('0912345678')`)), /EXISTS/);              // đã có tài khoản số này
  assert.equal((await asAnon(db, `select login_email_for_phone('0912 345 678') e`)).rows[0].e, '0912345678@sdt.agricovi.com');
});
