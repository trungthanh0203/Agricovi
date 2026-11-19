import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0226 (D199): bảng chấm công giấy đã phát hành (lớp C).

const S = (n) => `73000000-0000-4000-8000-0000000000c${n}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), lead = await addUser(db, 3), emp = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[]), ($1,$4,array['worker']::member_role[])`, [org, mgr, lead, emp]);
  const wl = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Tổ trưởng') returning id`, [org, lead])).rows[0].id;
  const we = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Lan') returning id`, [org, emp])).rows[0].id;
  const wo = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Mai') returning id`, [org])).rows[0].id;
  const team = '74000000-0000-4000-8000-0000000000c1';
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ($1,$2,'Tổ 1',$3)`, [team, org, wl]);
  await db.query(`insert into worker_team_memberships (team_id,worker_id) values ($1,$2),($1,$3)`, [team, wl, we]);
  return { db, owner, mgr, lead, emp, org, wl, we, wo };
}
const mk = (db, u, id, org, workers, over = {}) => asUser(db, u,
  `select * from create_timesheet_sheet($1,$2,$3::date,$4::date,$5,$6::time,$7::time,$8,$9::uuid[],$10)`,
  [id, org, over.from ?? '2026-11-09', over.to ?? '2026-11-22', over.mode ?? 'shift', over.start ?? '07:30', over.end ?? '17:00', over.brk ?? 60, workers, over.note ?? null]);

test('chủ tạo bảng: giữ đúng thứ tự người, tên và tổ; mã tuần tự; bấm lặp không tạo trùng', async () => {
  const { db, owner, org, we, wo } = await setup();
  const a = (await mk(db, owner, S(1), org, [wo, we])).rows[0];
  assert.match(a.code, /^BC-\d{4}-0001$/);
  assert.deepEqual(a.workers.map((w) => [w.name, w.team]), [['Mai', null], ['Lan', 'Tổ 1']]);
  assert.equal(a.status, 'printed');
  assert.equal((await mk(db, owner, S(1), org, [wo, we])).rows[0].code, a.code);
  assert.equal((await db.query(`select count(*)::int n from timesheet_sheets`)).rows[0].n, 1);
  assert.match((await mk(db, owner, S(2), org, [we])).rows[0].code, /-0002$/);
});

test('kiểm tra: kỳ tối đa 31 ngày, ngày đúng thứ tự, ca, kiểu ghi, danh sách người', async () => {
  const { db, owner, org, we } = await setup();
  assert.equal((await mk(db, owner, S(1), org, [we], { from: '2026-11-01', to: '2026-12-01' })).rows[0].to_date.toISOString().slice(0, 10), '2026-12-01');   // đúng 31 ngày
  await assert.rejects(mk(db, owner, S(2), org, [we], { from: '2026-11-01', to: '2026-12-02' }), /INVALID_DATE/);        // 32 ngày
  await assert.rejects(mk(db, owner, S(3), org, [we], { from: '2026-11-10', to: '2026-11-09' }), /INVALID_DATE/);
  await assert.rejects(mk(db, owner, S(4), org, [we], { start: '17:00', end: '07:30' }), /INVALID_TIME/);
  await assert.rejects(mk(db, owner, S(5), org, [we], { mode: 'abc' }), /INVALID_ARGUMENT/);
  await assert.rejects(mk(db, owner, S(6), org, []), /INVALID_ARGUMENT/);
  await assert.rejects(mk(db, owner, S(7), org, [we], { brk: 500 }), /INVALID_ARGUMENT/);
});

test('quyền: quản lý tạo cho mọi người; tổ trưởng chỉ cho người trong tổ, không cho mình; nhân viên không tạo', async () => {
  const { db, mgr, lead, emp, org, wl, we, wo } = await setup();
  await mk(db, mgr, S(1), org, [wo, we]);
  await mk(db, lead, S(2), org, [we]);
  await assert.rejects(mk(db, lead, S(3), org, [wo]), /FORBIDDEN/);                       // người ngoài tổ
  await assert.rejects(mk(db, lead, S(4), org, [wl]), /FORBIDDEN/);                       // chính mình
  await assert.rejects(mk(db, emp, S(5), org, [we]), /FORBIDDEN/);
});

test('ai xem được bảng: chủ/quản lý xem hết, tổ trưởng chỉ bảng mình tạo, nhân viên không thấy', async () => {
  const { db, owner, mgr, lead, emp, org, we, wo } = await setup();
  await mk(db, owner, S(1), org, [wo, we]);
  await mk(db, lead, S(2), org, [we]);
  const n = async (u) => (await asUser(db, u, `select 1 from timesheet_sheets`)).rows.length;
  assert.equal(await n(owner), 2);
  assert.equal(await n(mgr), 2);
  assert.equal(await n(lead), 1);
  assert.equal(await n(emp), 0);
});

test('đánh dấu đã nhập xong theo phiên bản', async () => {
  const { db, owner, lead, org, we } = await setup();
  await mk(db, lead, S(1), org, [we]);
  const r = (await asUser(db, lead, `select * from mark_timesheet_entered($1,1,true)`, [S(1)])).rows[0];
  assert.equal(r.status, 'entered');
  assert.equal(r.version, 2);
  await assert.rejects(asUser(db, owner, `select * from mark_timesheet_entered($1,1,false)`, [S(1)]), /CONFLICT/);
  assert.equal((await asUser(db, owner, `select * from mark_timesheet_entered($1,2,false)`, [S(1)])).rows[0].status, 'printed');
});
