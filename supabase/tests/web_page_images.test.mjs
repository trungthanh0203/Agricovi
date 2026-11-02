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
