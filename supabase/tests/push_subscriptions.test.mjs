import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0217 (H2 lát 1, D182): đăng ký thiết bị nhận thông báo đẩy, riêng tư theo người dùng.

const EP = (n) => `https://push.example.com/send/${n}`;
const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

test('đăng ký thiết bị, bấm lặp không nhân đôi; người khác không thấy và không đọc được khóa', async () => {
  const db = await createDb();
  const a = await addUser(db, 1), b = await addUser(db, 2);
  await asUser(db, a, `select save_push_subscription($1,$2,$3,'Chrome')`, [EP(1), KEY, AUTH]);
  await asUser(db, a, `select save_push_subscription($1,$2,$3,'Chrome')`, [EP(1), KEY, AUTH]);
  assert.equal((await asUser(db, a, `select id, endpoint from push_subscriptions`)).rows.length, 1);
  assert.equal((await asUser(db, b, `select id from push_subscriptions`)).rows.length, 0);
  assert.match(await expectError(asUser(db, a, `select p256dh from push_subscriptions`)), /permission denied|insufficient/i);
  assert.match(await expectError(asUser(db, a, `select auth from push_subscriptions`)), /permission denied|insufficient/i);
});

test('đăng nhập người khác trên cùng thiết bị thì chuyển người nhận; chỉ xóa được thiết bị của mình', async () => {
  const db = await createDb();
  const a = await addUser(db, 1), b = await addUser(db, 2);
  await asUser(db, a, `select save_push_subscription($1,$2,$3,null)`, [EP(1), KEY, AUTH]);
  await asUser(db, b, `select save_push_subscription($1,$2,$3,null)`, [EP(1), KEY, AUTH]);
  assert.equal((await asUser(db, a, `select id from push_subscriptions`)).rows.length, 0);
  assert.equal((await asUser(db, b, `select id from push_subscriptions`)).rows.length, 1);
  await asUser(db, a, `select remove_push_subscription($1)`, [EP(1)]);            // không phải của a: không xóa
  assert.equal((await db.query(`select count(*)::int n from push_subscriptions`)).rows[0].n, 1);
  await asUser(db, b, `select remove_push_subscription($1)`, [EP(1)]);
  assert.equal((await db.query(`select count(*)::int n from push_subscriptions`)).rows[0].n, 0);
});

test('địa chỉ và khóa sai bị chặn; mỗi người tối đa 10 thiết bị', async () => {
  const db = await createDb();
  const a = await addUser(db, 1);
  assert.match(await expectError(asUser(db, a, `select save_push_subscription('http://x.test/1',$1,$2,null)`, [KEY, AUTH])), /INVALID_ARGUMENT/);
  assert.match(await expectError(asUser(db, a, `select save_push_subscription($1,'ngan',$2,null)`, [EP(1), AUTH])), /INVALID_ARGUMENT/);
  for (let i = 1; i <= 12; i++) await asUser(db, a, `select save_push_subscription($1,$2,$3,null)`, [EP(i), KEY, AUTH]);
  assert.equal((await db.query(`select count(*)::int n from push_subscriptions`)).rows[0].n, 10);
});

test('tùy chọn thông báo: lưu theo người, đọc được của mình', async () => {
  const db = await createDb();
  const a = await addUser(db, 1), b = await addUser(db, 2);
  const r = (await asUser(db, a, `select * from set_notification_prefs(false, '22:00', '05:30')`)).rows[0];
  assert.equal(r.morning_digest, false);
  assert.equal((await asUser(db, a, `select * from notification_prefs`)).rows.length, 1);
  assert.equal((await asUser(db, b, `select * from notification_prefs`)).rows.length, 0);
});
