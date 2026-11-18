import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0222 (D188): hồ sơ nhân sự gọn + hợp đồng lao động; quyền theo mục Tiền công.

const K1 = '60000000-0000-4000-8000-0000000000f1';
const K2 = '60000000-0000-4000-8000-0000000000f2';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  const w = (await db.query(`insert into worker_profiles (organization_id, full_name) values ($1,'Lan') returning id`, [org])).rows[0].id;
  return { db, owner, mgr, wk, org, w };
}
const hr = (db, u, w, data, v = null) => asUser(db, u, `select set_worker_hr($1,$2::jsonb,$3) v`, [w, JSON.stringify(data), v]);
const mk = (db, u, id, w, kind, s, e = null) => asUser(db, u, `select * from create_worker_contract($1,$2,$3,$4::date,$5::date,'6 triệu/tháng',null,null)`, [id, w, kind, s, e]);

test('hồ sơ nhân sự: lưu lần đầu, sửa theo phiên bản, kiểm ngày', async () => {
  const { db, owner, w } = await setup();
  assert.equal((await hr(db, owner, w, { start_date: '2026-01-05', position: 'Công nhân', employment_type: 'regular' })).rows[0].v, 1);
  assert.equal((await hr(db, owner, w, { start_date: '2026-01-05', end_date: '2026-10-01' }, 1)).rows[0].v, 2);
  await assert.rejects(hr(db, owner, w, { start_date: '2026-01-05' }, 1), /CONFLICT/);
  await assert.rejects(hr(db, owner, w, { start_date: '2026-05-05', end_date: '2026-01-01' }, 2), /INVALID_DATE/);
  await assert.rejects(hr(db, owner, w, { employment_type: 'abc' }, 2), /INVALID_ARGUMENT/);
});

test('hợp đồng: tạo (bấm lặp không nhân đôi), có thời hạn cần ngày hết hạn, sửa theo phiên bản, hủy không xóa', async () => {
  const { db, owner, w } = await setup();
  await mk(db, owner, K1, w, 'fixed_term', '2026-01-01', '2026-12-31');
  await mk(db, owner, K1, w, 'fixed_term', '2026-01-01', '2026-12-31');
  assert.equal((await db.query(`select count(*)::int n from worker_contracts`)).rows[0].n, 1);
  await assert.rejects(mk(db, owner, K2, w, 'fixed_term', '2026-01-01'), /INVALID_DATE/);
  await assert.rejects(mk(db, owner, K2, w, 'seasonal', '2026-05-01', '2026-01-01'), /INVALID_DATE/);
  assert.equal((await mk(db, owner, K2, w, 'indefinite', '2026-01-01', '2030-01-01')).rows[0].end_date, null);   // không thời hạn: bỏ ngày hết hạn
  const r = (await asUser(db, owner, `select * from update_worker_contract($1,1,'fixed_term','2026-01-01'::date,'2027-06-30'::date,null,null,null)`, [K1])).rows[0];
  assert.equal(r.version, 2);
  await assert.rejects(asUser(db, owner, `select * from update_worker_contract($1,1,'fixed_term','2026-01-01'::date,'2027-06-30'::date,null,null,null)`, [K1]), /CONFLICT/);
  await asUser(db, owner, `select * from cancel_worker_contract($1,2)`, [K1]);
  assert.equal((await db.query(`select status from worker_contracts where id=$1`, [K1])).rows[0].status, 'cancelled');
  await assert.rejects(asUser(db, owner, `select * from update_worker_contract($1,3,'seasonal','2026-01-01'::date,null,null,null,null)`, [K1]), /LOCKED/);
});

test('quyền: chủ sửa; quản lý xem (mặc định chỉ xem Tiền công); nhân viên không thấy và không sửa', async () => {
  const { db, owner, mgr, wk, org, w } = await setup();
  await mk(db, owner, K1, w, 'indefinite', '2026-01-01');
  await hr(db, owner, w, { position: 'Tổ trưởng' });
  const seen = async (u, t) => (await asUser(db, u, `select 1 from ${t}`)).rows.length;
  assert.equal(await seen(wk, 'worker_contracts'), 0);
  assert.equal(await seen(wk, 'worker_hr'), 0);
  await assert.rejects(hr(db, wk, w, { position: 'X' }), /FORBIDDEN/);
  await assert.rejects(mk(db, wk, K2, w, 'indefinite', '2026-01-01'), /FORBIDDEN/);
  const mgrCanEdit = (await asUser(db, mgr, `select has_perm($1,'payroll','edit') ok`, [org])).rows[0].ok;
  if (!mgrCanEdit) await assert.rejects(hr(db, mgr, w, { position: 'X' }), /FORBIDDEN/);
});
