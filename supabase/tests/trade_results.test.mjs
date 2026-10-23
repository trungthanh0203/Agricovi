import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon } from './harness.mjs';

// Migration 0053 (D73): kết quả giao thương công khai, không lộ người tham gia.
test('chỉ tin đã đóng có phản hồi được chấp nhận mới thành kết quả; không lộ người đăng/phản hồi', async () => {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const buyer = await addUser(db, 6), seller = await addUser(db, 7);
  const org = (await asUser(db, seller, `select create_organization('household','Vườn A') id`)).rows[0].id;
  await db.query(`update auth.users set email_confirmed_at = now()`);
  for (const [u, n] of [[buyer, 'Người Mua'], [seller, 'Chủ Vườn']]) await asUser(db, u, `select ensure_buyer_profile($1,'individual',null)`, [n]);
  const cat = (await db.query(`select id from product_categories where slug='rau-cu-qua'`)).rows[0].id;
  const mk = async () => (await asUser(db, buyer, `select create_trade_post('buy',$1,'Dưa lưới',100,'kg',null,null,'Long An','',null,14,'{}','Cần dưa','{}',null) r`, [cat])).rows[0].r.id;
  const a = await mk(), b = await mk(), c = await mk();
  await db.query(`update trade_posts set status='published'`);
  await db.query(`insert into trade_responses (post_id, user_id, organization_id, status, note) values ($1,$2,$3,'accepted','x'), ($4,$2,$3,'open','y')`, [a, seller, org, b]);
  await asUser(db, buyer, `select close_trade_post($1)`, [a]);
  await asUser(db, buyer, `select close_trade_post($1)`, [b]);                                   // đóng nhưng chưa ai được chấp nhận
  await asUser(db, buyer, `select close_trade_post($1)`, [c]);                                   // đóng, không có phản hồi
  const rows = (await asAnon(db, `select * from public_trade_results`)).rows;
  assert.deepEqual(rows.map((r) => r.id), [a]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['category_id', 'category_name', 'closed_at', 'id', 'kind', 'province', 'quantity', 'title', 'unit']);
  const s = (await asAnon(db, `select * from public_trade_stats`)).rows[0];
  assert.deepEqual([s.deals_total, s.deals_30d, s.orders_completed, s.active_posts], [1, 1, 0, 0]);
});
