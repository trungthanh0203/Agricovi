import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0218 (H2 lát 2, D183): bản tin sáng gộp, đếm theo quyền của từng người, mỗi ngày một lần.

const AREA = '20000000-0000-4000-8000-0000000000d1';
const CYC = '30000000-0000-4000-8000-0000000000d1';
const A1 = '40000000-0000-4000-8000-0000000000d1';
const EP = (n) => `https://push.example.com/send/${n}`;
const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;
const DAY = '2026-11-12';

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), idle = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,null)`, [CYC, org, AREA, tpl]);
  for (const [u, n] of [[owner, 1], [wk, 2], [idle, 3]]) await asUser(db, u, `select save_push_subscription($1,$2,$3,null)`, [EP(n), KEY, AUTH]);
  return { db, owner, wk, idle, org };
}
const claim = async (db, day = DAY) => (await db.query(`select user_id, counts from claim_morning_digests($1::date)`, [day])).rows;

test('đếm việc trễ, mũi tiêm, bảo dưỡng theo quyền từng người; người không có gì thì không nhận', async () => {
  const { db, owner, wk, idle, org } = await setup();
  await asUser(db, owner, `select * from add_cycle_milestone($1,'Dịch tả lần 1','start',10,null,'vaccine')`, [CYC]);
  await asUser(db, owner, `select * from create_asset($1,$2,'Máy bơm','pump',$3,'2026-09-01'::date,6000000,3,0,1,null)`, [A1, org, AREA]);
  const rows = await claim(db);
  const by = Object.fromEntries(rows.map((r) => [r.user_id, r.counts]));
  assert.equal(by[owner].tasks.crop, 1);                    // công đoạn của vụ đã trễ
  assert.equal(by[owner].vaccine, 1);
  assert.equal(by[owner].assets, 1);                        // chủ thấy bảo dưỡng tài sản
  assert.equal(by[wk].tasks.crop, 1);
  assert.equal(by[wk].assets, 0);                           // nhân viên không có quyền xem Chi phí
  assert.equal(by[idle], undefined);                        // không thuộc cơ sở nào: không có gì để nhắc
});

test('mỗi người mỗi ngày một bản tin; ngày khác gửi lại; tắt bản tin sáng hoặc đang giờ im lặng thì không gửi', async () => {
  const { db, owner, wk } = await setup();
  assert.ok((await claim(db)).length >= 2);
  assert.equal((await claim(db)).length, 0);                // chạy lại cùng ngày: không trùng
  assert.ok((await claim(db, '2026-11-13')).length >= 1);   // ngày khác: gửi lại
  await asUser(db, owner, `select * from set_notification_prefs(false, '21:00', '06:00')`);
  await asUser(db, wk, `select * from set_notification_prefs(true, '00:00', '23:59')`);   // im lặng gần cả ngày
  assert.equal((await claim(db, '2026-11-14')).length, 0);
});

test('việc xong, vụ kết thúc, trễ quá 15 ngày thì không đếm', async () => {
  const { db } = await setup();
  assert.equal((await claim(db, '2026-12-01')).length, 0);  // việc trễ hơn 15 ngày coi như bỏ dở
  await db.query(`update production_stages set status = 'done' where cycle_id = $1`, [CYC]);
  assert.equal((await claim(db, DAY)).length, 0);
});

test('hàm gửi chỉ dành cho máy chủ, người dùng thường không gọi được', async () => {
  const { db, owner } = await setup();
  await assert.rejects(asUser(db, owner, `select * from claim_morning_digests('2026-11-12')`), /permission denied/i);
  await assert.rejects(asUser(db, owner, `select morning_digest_counts($1,'2026-11-12')`, [owner]), /permission denied/i);
});
