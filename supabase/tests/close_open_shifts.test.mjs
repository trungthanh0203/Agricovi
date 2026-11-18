import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0225 (D198): đóng nhanh ca quên ra ca (từng ca và hàng loạt).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), emp = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[])`, [org, mgr, emp]);
  const w = async (name, uid = null) => (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,$3) returning id`, [org, uid, name])).rows[0].id;
  // ca mở: ngày, giờ vào (giờ Việt Nam)
  let n = 0;
  const open = async (worker, daysAgo, at) => {
    const id = `90000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, source)
      values ($1,$2, vn_today() - $3::int, ((vn_today() - $3::int) + $4::time) at time zone 'Asia/Ho_Chi_Minh', 'admin')`, [id, worker, daysAgo, at]);
    return id;
  };
  return { db, owner, mgr, emp, org, w, open };
}
const row = async (db, id) => (await db.query(`select status, ended_at, approved_minutes, declared_minutes, break_minutes, note from attendance_records where id=$1`, [id])).rows[0];
const endAt = (db, daysAgo, t) => db.query(`select (((vn_today() - $1::int) + $2::time) at time zone 'Asia/Ho_Chi_Minh') e`, [daysAgo, t]).then((r) => r.rows[0].e.toISOString());

test('chủ đóng một ca: công được xác nhận luôn, tính trừ giờ nghỉ; bấm lặp không đổi', async () => {
  const { db, owner, w, open } = await setup();
  const id = await open(await w('Lan'), 3, '08:00');
  const e = await endAt(db, 3, '17:00');
  const r = (await asUser(db, owner, `select * from close_open_shift($1,$2,60)`, [id, e])).rows[0];
  assert.equal(r.status, 'confirmed');
  assert.equal(r.approved_minutes, 480);                                       // 9 giờ - 60 phút nghỉ
  await asUser(db, owner, `select * from close_open_shift($1,$2,0)`, [id, e]);
  assert.equal((await row(db, id)).approved_minutes, 480);
  assert.match((await row(db, id)).note, /Đóng ca quên ra ca/);
});

test('quản lý đóng ca thì chờ xác nhận; giờ ra phải sau giờ vào và không ở tương lai', async () => {
  const { db, mgr, w, open } = await setup();
  const id = await open(await w('Lan'), 2, '08:00');
  await assert.rejects(asUser(db, mgr, `select * from close_open_shift($1,$2,0)`, [id, await endAt(db, 2, '07:00')]), /INVALID_TIME/);
  await assert.rejects(asUser(db, mgr, `select * from close_open_shift($1, now() + interval '2 hours', 0)`, [id]), /INVALID_TIME/);
  const r = (await asUser(db, mgr, `select * from close_open_shift($1,$2,0)`, [id, await endAt(db, 2, '16:00')])).rows[0];
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.declared_minutes, 480);
});

test('người làm không tự đóng ca của mình', async () => {
  const { db, emp, w, open } = await setup();
  const id = await open(await w('Tôi', emp), 2, '08:00');
  await assert.rejects(asUser(db, emp, `select * from close_open_shift($1,$2,0)`, [id, await endAt(db, 2, '17:00')]), /FORBIDDEN/);
});

test('đóng hàng loạt: mọi ca mở của ngày trước; ca vào muộn hơn giờ ra bị bỏ qua; ca hôm nay không đụng', async () => {
  const { db, owner, w, open } = await setup();
  const a = await open(await w('A'), 1, '07:30');
  const b = await open(await w('B'), 5, '08:00');
  const late = await open(await w('C'), 2, '18:30');
  const today = await open(await w('D'), 0, '06:00');
  const r = (await asUser(db, owner, `select close_stale_shifts($1,'17:00') r`, [(await db.query(`select organization_id o from attendance_records limit 1`)).rows[0].o])).rows[0].r;
  assert.deepEqual(r, { closed: 2, skipped: 1 });
  assert.equal((await row(db, a)).status, 'confirmed');
  assert.equal((await row(db, b)).approved_minutes, 540);
  assert.equal((await row(db, late)).ended_at, null);
  assert.equal((await row(db, today)).ended_at, null);
});
