import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0050 (W6, D70): hạn mức vật tư, dòng thời gian truy xuất, huy hiệu, giá/lịch mùa vụ, thống kê gian hàng, gợi ý khớp tin.
const uid = (n) => `85000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), mod = await addUser(db, 2), owner = await addUser(db, 3), b1 = await addUser(db, 6), b2 = await addUser(db, 7), b3 = await addUser(db, 8), other = await addUser(db, 9);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','moderator',true)`);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  const rau = (await db.query(`select id from product_categories where slug='rau-cu-qua'`)).rows[0].id;
  const prof = (await asUser(db, owner, `insert into business_profiles (organization_id, display_name, description, province, location_precision)
    values ($1,'Vườn Thành Công','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP','Long An','district') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  const l1 = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from,category_id) values ($1,$2,'Dưa lưới Taki','kg',40000,$3) returning id`, [prof, org, rau])).rows[0].id;
  await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from,category_id) values ($1,$2,'Dưa leo','kg',20000,$3)`, [prof, org, rau]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  const addr = {};
  for (const [u, n] of [[b1, 'Người Mua Một'], [b2, 'Người Mua Hai'], [b3, 'Người Mua Ba'], [other, 'Người Khác']]) {
    await asUser(db, u, `select ensure_buyer_profile($1,'individual',null)`, [n]);
    addr[u] = (await asUser(db, u, `select save_buyer_address(null,'Nhà','Nguyễn An','0912345678','Hồ Chí Minh','Quận 1','12 Lê Lợi',true) id`)).rows[0].id;
  }
  await db.query(`update auth.users set email_confirmed_at = now() where id = any ($1::uuid[])`, [[owner, b1, b2, b3, other, admin, mod]]);
  return { db, admin, mod, owner, b1, b2, b3, other, org, prof, l1, rau, addr };
}
async function completed(c, buyer, qty = 5) {
  await asUser(c.db, buyer, `select cart_set_item($1,$2)`, [c.l1, qty]);
  const id = (await asUser(c.db, buyer, `select checkout_cart($1,$2,null,null) id`, [c.prof, c.addr[buyer]])).rows[0].id;
  const o = (await asUser(c.db, c.owner, `select get_order($1) o`, [id])).rows[0].o;
  await asUser(c.db, c.owner, `select quote_order($1,$2::jsonb,10000,null,null)`, [id, JSON.stringify(o.items.map((i) => ({ id: i.id, unit_price: 40000 })))]);
  await asUser(c.db, buyer, `select order_action($1,'accept')`, [id]);
  for (const a of ['prepare', 'ship', 'deliver']) await asUser(c.db, c.owner, `select order_action($1,$2)`, [id, a]);
  await asUser(c.db, buyer, `select order_action($1,'receive')`, [id]);
  return id;
}
async function publishedCycle(c, status = 'active') {
  const area = (await asUser(c.db, c.owner, `insert into production_areas (id,organization_id,name,location,area_size,area_unit) values (gen_random_uuid(),$1,'Nhà màng 1','Xã A',500,'m2') returning id`, [c.org])).rows[0].id;
  const cyc = uid(900);
  await c.db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name,created_by,start_date,expected_end_date) values ($1,$2,$3,(select id from crop_types where code='melon'),$4,'Dưa vụ 1',$5,'2026-10-01','2026-12-30')`, [cyc, c.org, area, status, c.owner]);
  await c.db.query(`insert into production_stages (cycle_id, organization_id, name, seq, actual_start, actual_end, status) values ($1,$2,'Gieo hạt',1,'2026-10-01','2026-10-10','done'),($1,$2,'Ra hoa',2,'2026-10-11',null,'in_progress')`, [cyc, c.org]);
  await c.db.query(`insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity, unit) values ($1,$2,$3,'2026-12-20T07:00:00Z',120,'kg')`, [uid(901), c.org, cyc]);
  await asUser(c.db, c.owner, `select publish_cycle($1)`, [cyc]);
  return cyc;
}

test('gian hàng vật tư: tối đa 10 vật tư, vật tư thứ 11 bị từ chối', async () => {
  const c = await setup();
  const { db, mod, owner } = c;
  const phan = (await db.query(`select id from product_categories where slug='phan-bon'`)).rows[0].id;
  const shop = (await asUser(db, owner, `select open_material_shop('Đại lý Hòa Bình','Long An','Đức Hòa','Số 5 đường A','Chuyên phân bón','0912345678','GP-12345','Sở KH&ĐT',null) id`)).rows[0].id;
  await asUser(db, mod, `select site_review_shop($1,'approve',null,true)`, [shop]);
  const save = (i) => asUser(db, owner, `select shop_save_material(null,$1,$2,'Hòa Bình','Phân NPK','N 30%','Bón gốc','Đeo găng','kg',18000,'',null,false) r`, [phan, `Vật tư ${i}`]);
  for (let i = 1; i <= 10; i++) await save(i);
  assert.match(await expectError(save(11)), /LIMIT/);
  assert.equal((await db.query(`select count(*)::int n from site_materials where shop_id=$1`, [shop])).rows[0].n, 10);
});

test('truy xuất dạng dòng thời gian: bản chụp có giai đoạn và ngày thu hoạch, không có số lượng thu hoạch', async () => {
  const c = await setup();
  await publishedCycle(c);
  const s = (await asAnon(c.db, `select snapshot s from public_cycles`)).rows[0].s;
  assert.deepEqual(s.stages.map((x) => [x.name, x.status]), [['Gieo hạt', 'done'], ['Ra hoa', 'in_progress']]);
  assert.deepEqual([s.harvest.count, s.harvest.first], [1, '2026-12-20']);
  assert.equal(JSON.stringify(s.harvest).includes('120'), false);
});

test('huy hiệu: tự động theo dữ kiện (hồ sơ → giấy tờ/truy xuất → giao dịch từ nhiều người mua); không tự gán', async () => {
  const c = await setup();
  const { db, owner, b1, b2, b3, admin, prof } = c;
  const lv = async () => (await asAnon(db, `select level, badges, deals_count from public_profile_badges`)).rows[0];
  assert.deepEqual([(await lv()).level, (await lv()).badges], [1, ['profile']]);
  await publishedCycle(c);
  assert.deepEqual([(await lv()).level, (await lv()).badges.includes('trace')], [2, true]);
  await db.query(`insert into certification_records (organization_id, business_profile_id, name, status, checked_by, checked_at) values ($1,$2,'VietGAP','document_checked',$3,now())`, [c.org, prof, admin]);
  assert.equal((await lv()).level, 2);                                                  // chưa có giao dịch: chưa tới mức 3
  await completed(c, b1); await completed(c, b1); await completed(c, b1); await completed(c, b1); await completed(c, b1);
  assert.equal((await lv()).badges.includes('deals'), false);                           // 5 đơn nhưng chỉ 1 người mua: không tính
  await completed(c, b2); await completed(c, b3);
  const x = await lv();
  assert.deepEqual([x.level, x.badges.includes('deals'), x.deals_count], [3, true, 7]);
  assert.match(await expectError(asUser(db, owner, `update supplier_reviews set stars=5`)), /permission|denied/i);
  assert.match(await expectError(asAnon(db, `select * from certification_records`)), /permission|denied|row-level/i);
});

test('giá nông sản tham khảo và lịch mùa vụ chỉ lấy dữ liệu công khai; hàng hết/tạm ngừng không tính', async () => {
  const c = await setup();
  const { db } = c;
  await publishedCycle(c);
  const p = (await asAnon(db, `select * from public_price_board`)).rows[0];
  assert.deepEqual([p.category_slug, p.unit, p.province, p.n_products, p.n_suppliers, Number(p.price_min), Number(p.price_max), Number(p.price_avg)], ['rau-cu-qua', 'kg', 'Long An', 2, 1, 20000, 40000, 30000]);
  await db.query(`update public_products set supply_status='out_of_stock' where listing_id=$1`, [c.l1]);
  assert.equal(Number((await asAnon(db, `select price_max from public_price_board`)).rows[0].price_max), 20000);
  const cal = (await asAnon(db, `select * from public_season_calendar`)).rows[0];
  assert.deepEqual([cal.crop, cal.province, cal.supplier, String(cal.expected_end_date).slice(0, 10) !== ''], ['Dưa lưới', 'Long An', 'Vườn Thành Công', true]);
  await db.query(`update public_cycles set is_visible=false`);
  assert.equal((await asAnon(db, `select count(*)::int n from public_season_calendar`)).rows[0].n, 0);
});

test('thống kê gian hàng: đúng số đơn, doanh số đơn hoàn tất, sản phẩm bán chạy; chỉ người quản lý xem', async () => {
  const c = await setup();
  const { db, owner, b1, other, org } = c;
  await completed(c, b1, 5);
  await asUser(db, b1, `select cart_set_item($1,2)`, [c.l1]);
  await asUser(db, b1, `select checkout_cart($1,$2,null,null)`, [c.prof, c.addr[b1]]);
  const s = (await asUser(db, owner, `select shop_stats($1,90) s`, [org])).rows[0].s;
  assert.deepEqual([s.orders.completed, s.orders.placed, Number(s.revenue_completed)], [1, 1, 5 * 40000 + 10000]);
  assert.deepEqual([s.top_products[0].name, Number(s.top_products[0].quantity)], ['Dưa lưới Taki', 5]);
  assert.equal(s.by_month.length, 6);
  assert.ok(s.reply_hours_median !== null);
  assert.match(await expectError(asUser(db, other, `select shop_stats($1,90)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asAnon(db, `select shop_stats($1,90)`, [org])), /permission|denied|AUTH|FORBIDDEN/i);
});

test('gợi ý khớp tin: tin mua ↔ tin bán cùng loại; chỉ chủ tin xem gợi ý; nhà cung cấp thấy tin cần mua phù hợp', async () => {
  const c = await setup();
  const { db, owner, b1, b2, org, rau } = c;
  const mk = (u, kind, prov, pmin, pmax, orgId) => asUser(db, u, `select create_trade_post($1,$2,'Dưa lưới',100,'kg',$3,$4,$5,'',null,14,'{}','Cần/bán dưa','{}',$6) r`, [kind, rau, pmin, pmax, prov, orgId]);
  const buy1 = (await mk(b1, 'buy', 'Long An', 30000, 45000, null)).rows[0].r.id;
  const buy2 = (await mk(b2, 'buy', 'Đồng Tháp', 10000, 15000, null)).rows[0].r.id;
  const sell = (await mk(owner, 'sell', 'Long An', 38000, 42000, org)).rows[0].r.id;
  await db.query(`update trade_posts set status='published'`);
  const m = (await asUser(db, b1, `select suggest_trade_matches($1) m`, [buy1])).rows[0].m;
  assert.deepEqual(m.map((x) => x.id), [sell]);                                         // tin mua không gợi ý tin mua khác
  const ms = (await asUser(db, owner, `select suggest_trade_matches($1) m`, [sell])).rows[0].m;
  assert.equal(ms[0].id, buy1);                                                          // cùng tỉnh, giá giao nhau xếp trước
  assert.ok(ms.some((x) => x.id === buy2) && ms[0].score > ms.find((x) => x.id === buy2).score);
  assert.match(await expectError(asUser(db, b2, `select suggest_trade_matches($1)`, [buy1])), /NOT_FOUND/);
  const o = (await asUser(db, owner, `select match_buy_posts_for_org($1) m`, [org])).rows[0].m;
  assert.deepEqual([o.length, o[0].id, o[0].same_province], [2, buy1, true]);
  assert.match(await expectError(asUser(db, b1, `select match_buy_posts_for_org($1)`, [org])), /FORBIDDEN/);
});
