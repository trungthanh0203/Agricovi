import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser } from './harness.mjs';

// Migration 0236 (D226): đổi thương hiệu Acovin: tên miền email ẩn đăng nhập + chữ thương hiệu trong cấu hình/nội dung.

const MIG = readFileSync(new URL('../migrations/20261018000236_shared_rename_acovin.sql', import.meta.url), 'utf8');

test('đổi tên miền email ẩn: tài khoản số điện thoại vẫn đăng nhập được (email, đăng ký, cấu hình khớp nhau)', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const k = await addUser(db, 2);
  // trạng thái "trước khi đổi": dữ liệu và cấu hình mang tên miền cũ
  await db.query(`update auth.users set email = '0912345678@sdt.agricovi.com' where id = $1`, [u]);
  await db.query(`update auth.users set email = 'kiosk-abc@kiosk.agricovi.com' where id = $1`, [k]);
  await db.exec(`update platform_settings set value = '"agricovi.com"'::jsonb where key = 'login_email_domain'`);
  await db.query(`insert into owner_signups (user_id, phone, auth_email, full_name, org_name) values ($1, '0912345678', '0912345678@sdt.agricovi.com', 'Chủ A', 'Trại A')`, [u]);

  await db.exec(MIG);

  assert.equal((await db.query(`select email from auth.users where id = $1`, [u])).rows[0].email, '0912345678@sdt.acovin.com');
  assert.equal((await db.query(`select email from auth.users where id = $1`, [k])).rows[0].email, 'kiosk-abc@kiosk.acovin.com');
  assert.equal((await db.query(`select auth_email from owner_signups where user_id = $1`, [u])).rows[0].auth_email, '0912345678@sdt.acovin.com');
  assert.equal((await db.query(`select value #>> '{}' v from platform_settings where key = 'login_email_domain'`)).rows[0].v, 'acovin.com');
  // chủ đăng ký bằng điện thoại: hàm tính email đăng nhập ra đúng email đã đổi
  assert.equal((await db.query(`select login_email_for_phone('0912345678') e`)).rows[0].e, '0912345678@sdt.acovin.com');
  // chạy lại không đổi gì thêm
  await db.exec(MIG);
  assert.equal((await db.query(`select email from auth.users where id = $1`, [u])).rows[0].email, '0912345678@sdt.acovin.com');
});

test('chữ thương hiệu cũ trong cấu hình và nội dung website đổi sang Acovin; mô tả rỗng giữ rỗng', async () => {
  const db = await createDb();
  await db.exec(`insert into platform_settings (key, value) values ('contact_info', '{"company":"CÔNG TY TNHH AGRICOVI","email":"lienhe@agricovi.com","website":"https://agricovi.com"}'::jsonb)
                 on conflict (key) do update set value = excluded.value`);
  await db.exec(`insert into site_settings (key, value) values ('brand', '{"name":"Agricovi","tagline":"Kết nối nông nghiệp Việt"}'::jsonb)
                 on conflict (key) do update set value = excluded.value`);
  await db.exec(`insert into site_pages (slug, title, description, body) values ('gioi-thieu', 'Giới thiệu Agricovi', null, 'Chào mừng đến AgriConnect (AgriCoVi).')`);
  await db.exec(`insert into site_pages (slug, title, description, body) values ('khac', 'Trang khác', null, 'Không có tên cũ.')`);

  await db.exec(MIG);

  const c = (await db.query(`select value from platform_settings where key = 'contact_info'`)).rows[0].value;
  assert.deepEqual(c, { company: 'CÔNG TY TNHH ACOVIN', email: 'lienhe@acovin.com', website: 'https://acovin.com' });
  assert.equal((await db.query(`select value->>'name' n from site_settings where key = 'brand'`)).rows[0].n, 'Acovin');
  const p = (await db.query(`select title, description, body from site_pages where slug = 'gioi-thieu'`)).rows[0];
  assert.deepEqual(p, { title: 'Giới thiệu Acovin', description: null, body: 'Chào mừng đến Acovin (Acovin).' });
  assert.equal((await db.query(`select body from site_pages where slug = 'khac'`)).rows[0].body, 'Không có tên cũ.');
});
