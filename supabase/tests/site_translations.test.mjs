import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0052 (W8, D71): bản dịch tiếng Anh của nội dung quản trị soạn.
async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), editor = await addUser(db, 2), mod = await addUser(db, 3), plain = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await asUser(db, admin, `select admin_set_site_role('u2@test.local','editor',true)`);
  await asUser(db, admin, `select admin_set_site_role('u3@test.local','moderator',true)`);
  return { db, admin, editor, mod, plain };
}

test('chỉ biên tập viên/tổng biên tập lưu bản dịch; khách đọc được; trống thì xóa', async () => {
  const { db, editor, mod, plain, admin } = await setup();
  const save = (u, kind, ref, f) => asUser(db, u, `select site_save_translation($1,$2,$3::jsonb)`, [kind, ref, JSON.stringify(f)]);
  assert.match(await expectError(save(plain, 'glossary', 'Giỏ hàng', { en: 'Cart' })), /FORBIDDEN/);
  assert.match(await expectError(save(mod, 'glossary', 'Giỏ hàng', { en: 'Cart' })), /FORBIDDEN/);
  await save(editor, 'glossary', 'Giao thương tháng này', { en: 'Trade this month' });
  await save(admin, 'page', 'gioi-thieu', { title: 'About us', body: 'We connect growers.' });
  const rows = (await asAnon(db, `select kind, ref, fields from site_translations order by kind, ref`)).rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.ref, r.fields.en ?? r.fields.title]), [['glossary', 'Giao thương tháng này', 'Trade this month'], ['page', 'gioi-thieu', 'About us']]);
  await save(editor, 'glossary', 'Giao thương tháng này', { en: 'Trade this month (v2)' });         // ghi đè
  assert.equal((await asAnon(db, `select fields->>'en' e from site_translations where kind='glossary'`)).rows[0].e, 'Trade this month (v2)');
  await save(editor, 'glossary', 'Giao thương tháng này', { en: '  ' });                              // để trống = xóa
  assert.equal((await asAnon(db, `select count(*)::int n from site_translations where kind='glossary'`)).rows[0].n, 0);
  assert.match(await expectError(asAnon(db, `insert into site_translations (kind, ref, fields) values ('glossary','x','{}')`)), /permission|denied/i);
  assert.match(await expectError(asUser(db, editor, `delete from site_translations`)), /permission|denied/i);
});

test('kiểm tra loại, trường và độ dài', async () => {
  const { db, editor } = await setup();
  const save = (kind, ref, f) => asUser(db, editor, `select site_save_translation($1,$2,$3::jsonb)`, [kind, ref, JSON.stringify(f)]);
  assert.match(await expectError(save('video', 'x', { en: 'a' })), /INVALID/);
  assert.match(await expectError(save('glossary', 'x', { title: 'a' })), /INVALID/);
  assert.match(await expectError(save('glossary', '', { en: 'a' })), /INVALID/);
  assert.match(await expectError(save('page', 'x', { title: 'a'.repeat(201) })), /INVALID/);
  await save('article', 'bai-1', { title: 'Title', summary: 'Sum', body: 'Body' });
});
