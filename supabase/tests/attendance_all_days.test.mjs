import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0229 (D202): bảng công liệt kê và xác nhận được mọi ngày khi lọc công chờ xác nhận / ca đang mở.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  const w = async (name) => (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,$2) returning id`, [org, name])).rows[0].id;
  let n = 0;
  const rec = async (worker, daysAgo, status, ended) => {
    const id = `91000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, ended_at, source, status, declared_minutes)
      values ($1,$2, vn_today() - $3::int, ((vn_today() - $3::int) + time '07:00') at time zone 'Asia/Ho_Chi_Minh',
              case when $4 then ((vn_today() - $3::int) + time '16:00') at time zone 'Asia/Ho_Chi_Minh' end, 'admin', $5::attendance_status, case when $4 then 540 end)`, [id, worker, daysAgo, ended, status]);
    return id;
  };
  return { db, owner, org, w, rec };
}
const list = (db, u, org, from, to, status) => asUser(db, u, `select attendance_list($1,$2::date,$3::date,$4,null,50,0) r`, [org, from, to, status]).then((r) => r.rows[0].r);

test('lọc công chờ xác nhận và ca đang mở: liệt kê được mọi ngày, kể cả hàng trăm ngày trước', async () => {
  const { db, owner, org, w, rec } = await setup();
  const a = await w('A'), b = await w('B'), c = await w('C');
  await rec(a, 400, 'needs_confirmation', true);
  await rec(b, 3, 'needs_confirmation', true);
  await rec(c, 250, 'open', false);
  const pending = await list(db, owner, org, '2000-01-01', (await db.query(`select vn_today()::text d`)).rows[0].d, 'pending');
  assert.equal(pending.total, 2);
  const open = await list(db, owner, org, '2000-01-01', (await db.query(`select (vn_today() - 1)::text d`)).rows[0].d, 'open');
  assert.equal(open.total, 1);
});

test('các lọc khác vẫn giới hạn 92 ngày', async () => {
  const { db, owner, org } = await setup();
  await assert.rejects(list(db, owner, org, '2000-01-01', '2026-11-19', ''), /92 ngày/);
  await assert.rejects(list(db, owner, org, '2000-01-01', '2026-11-19', 'confirmed'), /92 ngày/);
});

test('xác nhận hàng loạt chạy được trên mọi ngày: đếm trước rồi xác nhận đúng số công', async () => {
  const { db, owner, org, w, rec } = await setup();
  const a = await w('A'), b = await w('B');
  const old = await rec(a, 400, 'needs_confirmation', true);
  await rec(b, 2, 'needs_confirmation', true);
  const today = (await db.query(`select vn_today()::text d`)).rows[0].d;
  const dry = (await asUser(db, owner, `select attendance_bulk_confirm($1,'2000-01-01'::date,$2::date,null,true) r`, [org, today])).rows[0].r;
  assert.equal(dry.count, 2);
  const real = (await asUser(db, owner, `select attendance_bulk_confirm($1,'2000-01-01'::date,$2::date,null,false) r`, [org, today])).rows[0].r;
  assert.equal(real.count, 2);
  assert.equal((await db.query(`select status from attendance_records where id=$1`, [old])).rows[0].status, 'confirmed');
});

test('số người có ảnh cờ đỏ hôm nay (flagged_people) đếm người, không đếm ảnh; kết quả danh sách giữ nguyên thứ tự và trường', async () => {
  const { db, owner, org, w, rec } = await setup();
  const a = await w('A'), b = await w('B');
  const ra = await rec(a, 0, 'needs_confirmation', true);
  const rb = await rec(b, 0, 'needs_confirmation', true);
  const kiosk = await addUser(db, 9);
  const kid = (await db.query(`select kiosk_finalize($1,$2,null,$3,'M') id`, [owner, org, kiosk])).rows[0].id;
  for (const [att, worker] of [[ra, a], [ra, a], [rb, b]]) {
    await db.query(`insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok) values (gen_random_uuid(), $1, $2, $3, $4, 'out', repeat('A', 300), false)`, [org, att, worker, kid]);
  }
  const today = (await db.query(`select vn_today()::text d`)).rows[0].d;
  const s = (await asUser(db, owner, `select attendance_summary($1,$2) r`, [org, today])).rows[0].r;
  assert.equal(s.flagged, 3);
  assert.equal(s.flagged_people, 2);
  const p = (await list(db, owner, org, today, today, ''));
  assert.deepEqual(Object.keys(p.rows[0]).sort(), ['approved_minutes', 'break_minutes', 'cycle_id', 'declared_minutes', 'ended_at', 'exception_reason', 'has_photo', 'id', 'source', 'started_at', 'status', 'work_date', 'worker_id', 'worker_name']);
  assert.equal(p.rows.filter((r) => r.has_photo).length, 2);
});
