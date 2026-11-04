import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Ảnh chèn vào trang tĩnh: chỉ biên tập tải lên; khách đọc từng ảnh qua hàm, không liệt kê được.
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
test('tải ảnh trang tĩnh: chỉ biên tập; khách đọc theo mã, không đọc trực tiếp bảng', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), editor = await addUser(db, 2), nobody = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','editor',true)`);
  assert.match(await expectError(asUser(db, nobody, `select site_upload_page_image($1)`, [IMG])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, editor, `select site_upload_page_image('<script>')`)), /INVALID/);
  const id = (await asUser(db, editor, `select site_upload_page_image($1) id`, [IMG])).rows[0].id;
  assert.equal((await asAnon(db, `select public_page_image($1) i`, [id])).rows[0].i, IMG);
  assert.equal((await asAnon(db, `select public_page_image(gen_random_uuid()) i`)).rows[0].i, null);
  assert.match(await expectError(asAnon(db, `select count(*) from site_page_images`)), /permission|denied/i);
  assert.match(await expectError(asAnon(db, `select site_upload_page_image($1)`, [IMG])), /permission|denied/i);
});

test('thư viện ảnh: liệt kê kèm trang đang dùng; ảnh đang dùng không xóa được; ảnh chưa dùng xóa được', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), editor = await addUser(db, 2), nobody = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','editor',true)`);
  const a = (await asUser(db, editor, `select site_upload_page_image($1) id`, [IMG])).rows[0].id;
  const b = (await asUser(db, editor, `select site_upload_page_image($1) id`, [IMG])).rows[0].id;
  await db.query(`insert into site_pages (slug, title, body, status) values ('thu', 'Thử', $1, 'draft')`, ['![x](/anh/pg/' + a + ')']);
  assert.match(await expectError(asUser(db, nobody, `select site_list_page_images()`)), /FORBIDDEN/);
  const l = (await asUser(db, editor, `select site_list_page_images() l`)).rows[0].l;
  assert.equal(l.length, 2);
  assert.deepEqual(l.find((x) => x.id === a).used_in, ['thu']);
  assert.deepEqual(l.find((x) => x.id === b).used_in, []);
  assert.match(await expectError(asUser(db, editor, `select site_delete_page_image($1)`, [a])), /INVALID.*thu/);
  await asUser(db, editor, `select site_delete_page_image($1)`, [b]);
  assert.equal((await asUser(db, editor, `select site_list_page_images() l`)).rows[0].l.length, 1);
  assert.match(await expectError(asUser(db, editor, `select site_delete_page_image($1)`, [b])), /NOT_FOUND/);
  assert.equal((await asAnon(db, `select public_page_image($1) i`, [b])).rows[0].i, null);
});

test('kho ảnh công khai site-images: chỉ biên tập ghi/xóa đúng đường dẫn; cột ảnh nhận tham chiếu sb:', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), editor = await addUser(db, 2), nobody = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','editor',true)`);
  const U = '11111111-2222-4333-8444-555555555555';
  const put = (u, name) => asUser(db, u, `insert into storage.objects (bucket_id, name) values ('site-images', $1)`, [name]);
  await put(editor, `site/banners/${U}.jpg`);
  assert.match(await expectError(put(nobody, `site/banners/${U}.jpg`)), /policy|denied|row-level/i);
  assert.match(await expectError(put(editor, `site/khac/${U}.jpg`)), /policy|denied|row-level/i);
  assert.match(await expectError(put(editor, `site/banners/../${U}.jpg`)), /policy|denied|row-level/i);
  assert.equal((await db.query(`select public from storage.buckets where id = 'site-images'`)).rows[0].public, true);
  // banner chấp nhận tham chiếu sb: đúng dạng, từ chối dạng sai
  const banner = (img) => asUser(db, editor, `select site_save_banner(null,'hero','T','',$1,'',0,null,null,'draft',null) id`, [img]);
  const b = (await banner(`sb:site/banners/${U}.jpg`)).rows[0].id;
  assert.equal((await db.query(`select has_image from site_banners where id = $1`, [b])).rows[0].has_image, true);
  assert.match(await expectError(banner(`sb:site/banners/../x.jpg`)), /check|violat/i);
  // ảnh trang tĩnh: ghi sổ theo mã, đọc theo mã, xóa
  const P = '22222222-3333-4444-8555-666666666666';
  await asUser(db, editor, `select site_register_page_image($1)`, [P]);
  assert.equal((await asAnon(db, `select public_page_image($1) i`, [P])).rows[0].i, `sb:site/pages/${P}.jpg`);
  assert.match(await expectError(asUser(db, nobody, `select site_register_page_image($1)`, ['33333333-4444-4555-8666-777777777777'])), /FORBIDDEN/);
  await asUser(db, editor, `select site_delete_page_image($1)`, [P]);
  // ảnh nhẹ hồ sơ/sản phẩm: tham chiếu sb: được coi là ảnh hợp lệ
  assert.equal((await db.query(`select lite_images('[{"src":"sb:site/x.jpg"},{"src":"http://x"}]'::jsonb) l`)).rows[0].l[0].ok, true);
});
