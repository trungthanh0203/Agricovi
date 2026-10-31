import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0140 (D130): thông tin liên hệ do quản trị nền tảng sửa; khách đọc được qua public_contact_info().

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  return { db, admin, owner };
}
const KEYS = ['address', 'company', 'email', 'facebook', 'phone', 'website', 'youtube', 'zalo'];

test('có sẵn dữ liệu mẫu đủ 8 mục; khách (chưa đăng nhập) đọc được', async () => {
  const { db } = await setup();
  const r = (await asAnon(db, `select public_contact_info() c`)).rows[0].c;
  assert.deepEqual(Object.keys(r).sort(), KEYS);
  assert.match(r.company, /mẫu/);
});

test('chỉ quản trị nền tảng sửa được; mục lạ, đường dẫn và email sai bị từ chối', async () => {
  const { db, admin, owner } = await setup();
  const ok = JSON.stringify({ company: 'Công ty ABC', address: '1 Đường X', phone: '0900', zalo: '0900', website: 'https://abc.vn', email: 'a@abc.vn', facebook: '', youtube: '' });
  assert.match(await expectError(asUser(db, owner, `select admin_set_setting('contact_info', $1::jsonb)`, [ok])), /FORBIDDEN/);
  await asUser(db, admin, `select admin_set_setting('contact_info', $1::jsonb)`, [ok]);
  assert.equal((await asAnon(db, `select public_contact_info() c`)).rows[0].c.company, 'Công ty ABC');
  const bad = (patch) => expectError(asUser(db, admin, `select admin_set_setting('contact_info', $1::jsonb)`, [JSON.stringify({ ...JSON.parse(ok), ...patch })]));
  assert.match(await bad({ website: 'abc.vn' }), /INVALID_VALUE/);
  assert.match(await bad({ email: 'khong-phai-email' }), /INVALID_VALUE/);
  assert.match(await bad({ lạ: 'x' }), /INVALID_VALUE/);
  assert.match(await bad({ phone: 123 }), /INVALID_VALUE/);
  assert.match(await expectError(asUser(db, admin, `select admin_set_setting('contact_info', '[1]'::jsonb)`)), /INVALID_VALUE/);
});
