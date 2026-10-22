import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0043 (W2): danh mục, vật tư do quản trị nhập, tin/hội chợ, yêu cầu báo giá, tìm kiếm.
async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), chief = await addUser(db, 2), editor = await addUser(db, 3), owner = await addUser(db, 4), nobody = await addUser(db, 5);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','chief_editor',true)`);
  await asUser(db, admin, `select admin_set_site_role('u3@test.local','editor',true)`);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  const prof = (await asUser(db, owner, `insert into business_profiles (organization_id, display_name, description, province, location_precision)
    values ($1,'Vườn nhà màng Thành Công','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP','Long An','district') returning id`, [org])).rows[0].id;
  return { db, admin, chief, editor, owner, nobody, org, prof };
}
const cat = async (db, slug) => (await db.query(`select id from product_categories where slug=$1`, [slug])).rows[0].id;
const mat = (db, u, id, slug, status, version, over = {}) => asUser(db, u,
  `select site_save_material($1,$2,$3,$4,'Hòa Bình','Phân NPK','N-P-K','Bón gốc','Đeo găng','kg',$5,'Từ 18.000đ','Đại lý A',$6,$7,0,$8) id`,
  [id, over.cat ?? null, slug, over.name ?? 'NPK 30-11-10', over.price ?? 18000, over.image ?? '', status, version]);

test('danh mục: có sẵn cây mẫu; khách chỉ thấy mục đang dùng; chỉ tổng biên tập sửa', async () => {
  const { db, chief, editor } = await setup();
  assert.ok((await asAnon(db, `select count(*)::int n from product_categories`)).rows[0].n >= 20);
  const phan = await cat(db, 'phan-bon'), vt = await cat(db, 'vat-tu-nong-nghiep');
  assert.equal((await db.query(`select parent_id from product_categories where id=$1`, [phan])).rows[0].parent_id, vt);
  assert.match(await expectError(asUser(db, editor, `select site_save_category(null,null,'moi','Mới','vat_tu',null,0,true,false,null)`)), /FORBIDDEN/);
  const id = (await asUser(db, chief, `select site_save_category(null,$1,'phan-nen','Phân nền','vat_tu','',5,true,false,null) id`, [vt])).rows[0].id;
  assert.match(await expectError(asUser(db, chief, `select site_save_category(null,null,'phan-nen','Trùng','vat_tu',null,0,true,false,null)`)), /duplicate|unique/i);
  assert.match(await expectError(asUser(db, chief, `select site_save_category($1,$1,'phan-nen','X','vat_tu',null,0,true,false,1)`, [id])), /INVALID/);
  await asUser(db, chief, `select site_save_category($1,$2,'phan-nen','Phân nền','vat_tu','',5,false,false,1)`, [id, vt]);
  assert.equal((await asAnon(db, `select count(*)::int n from product_categories where slug='phan-nen'`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, chief, `select site_save_category($1,$2,'phan-nen','Phân nền','vat_tu','',5,true,false,1)`, [id, vt])), /CONFLICT/);
});

test('sản phẩm của nhà cung cấp: danh mục và giá "từ" đi vào bản chụp công khai', async () => {
  const { db, admin, owner, org, prof } = await setup();
  const c = await cat(db, 'dua-luoi-dua-hau');
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,category_id,price_from) values ($1,$2,'Dưa lưới Taki','kg',$3,40000)`, [prof, org, c]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  const p = (await asAnon(db, `select snapshot from public_products`)).rows[0].snapshot;
  assert.deepEqual([p.category_slug, p.category_name, Number(p.price_from)], ['dua-luoi-dua-hau', 'Dưa lưới, dưa hấu', 40000]);
  assert.match(await expectError(asUser(db, owner, `update product_listings set price_from=-5`)), /check/i);
});

test('vật tư: biên tập viên soạn nháp, tổng biên tập đăng; khách chỉ thấy bản đã đăng; kiểm tra nhóm và ảnh', async () => {
  const { db, chief, editor } = await setup();
  const phan = await cat(db, 'phan-bon'), rau = await cat(db, 'rau-cu-qua');
  const id = (await mat(db, editor, null, 'npk-30-11-10', 'draft', null, { cat: phan })).rows[0].id;
  assert.equal((await asAnon(db, `select count(*)::int n from site_materials`)).rows[0].n, 0);
  assert.match(await expectError(mat(db, editor, id, 'npk-30-11-10', 'published', 1, { cat: phan })), /FORBIDDEN/);
  assert.match(await expectError(mat(db, chief, null, 'sai-nhom', 'draft', null, { cat: rau })), /INVALID/);
  assert.match(await expectError(mat(db, chief, null, 'anh-sai', 'draft', null, { cat: phan, image: 'http://x/a.png' })), /check|violates/i);
  await mat(db, chief, id, 'npk-30-11-10', 'published', 1, { cat: phan, image: 'data:image/jpeg;base64,/9j/4AAQ' });
  const m = (await asAnon(db, `select name, brand, price_from, image from site_materials`)).rows[0];
  assert.deepEqual([m.name, m.brand, Number(m.price_from)], ['NPK 30-11-10', 'Hòa Bình', 18000]);
  assert.match(await expectError(mat(db, chief, id, 'npk-30-11-10', 'published', 1)), /CONFLICT/);
  assert.match(await expectError(asUser(db, editor, `select site_delete_material($1)`, [id])), /FORBIDDEN/);
});

test('nhập vật tư hàng loạt: vào dạng nháp, trùng thì bỏ qua, nhóm lạ để trống, tối đa 200 dòng', async () => {
  const { db, chief, nobody } = await setup();
  const rows = [
    { name: 'MKP 0-52-34', category: 'dinh-duong', brand: 'Haifa', price_from: '55.000', unit: 'kg' },
    { name: 'MKP 0-52-34' },
    { name: '', category: 'phan-bon' },
    { name: 'Dây tưới nhỏ giọt', category: 'khong-co' },
  ];
  assert.match(await expectError(asUser(db, nobody, `select site_import_materials($1::jsonb)`, [JSON.stringify(rows)])), /FORBIDDEN/);
  const r = (await asUser(db, chief, `select site_import_materials($1::jsonb) r`, [JSON.stringify(rows)])).rows[0].r;
  assert.equal(r.created, 2);
  assert.equal(r.skipped.length, 2);
  const all = (await db.query(`select slug, status, price_from, category_id from site_materials order by slug`)).rows;
  assert.deepEqual(all.map((x) => [x.slug, x.status]), [['day-tuoi-nho-giot', 'draft'], ['mkp-0-52-34', 'draft']]);
  assert.equal(Number(all[1].price_from), 55000);
  assert.equal(all[0].category_id, null);
  assert.match(await expectError(asUser(db, chief, `select site_import_materials($1::jsonb)`, [JSON.stringify(Array.from({ length: 201 }, (_, i) => ({ name: 'v' + i })))])), /INVALID/);
});

test('bài viết và tin hội chợ: nháp → đăng; hẹn giờ; hội chợ có ngày; kênh khác không có ngày sự kiện', async () => {
  const { db, chief, editor } = await setup();
  const art = (u, id, over, status, version) => asUser(db, u,
    `select site_save_article($1,$2,$3,$4,$5,'Tóm tắt','Nội dung',null,'Báo A','https://example.com/a',$6,$7,$8,'BTC',$9,$10,$11) id`,
    [id, over.channel ?? 'nong_nghiep', over.section ?? 'ky-thuat', over.slug, over.title ?? 'Tiêu đề', over.start ?? null, over.end ?? null, over.place ?? null, status, over.at ?? null, version]);
  const id = (await art(editor, null, { slug: 'quy-trinh-dua-luoi' }, 'draft', null)).rows[0].id;
  assert.equal((await asAnon(db, `select count(*)::int n from site_articles`)).rows[0].n, 0);
  assert.match(await expectError(art(editor, id, { slug: 'quy-trinh-dua-luoi' }, 'published', 1)), /FORBIDDEN/);
  await art(chief, id, { slug: 'quy-trinh-dua-luoi' }, 'published', 1);
  assert.equal((await asAnon(db, `select count(*)::int n from site_articles`)).rows[0].n, 1);
  // hẹn giờ: đã "đăng" nhưng thời điểm đăng ở tương lai thì khách chưa thấy
  await art(chief, null, { slug: 'tin-hen-gio', at: new Date(Date.now() + 86400000).toISOString() }, 'published', null);
  assert.equal((await asAnon(db, `select count(*)::int n from site_articles`)).rows[0].n, 1);
  // hội chợ
  await art(chief, null, { channel: 'hoi_cho', section: null, slug: 'hoi-cho-nong-san', start: '2026-11-14', end: '2026-11-16', place: 'Hà Nội' }, 'published', null);
  const ev = (await asAnon(db, `select event_start::text s, event_place p from site_articles where channel='hoi_cho'`)).rows[0];
  assert.deepEqual([ev.s, ev.p], ['2026-11-14', 'Hà Nội']);
  assert.match(await expectError(art(chief, null, { channel: 'hoi_cho', slug: 'sai-ngay', start: '2026-11-16', end: '2026-11-14' }, 'draft', null)), /check|violates/i);
  assert.match(await expectError(art(chief, null, { channel: 'xuat_khau', slug: 'co-ngay', start: '2026-11-14' }, 'draft', null)), /check|violates/i);
  assert.match(await expectError(art(chief, null, { slug: 'Sai Dia Chi' }, 'draft', null)), /INVALID/);
  assert.match(await expectError(asUser(db, chief, `select site_save_article(null,'nong_nghiep',null,'lk','T',null,'',null,null,'javascript:x',null,null,null,null,'draft',null,null)`)), /check|violates/i);
});

test('yêu cầu báo giá: khách không cần tài khoản; kiểm tra dữ liệu, chống lạm dụng; chỉ nhân sự website xem và xử lý', async () => {
  const { db, admin, chief, editor, owner, nobody, org, prof } = await setup();
  await mat(db, chief, null, 'npk', 'published', null);
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  const listing = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name) values ($1,$2,'Dưa lưới Taki') returning id`, [prof, org])).rows[0].id;
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  const send = (kind, target, over = {}) => asAnon(db, `select submit_quote_request($1,$2,$3,$4,$5,'100 kg',$6) id`,
    [kind, target, over.name ?? 'Nguyễn Văn An', over.phone === undefined ? '0912 345 678' : over.phone, over.email ?? null, over.msg ?? 'Cần báo giá 100 kg']);
  await send('material', 'npk');
  await send('product', listing, { phone: '0988111222' });
  await send('profile', 'vuon-nha-mang-thanh-cong', { phone: '0988333444' });
  await send('general', null, { phone: '0988555666' });
  assert.match(await expectError(send('material', 'khong-co', { phone: '0900000001' })), /NOT_FOUND/);
  assert.match(await expectError(send('product', '00000000-0000-4000-8000-000000000999', { phone: '0900000002' })), /NOT_FOUND/);
  assert.match(await expectError(send('general', null, { phone: null, email: null })), /INVALID/);
  assert.match(await expectError(send('general', null, { phone: '123' })), /INVALID/);
  assert.match(await expectError(send('general', null, { phone: '0900000003', msg: 'xem http://spam.com' })), /INVALID/);
  assert.match(await expectError(send('general', null, { phone: '0900000004', name: 'A' })), /INVALID/);
  // giới hạn 3 yêu cầu mỗi liên hệ mỗi 24 giờ (số '0912 345 678' đã gửi 1 lần)
  await send('general', null, { msg: 'lần 2' });
  await send('general', null, { msg: 'lần 3' });
  assert.match(await expectError(send('general', null, { msg: 'lần 4' })), /RATE_LIMIT/);
  // quyền đọc
  assert.match(await expectError(asAnon(db, `select * from quote_requests`)), /permission|denied/i);
  assert.match(await expectError(asUser(db, nobody, `select site_list_quotes(null,10)`)), /FORBIDDEN/);
  const list = (await asUser(db, editor, `select site_list_quotes('new',50) l`)).rows[0].l;
  assert.equal(list.length, 6);
  const prod = list.find((q) => q.kind === 'product');
  assert.deepEqual([prod.target_name, prod.org_name, prod.sender_phone], ['Dưa lưới Taki', 'Vườn Thành Công', '0988111222']);
  await asUser(db, editor, `select site_set_quote($1,'handled','Đã gọi lại')`, [prod.id]);
  assert.equal((await asUser(db, editor, `select site_list_quotes('new',50) l`)).rows[0].l.length, 5);
  assert.match(await expectError(asUser(db, nobody, `select site_set_quote($1,'spam',null)`, [prod.id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, editor, `select site_set_quote($1,'khac',null)`, [prod.id])), /INVALID/);
});

test('tìm kiếm không dấu trên cơ sở, sản phẩm, vật tư, bài viết; truy vấn quá ngắn trả rỗng', async () => {
  const { db, admin, chief, owner, org, prof } = await setup();
  assert.equal((await asAnon(db, `select fold_vi('Dưa Lưới ĐẸP') f`)).rows[0].f, 'dua luoi dep');
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile']::text[],'v1')`, [org, prof]);
  await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name) values ($1,$2,'Dưa lưới Taki')`, [prof, org]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  await mat(db, chief, null, 'dua-luoi-phan', 'published', null, { name: 'Phân cho dưa lưới' });
  await asUser(db, chief, `select site_save_article(null,'nong_nghiep','ky-thuat','trong-dua-luoi','Kỹ thuật trồng dưa lưới',null,'',null,null,null,null,null,null,null,'published',null,null)`);
  const r = (await asAnon(db, `select site_search('dua luoi') r`)).rows[0].r;
  assert.deepEqual([r.profiles.length, r.products.length, r.materials.length, r.articles.length], [1, 1, 1, 1]);
  assert.equal(r.products[0].profile_name, 'Vườn nhà màng Thành Công');
  const e = (await asAnon(db, `select site_search('d') r`)).rows[0].r;
  assert.deepEqual([e.profiles.length, e.products.length, e.materials.length, e.articles.length], [0, 0, 0, 0]);
  assert.equal((await asAnon(db, `select site_search('khongcotu') r`)).rows[0].r.materials.length, 0);
});
