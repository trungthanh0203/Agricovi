import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0191: theo dõi sử dụng — ghi của chính mình, nhiều thiết bị, tổng hợp ngày, quản trị đọc, dọn dữ liệu cũ.
const U = (n) => `b2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DEV_A = U(101), DEV_B = U(102);

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), a = await addUser(db, 2), b = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, a, `select create_organization('household','Hộ A') id`)).rows[0].id;
  return { db, admin, a, b, org };
}
const ping = (c, who, o = {}) => asUser(c.db, who, `select usage_ping($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
  [o.session ?? U(1), o.org === undefined ? c.org : o.org, o.device ?? DEV_A, o.label ?? 'Chrome · Android · SM-A546E', o.standalone ?? true, '1.0', o.seconds ?? 60,
    JSON.stringify(o.screens ?? { 'production/cycles': 40, stock: 20 }), o.country ?? 'VN', o.colo ?? 'SGN', o.login ?? null, o.ended ?? false]);

test('ghi tín hiệu: một dòng phiên cộng dồn, tổng hợp ngày, mã màn lạ bị bỏ, người khác không ghi đè phiên', async () => {
  const c = await setup();
  await ping(c, c.a, { login: 'password' });
  await ping(c, c.a, { seconds: 60, screens: { 'production/cycles': 30, 'Bad Key!': 99, stock: 'abc' } });
  const s = (await c.db.query(`select seconds, screens, country, colo, standalone, ended_at from usage_sessions where id = $1`, [U(1)])).rows[0];
  assert.equal(s.seconds, 120);
  assert.deepEqual(s.screens, { 'production/cycles': 70, stock: 20 });
  assert.equal(s.country, 'VN'); assert.equal(s.colo, 'SGN'); assert.equal(s.ended_at, null);
  assert.equal((await c.db.query(`select count(*)::int n from usage_sessions`)).rows[0].n, 1);       // một dòng, không sinh dòng mỗi lần
  const d = (await c.db.query(`select sessions, logins, seconds from usage_daily`)).rows[0];
  assert.deepEqual([d.sessions, d.logins, d.seconds], [1, 1, 120]);
  assert.match(await expectError(ping(c, c.b)), /FORBIDDEN/);                                         // phiên của người khác
  await ping(c, c.a, { seconds: 5000 });                                                              // giây bị chặn ở 300
  assert.equal((await c.db.query(`select seconds from usage_sessions where id = $1`, [U(1)])).rows[0].seconds, 420);
  await ping(c, c.a, { seconds: 10, ended: true });
  assert.ok((await c.db.query(`select ended_at from usage_sessions where id = $1`, [U(1)])).rows[0].ended_at);
  // cơ sở không phải của mình bị bỏ qua, không lỗi
  await ping(c, c.b, { session: U(2), org: c.org });
  assert.equal((await c.db.query(`select organization_id from usage_sessions where id = $1`, [U(2)])).rows[0].organization_id, null);
  assert.match(await expectError(asUser(c.db, c.a, `select usage_ping(null,null,null,null,false,null,0,null,null,null)`)), /BAD_REQUEST/);
});

test('một tài khoản nhiều thiết bị: phân biệt từng máy, báo dùng cùng lúc; IP lấy từ phần đầu yêu cầu', async () => {
  const c = await setup();
  await c.db.exec(`select set_config('request.headers', '{"x-forwarded-for":"113.1.2.3, 10.0.0.1","cf-ipcountry":"VN","cf-ipcity":"Hanoi"}', false)`);
  await ping(c, c.a, { session: U(1), device: DEV_A, label: 'Chrome · Android · SM-A546E' });
  await ping(c, c.a, { session: U(2), device: DEV_B, label: 'Safari · iPhone' });
  await ping(c, c.a, { session: U(1), device: DEV_A, label: 'Chrome · Android · SM-A546E' });   // máy A còn báo sau khi máy B mở: hai máy cùng lúc
  const day = (await asUser(c.db, c.admin, `select admin_usage_account_day($1, null) r`, [c.a])).rows[0].r;
  assert.equal(day.devices.length, 2);
  assert.deepEqual(day.devices.map((x) => x.label).sort(), ['Chrome · Android · SM-A546E', 'Safari · iPhone']);
  assert.equal(day.sessions.length, 2);
  assert.equal(day.sessions[0].ip, '113.1.2.3');
  assert.equal(day.sessions[0].city, 'Hanoi');
  assert.equal(day.overlap, true);                          // hai máy cùng đang mở
  assert.equal(day.user.email.includes('@'), true);
});

test('quản trị: tóm tắt, bảng theo tài khoản (sắp xếp, tìm, lọc cơ sở), chức năng; người thường bị từ chối', async () => {
  const c = await setup();
  await ping(c, c.a, { session: U(1), seconds: 120, screens: { stock: 100, 'production/cycles': 20 } });
  await ping(c, c.b, { session: U(2), org: null, device: DEV_B, seconds: 30, screens: { home: 30 } });
  const sum = (await asUser(c.db, c.admin, `select admin_usage_summary(null) r`)).rows[0].r;
  assert.deepEqual([sum.accounts, sum.sessions, sum.seconds].map(Number), [2, 2, 150]);
  assert.equal(Number(sum.online_now), 2);
  const rows = (await asUser(c.db, c.admin, `select admin_usage_accounts(null,null,null,6,true,30,0) r`)).rows[0].r;
  assert.equal(Number(rows.total), 2);
  assert.equal(Number(rows.rows[0][7]), 120);                // sắp xếp giảm dần theo thời gian dùng
  assert.match(rows.rows[0][9], /stock/);                    // chức năng dùng nhiều nhất
  const one = (await asUser(c.db, c.admin, `select admin_usage_accounts(null,$1,null,1,false,30,0) r`, [c.org])).rows[0].r;
  assert.equal(Number(one.total), 1);
  const found = (await asUser(c.db, c.admin, `select admin_usage_accounts(null,null,'hộ a',1,false,30,0) r`)).rows[0].r;
  assert.equal(Number(found.total), 1);
  const scr = (await asUser(c.db, c.admin, `select admin_usage_screens(7) r`)).rows[0].r;
  assert.equal(scr[0].screen, 'stock');
  for (const q of [`select admin_usage_summary(null)`, `select admin_usage_accounts()`, `select admin_usage_screens(7)`]) assert.match(await expectError(asUser(c.db, c.a, q)), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.a, `select admin_usage_account_day($1)`, [c.a])), /FORBIDDEN/);
  // không ai đọc trực tiếp bảng
  assert.match(await expectError(asUser(c.db, c.a, `select * from usage_sessions`)), /permission denied|row-level|denied/i);
});

test('dọn dữ liệu: thô > 10 ngày, tổng hợp > 1 năm bị xóa; còn mới thì giữ', async () => {
  const c = await setup();
  await ping(c, c.a, { session: U(1) });
  await c.db.query(`insert into usage_sessions (id, user_id, device_id, started_at, last_seen_at) values ($1,$2,$3, now() - interval '11 days', now() - interval '11 days')`, [U(9), c.a, DEV_A]);
  await c.db.query(`insert into usage_daily (day, user_id, device_id) values (vn_today() - 400, $1, $2), (vn_today() - 300, $1, $2)`, [c.a, DEV_A]);
  await c.db.query(`select usage_cleanup()`);
  assert.equal((await c.db.query(`select count(*)::int n from usage_sessions`)).rows[0].n, 1);
  assert.equal((await c.db.query(`select count(*)::int n from usage_daily where day < vn_today()`)).rows[0].n, 1);
});
