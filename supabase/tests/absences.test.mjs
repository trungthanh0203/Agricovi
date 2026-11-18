import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0223 (D189): ghi nghỉ việc theo chấm công: chủ/quản lý/tổ trưởng ghi hộ, không trùng ngày, sửa có phiên bản, hủy không xóa.

const A = (n) => `70000000-0000-4000-8000-0000000000a${n}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), lead = await addUser(db, 3), emp = await addUser(db, 4), other = await addUser(db, 5);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[]), ($1,$4,array['worker']::member_role[]), ($1,$5,array['worker']::member_role[])`, [org, mgr, lead, emp, other]);
  const wl = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Tổ trưởng') returning id`, [org, lead])).rows[0].id;
  const we = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Lan') returning id`, [org, emp])).rows[0].id;
  const wo = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Mai') returning id`, [org, other])).rows[0].id;
  const team = '71000000-0000-4000-8000-0000000000a1';
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ($1,$2,'Tổ 1',$3)`, [team, org, wl]);
  await db.query(`insert into worker_team_memberships (team_id,worker_id) values ($1,$2),($1,$3)`, [team, wl, we]);
  return { db, owner, mgr, lead, emp, other, org, wl, we, wo };
}
const mk = (db, u, id, w, from, to, over = {}) => asUser(db, u,
  `select * from create_worker_absence($1,$2,$3::date,$4::date,$5,$6,$7,$8,null,$9,$10,null,null)`,
  [id, w, from, to, over.half ?? false, over.kind ?? 'sick', over.notice ?? 'before', over.channel ?? 'zalo', over.reason ?? 'Con ốm', over.paid ?? true]);

test('chủ ghi nghỉ; bấm lặp không nhân đôi; kiểm ngày và nửa ngày', async () => {
  const { db, owner, we } = await setup();
  const r = (await mk(db, owner, A(1), we, '2026-11-20', '2026-11-22')).rows[0];
  assert.equal(r.version, 1);
  await mk(db, owner, A(1), we, '2026-11-20', '2026-11-22');
  assert.equal((await db.query(`select count(*)::int n from worker_absences`)).rows[0].n, 1);
  await assert.rejects(mk(db, owner, A(2), we, '2026-12-05', '2026-12-01'), /INVALID_DATE/);
  await assert.rejects(mk(db, owner, A(2), we, '2026-01-01', '2026-06-01'), /INVALID_DATE/);                 // quá 90 ngày
  await assert.rejects(mk(db, owner, A(2), we, '2026-12-01', '2026-12-02', { half: true }), /INVALID_DATE/);  // nửa ngày chỉ khi một ngày
  assert.equal((await mk(db, owner, A(3), we, '2026-12-01', '2026-12-01', { half: true })).rows[0].half_day, true);
  await assert.rejects(mk(db, owner, A(4), we, '2026-12-01', '2026-12-01', { kind: 'xyz' }), /INVALID_ARGUMENT/);
});

test('không trùng ngày với ghi nghỉ còn hiệu lực; hủy rồi ghi lại được', async () => {
  const { db, owner, we } = await setup();
  await mk(db, owner, A(1), we, '2026-11-20', '2026-11-22');
  await assert.rejects(mk(db, owner, A(2), we, '2026-11-22', '2026-11-25'), /OVERLAP/);
  await asUser(db, owner, `select * from cancel_worker_absence($1,1)`, [A(1)]);
  assert.equal((await db.query(`select status from worker_absences where id=$1`, [A(1)])).rows[0].status, 'cancelled');
  await mk(db, owner, A(2), we, '2026-11-22', '2026-11-25');
});

test('sửa theo phiên bản; ghi nghỉ đã hủy khóa', async () => {
  const { db, owner, we } = await setup();
  await mk(db, owner, A(1), we, '2026-11-20', '2026-11-22');
  const up = (v, to) => asUser(db, owner, `select * from update_worker_absence($1,$2,'2026-11-20'::date,$3::date,false,'annual','after','phone',null,'Việc nhà',true,null,null)`, [A(1), v, to]);
  assert.equal((await up(1, '2026-11-23')).rows[0].version, 2);
  await assert.rejects(up(1, '2026-11-24'), /CONFLICT/);
  await asUser(db, owner, `select * from cancel_worker_absence($1,2)`, [A(1)]);
  await assert.rejects(up(3, '2026-11-24'), /LOCKED/);
});

test('quyền: quản lý ghi; tổ trưởng chỉ cho người trong tổ, không cho mình; nhân viên không ghi; ai xem được gì', async () => {
  const { db, owner, mgr, lead, emp, other, wl, we, wo } = await setup();
  await mk(db, mgr, A(1), we, '2026-11-20', '2026-11-20');
  await mk(db, lead, A(2), we, '2026-11-21', '2026-11-21');
  await assert.rejects(mk(db, lead, A(3), wo, '2026-11-22', '2026-11-22'), /FORBIDDEN/);        // người ngoài tổ
  await assert.rejects(mk(db, lead, A(4), wl, '2026-11-22', '2026-11-22'), /FORBIDDEN/);        // chính mình
  await assert.rejects(mk(db, emp, A(5), we, '2026-11-22', '2026-11-22'), /FORBIDDEN/);         // nhân viên
  await mk(db, owner, A(6), wo, '2026-11-23', '2026-11-23');
  const n = async (u) => (await asUser(db, u, `select 1 from worker_absences`)).rows.length;
  assert.equal(await n(owner), 3);
  assert.equal(await n(lead), 2);                                                                // chỉ người trong tổ
  assert.equal(await n(emp), 2);                                                                 // chỉ của mình
  assert.equal(await n(other), 1);
  await assert.rejects(asUser(db, lead, `select * from cancel_worker_absence($1,1)`, [A(6)]), /FORBIDDEN/);
});
