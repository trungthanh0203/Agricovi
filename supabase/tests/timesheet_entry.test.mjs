import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0227 (D200): nhập số liệu theo bảng chấm công giấy đã in (lớp A).

const S = (n) => `75000000-0000-4000-8000-0000000000d${n}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), lead = await addUser(db, 3), emp = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[]), ($1,$4,array['worker']::member_role[])`, [org, mgr, lead, emp]);
  const wl = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Tổ trưởng') returning id`, [org, lead])).rows[0].id;
  const lan = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Lan') returning id`, [org, emp])).rows[0].id;
  const mai = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Mai') returning id`, [org])).rows[0].id;
  const other = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Ngoài bảng') returning id`, [org])).rows[0].id;
  const team = '76000000-0000-4000-8000-0000000000d1';
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ($1,$2,'Tổ 1',$3)`, [team, org, wl]);
  await db.query(`insert into worker_team_memberships (team_id,worker_id) values ($1,$2),($1,$3)`, [team, wl, lan]);
  const sheet = async (u, id, workers, over = {}) => (await asUser(db, u,
    `select * from create_timesheet_sheet($1,$2,'2026-11-09'::date,'2026-11-15'::date,$3,'07:30'::time,'17:00'::time,60,$4::uuid[],null)`, [id, org, over.mode ?? 'shift', workers])).rows[0];
  return { db, owner, mgr, lead, emp, org, wl, lan, mai, other, sheet };
}
const rec = (db, u, sheet, cells) => asUser(db, u, `select record_timesheet($1,$2::jsonb) r`, [sheet, JSON.stringify(cells)]).then((r) => r.rows[0].r);
const att = async (db, w, d) => (await db.query(
  `select to_char(started_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI') s, to_char(ended_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI') e, break_minutes brk, declared_minutes dm, approved_minutes am, status, note, source from attendance_records where worker_id=$1 and work_date=$2::date`, [w, d])).rows;

test('ô đủ ca / nửa ca / số giờ: máy chủ tự suy ra giờ từ ca của bảng; chủ nhập thì xác nhận luôn', async () => {
  const { db, owner, lan, mai, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan, mai]);
  const r = await rec(db, owner, sh.id, [
    { w: lan, d: '2026-11-09', k: 'full' },
    { w: lan, d: '2026-11-10', k: 'half' },
    { w: lan, d: '2026-11-11', k: 'hours', h: 6.5 },
    { w: lan, d: '2026-11-12', k: 'hours', h: 4 },
  ]);
  assert.deepEqual([r.saved, r.unchanged, r.skipped.length], [4, 0, 0]);
  const full = (await att(db, lan, '2026-11-09'))[0];
  assert.deepEqual([full.s, full.e, full.brk, full.dm, full.am, full.status], ['07:30', '17:00', 60, 510, 510, 'confirmed']);
  assert.match(full.note, new RegExp(sh.code));
  const half = (await att(db, lan, '2026-11-10'))[0];
  assert.deepEqual([half.dm, half.brk, half.e], [255, 0, '11:45']);
  const h65 = (await att(db, lan, '2026-11-11'))[0];
  assert.deepEqual([h65.dm, h65.brk, h65.e], [390, 60, '15:00']);                 // từ 6 giờ trở lên cộng nghỉ giữa ca vào giờ ra
  const h4 = (await att(db, lan, '2026-11-12'))[0];
  assert.deepEqual([h4.dm, h4.brk, h4.e], [240, 0, '11:30']);
});

test('gửi lặp không nhân đôi; sửa giá trị ô đã lưu thì bị báo, không ghi đè', async () => {
  const { db, owner, lan, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan]);
  await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'full' }]);
  const again = await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'full' }]);
  assert.deepEqual([again.saved, again.unchanged], [0, 1]);
  assert.equal((await db.query(`select count(*)::int n from attendance_records`)).rows[0].n, 1);
  const diff = await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'half' }]);
  assert.equal(diff.skipped.length, 1);
  assert.match(diff.skipped[0].reason, /Đã nhập trước đó/);
  assert.equal((await att(db, lan, '2026-11-09'))[0].dm, 510);
});

test('ô nghỉ P/Ô/V/K tạo ghi nghỉ đúng loại và hưởng lương; gửi lặp không nhân đôi', async () => {
  const { db, owner, lan, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan]);
  const r = await rec(db, owner, sh.id, [
    { w: lan, d: '2026-11-09', k: 'P' }, { w: lan, d: '2026-11-10', k: 'O' }, { w: lan, d: '2026-11-11', k: 'V' }, { w: lan, d: '2026-11-12', k: 'K' },
  ]);
  assert.equal(r.saved, 4);
  const rows = (await db.query(`select from_date::text d, kind, paid, notice from worker_absences where worker_id=$1 order by from_date`, [lan])).rows;
  assert.deepEqual(rows.map((x) => [x.d, x.kind, x.paid, x.notice]), [
    ['2026-11-09', 'annual', true, 'after'], ['2026-11-10', 'sick', true, 'after'], ['2026-11-11', 'family', true, 'after'], ['2026-11-12', 'no_notice', false, 'none'],
  ]);
  const again = await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'P' }]);
  assert.deepEqual([again.saved, again.unchanged], [0, 1]);
  assert.equal((await db.query(`select count(*)::int n from worker_absences`)).rows[0].n, 4);
});

test('ô không ghi được bị bỏ qua kèm lý do, không làm hỏng cả lô: ngoài kỳ, ngoài bảng, ký hiệu sai, giờ sai, trùng công, trùng nghỉ', async () => {
  const { db, owner, lan, mai, other, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan, mai]);
  // công có sẵn (máy chấm công) của Mai ngày 9 và ghi nghỉ của Mai ngày 10
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, ended_at, source) values ('77000000-0000-4000-8000-000000000001',$1,'2026-11-09','2026-11-09T01:00:00Z','2026-11-09T09:00:00Z','kiosk')`, [mai]);
  await asUser(db, owner, `select * from create_worker_absence('77000000-0000-4000-8000-000000000002',$1,'2026-11-10'::date,'2026-11-10'::date,false,'sick','before','zalo',null,null,true,null,null)`, [mai]);
  const r = await rec(db, owner, sh.id, [
    { w: lan, d: '2026-11-09', k: 'full' },                  // ghi được
    { w: lan, d: '2026-11-20', k: 'full' },                  // ngoài kỳ
    { w: other, d: '2026-11-09', k: 'full' },                // ngoài bảng
    { w: lan, d: '2026-11-10', k: 'Z' },                     // ký hiệu sai
    { w: lan, d: '2026-11-11', k: 'hours', h: 20 },          // giờ sai
    { w: mai, d: '2026-11-09', k: 'full' },                  // trùng công có sẵn
    { w: mai, d: '2026-11-10', k: 'full' },                  // trùng ghi nghỉ
    { w: mai, d: '2026-11-09', k: 'P' },                     // nghỉ nhưng đã có công
  ]);
  assert.equal(r.saved, 1);
  const why = Object.fromEntries(r.skipped.map((x, i) => [i, x.reason]));
  assert.equal(r.skipped.length, 7);
  assert.match(why[0], /ngoài kỳ/);
  assert.match(why[1], /không có trong bảng/);
  assert.match(why[2], /Ký hiệu/);
  assert.match(why[3], /Số giờ/);
  assert.match(why[4], /trùng giờ/);
  assert.match(why[5], /ghi nghỉ/);
  assert.match(why[6], /Đã có công/);
});

test('kỳ lương đã khóa: chỉ ô đó bị bỏ qua, ô khác vẫn lưu', async () => {
  const { db, owner, org, lan, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan]);
  await db.query(`insert into payroll_periods (organization_id, start_date, end_date, status) values ($1,'2026-11-09','2026-11-10','locked')`, [org]);
  const r = await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'full' }, { w: lan, d: '2026-11-12', k: 'full' }]);
  assert.equal(r.saved, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /khóa/);
});

test('quyền: quản lý nhập thì chờ xác nhận; tổ trưởng chỉ bảng mình tạo cho người trong tổ; nhân viên không nhập', async () => {
  const { db, mgr, lead, emp, lan, mai, sheet, owner } = await setup();
  const shOwner = await sheet(owner, S(1), [lan, mai]);
  const m = await rec(db, mgr, shOwner.id, [{ w: lan, d: '2026-11-09', k: 'full' }]);
  assert.equal(m.saved, 1);
  assert.equal((await att(db, lan, '2026-11-09'))[0].status, 'needs_confirmation');
  assert.equal((await att(db, lan, '2026-11-09'))[0].source, 'admin');
  await assert.rejects(rec(db, lead, shOwner.id, [{ w: lan, d: '2026-11-10', k: 'full' }]), /FORBIDDEN/);   // bảng của chủ, không phải của tổ trưởng
  const shLead = await sheet(lead, S(2), [lan]);
  const l = await rec(db, lead, shLead.id, [{ w: lan, d: '2026-11-10', k: 'full' }]);
  assert.equal(l.saved, 1);
  assert.equal((await att(db, lan, '2026-11-10'))[0].source, 'team_leader');
  await assert.rejects(rec(db, emp, shLead.id, [{ w: lan, d: '2026-11-11', k: 'full' }]), /FORBIDDEN/);
});

test('timesheet_existing: liệt kê ô đã có công/ghi nghỉ và đánh dấu ô do chính bảng tạo ra', async () => {
  const { db, owner, lan, mai, sheet } = await setup();
  const sh = await sheet(owner, S(1), [lan, mai]);
  await rec(db, owner, sh.id, [{ w: lan, d: '2026-11-09', k: 'full' }, { w: lan, d: '2026-11-10', k: 'P' }]);
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, ended_at, source) values ('77000000-0000-4000-8000-000000000003',$1,'2026-11-09','2026-11-09T01:00:00Z','2026-11-09T09:00:00Z','kiosk')`, [mai]);
  const e = (await asUser(db, owner, `select timesheet_existing($1) e`, [sh.id])).rows[0].e;
  const w = (id) => e.work.find((x) => x.w === id && x.d === '2026-11-09');
  assert.equal(w(lan).mine, true);
  assert.equal(w(lan).minutes, 510);
  assert.equal(w(mai).mine, false);
  assert.equal(e.absences.length, 1);
  assert.deepEqual([e.absences[0].w, e.absences[0].d, e.absences[0].kind, e.absences[0].mine], [lan, '2026-11-10', 'annual', true]);
});
