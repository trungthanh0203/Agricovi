import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Nguồn tin tự động: biên tập quản lý nguồn; hàm nhận tin chỉ tạo bản nháp, bỏ trùng, ghi trạng thái lần chạy.
test('nguồn tin: quyền, nhận tin thành bản nháp, bỏ trùng, ghi lỗi', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), editor = await addUser(db, 2), nobody = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','editor',true)`);
  assert.match(await expectError(asUser(db, nobody, `select site_list_news_sources()`)), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, editor, `select site_save_news_source(null,'A','http://x.vn/rss','nong_nghiep',null,'',true,10)`)), /INVALID/);
  const id = (await asUser(db, editor, `select site_save_news_source(null,'Báo A','https://a.vn/rss','xuat_khau','trong-nuoc','xuất khẩu, gạo ',true,5) id`)).rows[0].id;
  const src = (await asUser(db, editor, `select site_list_news_sources() l`)).rows[0].l[0];
  assert.deepEqual(src.keywords, ['xuất khẩu', 'gạo']);
  const items = JSON.stringify([
    { title: 'Xuất khẩu gạo tăng mạnh', link: 'https://a.vn/b1', summary: 'Tóm tắt' },
    { title: 'Xuất khẩu gạo tăng mạnh', link: 'https://a.vn/b2' },
    { title: 'Link sai', link: 'http://a.vn/b3' },
    { title: '', link: 'https://a.vn/b4' },
  ]);
  assert.equal((await db.query(`select news_ingest($1, $2::jsonb) n`, [id, items])).rows[0].n, 2);
  assert.equal((await db.query(`select news_ingest($1, $2::jsonb) n`, [id, items])).rows[0].n, 0); // chạy lại: không nhân đôi
  const a = (await db.query(`select channel, section, status, source_name, source_url from site_articles order by source_url`)).rows;
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { channel: 'xuat_khau', section: 'trong-nuoc', status: 'draft', source_name: 'Báo A', source_url: 'https://a.vn/b1' });
  await db.query(`select news_ingest($1, '[]'::jsonb, 'hết giờ')`, [id]);
  assert.match((await asUser(db, editor, `select site_list_news_sources() l`)).rows[0].l[0].last_status, /Lỗi: hết giờ/);
  assert.match(await expectError(asUser(db, editor, `select news_ingest($1,'[]'::jsonb)`, [id])), /permission|denied/i);
  assert.match(await expectError(asUser(db, editor, `select site_delete_news_source($1)`, [id])), /FORBIDDEN/);
});
