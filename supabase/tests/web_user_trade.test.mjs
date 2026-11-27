import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0237: quản trị website xem người đăng ký kèm tin giao thương của họ.
test('tổng biên tập xem được hồ sơ và tin của người dùng; người khác thì không', async () => {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), mod = await addUser(db, 2), buyer = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','moderator',true)`);
  await asUser(db, buyer, `select ensure_buyer_profile('Nguyễn Văn An','individual',null)`);
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [buyer]);
  const cat = (await db.query(`select id from product_categories where slug='dua-luoi-dua-hau'`)).rows[0].id;
  await asUser(db, buyer, `select create_trade_post('buy',$1,'Dưa',2,'tấn',null,null,'Hà Nội',null,null,14,'{}',null,'{}',null)`, [cat]);

  const row = (await asUser(db, admin, `select site_list_users(null,10) l`)).rows[0].l.find((x) => x.user_id === buyer);
  assert.deepEqual([row.posts, row.posts_pending], [1, 1]);
  const d = (await asUser(db, admin, `select site_user_detail($1) d`, [buyer])).rows[0].d;
  assert.equal(d.email_verified, true);
  assert.deepEqual([d.posts.length, d.posts[0].status, d.posts[0].responses], [1, 'pending', 0]);

  for (const u of [mod, buyer]) assert.match(await expectError(asUser(db, u, `select site_user_detail($1)`, [buyer])), /FORBIDDEN/);
  assert.match(await expectError(asAnon(db, `select site_user_detail($1)`, [buyer])), /permission|denied/i);
});
