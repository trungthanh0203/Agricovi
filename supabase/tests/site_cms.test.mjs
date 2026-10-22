import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0042 (W1, D60–D61): khung CMS website — vai trò biên tập, trang, banner, menu, cài đặt.
async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), chief = await addUser(db, 2), editor = await addUser(db, 3), nobody = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','chief_editor',true)`);
  await asUser(db, admin, `select admin_set_site_role('u3@test.local','editor',true)`);
  return { db, admin, chief, editor, nobody };
}
const page = (db, u, id, slug, status, version, body = 'Xin chào') =>
  asUser(db, u, `select site_save_page($1,$2,'Giới thiệu','Mô tả',$3,$4,$5) id`, [id, slug, body, status, version]);

test('chỉ quản trị viên cấp vai trò biên tập; người thường không có vai trò', async () => {
  const { db, admin, chief, nobody } = await setup();
  assert.match(await expectError(asUser(db, chief, `select admin_set_site_role('u4@test.local','editor',true)`)), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, admin, `select admin_set_site_role('khong-co@test.local','editor',true)`)), /NOT_FOUND/);
  assert.deepEqual((await asUser(db, admin, `select get_my_site_roles() r`)).rows[0].r, ['admin']);
  assert.deepEqual((await asUser(db, chief, `select get_my_site_roles() r`)).rows[0].r, ['chief_editor']);
  assert.deepEqual((await asUser(db, nobody, `select get_my_site_roles() r`)).rows[0].r, []);
  assert.match(await expectError(page(db, nobody, null, 'gioi-thieu', 'draft', null)), /FORBIDDEN/);
  const l = (await asUser(db, admin, `select admin_list_site_roles() l`)).rows[0].l;
  assert.equal(l.length, 2);
  await asUser(db, admin, `select admin_set_site_role('u3@test.local','editor',false)`);
  assert.equal((await asUser(db, admin, `select admin_list_site_roles() l`)).rows[0].l.length, 1);
});

test('trang: website (anon) chỉ thấy bản đã đăng; không ghi trực tiếp được', async () => {
  const { db, chief, editor } = await setup();
  const draft = (await page(db, editor, null, 'gioi-thieu', 'draft', null)).rows[0].id;
  assert.equal((await asAnon(db, `select count(*)::int n from site_pages`)).rows[0].n, 0);
  assert.equal((await asUser(db, editor, `select count(*)::int n from site_pages`)).rows[0].n, 1);
  await page(db, chief, draft, 'gioi-thieu', 'published', 1);
  assert.equal((await asAnon(db, `select count(*)::int n from site_pages where status='published'`)).rows[0].n, 1);
  assert.match(await expectError(asAnon(db, `insert into site_pages (slug,title) values ('x','x')`)), /permission|policy|denied/i);
  assert.match(await expectError(asAnon(db, `update site_pages set title='hack' returning id`)), /permission|denied/i);
  assert.match(await expectError(asUser(db, editor, `update site_pages set title='hack'`)), /permission|denied/i);
  assert.match(await expectError(asUser(db, editor, `select count(*) from platform_roles`)), /permission|denied/i);
});

test('biên tập viên chỉ soạn nháp/gửi duyệt; đăng và sửa bản đã đăng cần tổng biên tập', async () => {
  const { db, chief, editor } = await setup();
  const id = (await page(db, editor, null, 'dieu-khoan', 'draft', null)).rows[0].id;
  await page(db, editor, id, 'dieu-khoan', 'review', 1);
  assert.match(await expectError(page(db, editor, id, 'dieu-khoan', 'published', 2)), /FORBIDDEN/);
  assert.match(await expectError(page(db, editor, null, 'moi', 'published', null)), /FORBIDDEN/);
  await page(db, chief, id, 'dieu-khoan', 'published', 2);
  assert.match(await expectError(page(db, editor, id, 'dieu-khoan', 'draft', 3)), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, editor, `select site_delete_page($1)`, [id])), /FORBIDDEN/);
  await asUser(db, chief, `select site_delete_page($1)`, [id]);
  assert.equal((await asUser(db, chief, `select count(*)::int n from site_pages`)).rows[0].n, 0);
});

test('trang: kiểm tra phiên bản, lưu lịch sử, địa chỉ hợp lệ và không trùng chức năng khác', async () => {
  const { db, chief } = await setup();
  const id = (await page(db, chief, null, 'gioi-thieu', 'published', null, 'v1')).rows[0].id;
  await page(db, chief, id, 'gioi-thieu', 'published', 1, 'v2');
  assert.match(await expectError(page(db, chief, id, 'gioi-thieu', 'published', 1, 'v3')), /CONFLICT/);
  const cur = (await asUser(db, chief, `select version, body from site_pages where id=$1`, [id])).rows[0];
  assert.deepEqual([cur.version, cur.body], [2, 'v2']);
  const hist = (await asUser(db, chief, `select version, body from site_page_versions where page_id=$1`, [id])).rows;
  assert.deepEqual(hist.map((h) => [h.version, h.body]), [[1, 'v1']]);
  for (const bad of ['Co So', 'a--b', 'co-so', 'quan-tri', 'giao-thuong', '']) {
    assert.match(await expectError(page(db, chief, null, bad, 'draft', null)), /INVALID/);
  }
  assert.match(await expectError(page(db, chief, null, 'gioi-thieu', 'draft', null)), /duplicate|unique/i);
});

test('banner: chỉ hiện khi đã đăng và trong thời gian hiển thị; kiểm tra ảnh và liên kết', async () => {
  const { db, chief, editor } = await setup();
  const ban = (u, id, status, version, over = {}) => asUser(db, u,
    `select site_save_banner($1,$2,$3,'Phụ đề',$4,$5,1,$6,$7,$8,$9) id`,
    [id, over.slot ?? 'hero', over.title ?? 'Nông sản sạch', over.image ?? '', over.link ?? '/danh-ba/', over.starts ?? null, over.ends ?? null, status, version]);
  const draft = (await ban(editor, null, 'draft', null)).rows[0].id;
  assert.equal((await asAnon(db, `select count(*)::int n from site_banners`)).rows[0].n, 0);
  assert.match(await expectError(ban(editor, null, 'published', null)), /FORBIDDEN/);
  await ban(chief, draft, 'published', 1);
  assert.equal((await asAnon(db, `select count(*)::int n from site_banners`)).rows[0].n, 1);
  await ban(chief, draft, 'published', 2, { starts: new Date(Date.now() + 86400000).toISOString() });
  assert.equal((await asAnon(db, `select count(*)::int n from site_banners`)).rows[0].n, 0);
  await ban(chief, draft, 'published', 3, { ends: new Date(Date.now() - 86400000).toISOString(), starts: new Date(Date.now() - 2 * 86400000).toISOString() });
  assert.equal((await asAnon(db, `select count(*)::int n from site_banners`)).rows[0].n, 0);
  assert.match(await expectError(ban(chief, null, 'draft', null, { link: 'javascript:alert(1)' })), /check|violates/i);
  assert.match(await expectError(ban(chief, null, 'draft', null, { image: 'http://x/a.png' })), /check|violates/i);
  assert.match(await expectError(ban(chief, null, 'draft', null, { slot: 'khac' })), /check|violates/i);
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const ok = (await ban(chief, null, 'published', null, { image: png, slot: 'side', link: 'https://example.com/x' })).rows[0].id;
  assert.equal((await asAnon(db, `select image from site_banners where id=$1`, [ok])).rows[0].image, png);
  assert.match(await expectError(ban(chief, ok, 'published', 99)), /CONFLICT/);
});

test('menu và cài đặt: ai cũng đọc, chỉ tổng biên tập sửa, có kiểm tra phiên bản', async () => {
  const { db, chief, editor } = await setup();
  const items = JSON.stringify([{ label: 'Giao thương', href: '/giao-thuong/' }]);
  assert.match(await expectError(asUser(db, editor, `select site_save_menu('header_nav',$1::jsonb,null)`, [items])), /FORBIDDEN/);
  await asUser(db, chief, `select site_save_menu('header_nav',$1::jsonb,null)`, [items]);
  assert.equal((await asAnon(db, `select jsonb_array_length(items) n from site_menus where key='header_nav'`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, chief, `select site_save_menu('header_nav','[]'::jsonb,5)`)), /CONFLICT/);
  await asUser(db, chief, `select site_save_menu('header_nav','[]'::jsonb,1)`);
  assert.match(await expectError(asUser(db, chief, `select site_save_menu('la','[]'::jsonb,null)`)), /INVALID/);
  assert.match(await expectError(asUser(db, chief, `select site_save_menu('header_nav','{}'::jsonb,2)`)), /INVALID/);
  await asUser(db, chief, `select site_save_setting('contact','{"hotline":"1900 0000"}'::jsonb,null)`);
  assert.equal((await asAnon(db, `select value->>'hotline' h from site_settings where key='contact'`)).rows[0].h, '1900 0000');
  assert.match(await expectError(asUser(db, editor, `select site_save_setting('contact','{}'::jsonb,1)`)), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, chief, `select site_save_setting('contact','[]'::jsonb,1)`)), /INVALID/);
});

test('mọi thao tác ghi đều có nhật ký kiểm toán', async () => {
  const { db, admin, chief } = await setup();
  await page(db, chief, null, 'tro-giup', 'draft', null);
  const acts = (await db.query(`select action from audit_events where action like 'site_%' order by created_at, action`)).rows.map((r) => r.action);
  assert.ok(acts.includes('site_role_grant') && acts.includes('site_page_create'));
  void admin;
});

test('0044: cài đặt trang chủ, tổng quan website, nhật ký thao tác website', async () => {
  const { db, admin, chief, editor, nobody } = await setup();
  await asUser(db, chief, `select site_save_setting('home','{"blocks":[{"id":"giao_thuong","on":false}]}'::jsonb,null)`);
  assert.equal((await asAnon(db, `select value->'blocks'->0->>'id' b from site_settings where key='home'`)).rows[0].b, 'giao_thuong');
  assert.match(await expectError(asUser(db, chief, `select site_save_setting('khac','{}'::jsonb,null)`)), /check|INVALID/i);
  assert.match(await expectError(asUser(db, nobody, `select site_overview()`)), /FORBIDDEN/);
  const o = (await asUser(db, editor, `select site_overview() o`)).rows[0].o;
  assert.equal(Number(o.quotes_new), 0);
  assert.equal(o.profiles_pending, null);                       // biên tập viên không thấy số hồ sơ chờ duyệt
  assert.equal(Number((await asUser(db, admin, `select site_overview() o`)).rows[0].o.profiles_pending), 0);
  assert.match(await expectError(asUser(db, editor, `select site_list_audit(10)`)), /FORBIDDEN/);
  const a = (await asUser(db, chief, `select site_list_audit(50) a`)).rows[0].a;
  assert.ok(a.length >= 3 && a.every((x) => x.action.startsWith('site_')));
});
