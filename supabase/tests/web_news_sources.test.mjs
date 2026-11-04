import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

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

test('tin nhiều và đều: quy tắc mục con, duyệt hàng loạt, danh sách quản trị, trang tin, tự xóa nháp cũ', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), chief = await addUser(db, 2), editor = await addUser(db, 3), nobody = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','chief_editor',true)`);
  await asUser(db, admin, `select admin_set_site_role('u3@test.local','editor',true)`);
  const rules = JSON.stringify([{ section: 'chinh-sach', keywords: ['nghị định', 'thuế'] }, { section: 'thi-truong', keywords: ['giá'] }]);
  const src = (await asUser(db, editor, `select site_save_news_source(null,'Báo B','https://b.vn/rss','xuat_khau','quy-dinh','',true,10,$1::jsonb) id`, [rules])).rows[0].id;
  assert.match(await expectError(asUser(db, editor, `select site_save_news_source(null,'X','https://b.vn/r','xuat_khau',null,'',true,10,'{"a":1}'::jsonb)`)), /INVALID/);
  const items = JSON.stringify([
    { title: 'Nghị định mới về xuất khẩu gạo', link: 'https://b.vn/1' },
    { title: 'Giá cà phê tăng', link: 'https://b.vn/2' },
    { title: 'Tin khác không khớp', link: 'https://b.vn/3' },
  ]);
  assert.equal((await db.query(`select news_ingest($1,$2::jsonb) n`, [src, items])).rows[0].n, 3);
  const sec = Object.fromEntries((await db.query(`select source_url u, section s from site_articles`)).rows.map((r) => [r.u, r.s]));
  assert.deepEqual(sec, { 'https://b.vn/1': 'chinh-sach', 'https://b.vn/2': 'thi-truong', 'https://b.vn/3': 'quy-dinh' });

  // danh sách quản trị: chờ duyệt (có nguồn dẫn), phân trang, tìm không dấu; khách/người ngoài bị chặn
  assert.match(await expectError(asUser(db, nobody, `select site_list_articles()`)), /FORBIDDEN/);
  let l = (await asUser(db, editor, `select site_list_articles(true,null,null,null,null,0,2) r`)).rows[0].r;
  assert.equal(l.total, 3); assert.equal(l.rows.length, 2); assert.equal(l.rows[0].body, undefined);
  l = (await asUser(db, editor, `select site_list_articles(true,'xuat_khau','chinh-sach',null,'nghi dinh',0,30) r`)).rows[0].r;
  assert.equal(l.total, 1);
  const ids = (await db.query(`select id, source_url u from site_articles order by source_url`)).rows;

  // duyệt hàng loạt: biên tập viên đăng 2 bài, xóa 1 nháp, người ngoài bị chặn
  assert.match(await expectError(asUser(db, nobody, `select site_bulk_articles($1::uuid[],'publish')`, [[ids[0].id]])), /FORBIDDEN/);
  assert.equal((await asUser(db, editor, `select site_bulk_articles($1::uuid[],'publish') n`, [[ids[0].id, ids[1].id]])).rows[0].n, 2);
  assert.equal((await asUser(db, editor, `select site_bulk_articles($1::uuid[],'delete') n`, [[ids[0].id, ids[2].id]])).rows[0].n, 1); // bài đã đăng không xóa được
  assert.equal((await db.query(`select count(*)::int n from site_articles`)).rows[0].n, 2);
  assert.equal((await asUser(db, chief, `select site_bulk_articles($1::uuid[],'move',$2,$3) n`, [[ids[1].id], 'nong_nghiep', 'ky-thuat'])).rows[0].n, 1);

  // trang tin cho website (khách): chỉ bài đã đăng, lọc mục con, phân trang
  const pg = (args) => asAnon(db, `select site_articles_page($1,$2,$3,$4,$5) r`, args).then((x) => x.rows[0].r);
  let p = await pg(['nong_nghiep', null, 'all', 0, 12]);
  assert.equal(p.total, 1); assert.equal(p.items[0].section, 'ky-thuat');
  assert.equal((await pg(['nong_nghiep', 'chinh-sach', 'all', 0, 12])).total, 0);
  assert.equal((await pg(['xuat_khau', null, 'all', 0, 12])).total, 1);
  assert.equal((await pg(['khac', null, 'all', 0, 12])).total, 0);

  // tự xóa nháp tự động quá 15 ngày chưa ai đụng tới; nháp đã có người sửa thì giữ
  await db.query(`insert into site_articles (channel, slug, title, source_url, status, created_at) values ('nong_nghiep','cu-1','Cũ chưa ai mở','https://b.vn/old1','draft', now() - interval '16 days')`);
  await db.query(`insert into site_articles (channel, slug, title, source_url, status, created_at, updated_by) values ('nong_nghiep','cu-2','Cũ đã có người sửa','https://b.vn/old2','draft', now() - interval '16 days', $1)`, [editor]);
  await db.query(`insert into site_articles (channel, slug, title, source_url, status, created_at) values ('nong_nghiep','moi-1','Mới','https://b.vn/new1','draft', now() - interval '3 days')`);
  assert.equal((await db.query(`select news_cleanup() n`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from site_articles where slug in ('cu-2','moi-1')`)).rows[0].n, 2);
  assert.match(await expectError(asUser(db, editor, `select news_cleanup()`)), /permission|denied/i);
});
