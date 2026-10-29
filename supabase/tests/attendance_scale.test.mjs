import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0131: số liệu, danh sách phân trang và xác nhận hàng loạt tính ở máy chủ (cơ sở đông người); tối đa 20 máy chấm công.

async function setup(n = 120) {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  await db.query(`insert into worker_profiles (organization_id, full_name, phone) select $1, 'NV ' || lpad(g::text, 3, '0'), '09' || lpad(g::text, 8, '0') from generate_series(1, $2::int) g`, [org, n]);
  // mỗi người một ca hôm nay đã Ra ca (8 giờ), chờ xác nhận
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, ended_at, source, status)
    select gen_random_uuid(), w.id, vn_today(), now() - interval '9 hours', now() - interval '1 hour', 'kiosk', 'needs_confirmation' from worker_profiles w where w.organization_id = $1`, [org]);
  return { db, owner, mgr, stranger, org };
}

test('danh sách phân trang không bị cắt ở 300 dòng; tổng đúng; lọc theo tên và trạng thái', async () => {
  const { db, owner, org } = await setup(120);
  const day = (await db.query(`select vn_today()::text d`)).rows[0].d;
  const page = async (args) => (await asUser(db, owner, `select attendance_list($1,$2,$3,$4,$5,$6,$7) r`, [org, day, day, ...args])).rows[0].r;
  const p1 = await page([null, null, 50, 0]);
  assert.equal(p1.total, 120); assert.equal(p1.rows.length, 50);
  const p3 = await page([null, null, 50, 100]);
  assert.equal(p3.rows.length, 20);
  assert.equal(new Set([...p1.rows, ...(await page([null, null, 50, 50])).rows, ...p3.rows].map((r) => r.id)).size, 120);   // không trùng, không sót
  assert.equal((await page(['pending', null, 100, 0])).total, 120);
  assert.equal((await page(['confirmed', null, 100, 0])).total, 0);
  const named = await page([null, 'nv 007', 50, 0]);
  assert.equal(named.total, 1); assert.equal(named.rows[0].worker_name, 'NV 007');
  assert.equal((await page([null, null, 5000, 0])).rows.length, 100);        // trần 100 dòng mỗi trang
  assert.match(await expectError(asUser(db, owner, `select attendance_list($1,$2,$3)`, [org, '2020-01-01', day])), /INVALID_ARGUMENT/);
});

test('số liệu tổng hợp: hiện diện, đang trong ca, quên ra ca, chờ xác nhận, giờ công tháng, xếp hạng', async () => {
  const { db, owner, org } = await setup(30);
  const day = (await db.query(`select vn_today()::text d`)).rows[0].d;
  const w = (await db.query(`select id from worker_profiles where full_name = 'NV 001'`)).rows[0].id;
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, source, status) values (gen_random_uuid(), $1, vn_today() - 1, now() - interval '30 hours', 'admin', 'open')`, [w]);
  const s = (await asUser(db, owner, `select attendance_summary($1,$2) r`, [org, day])).rows[0].r;
  assert.equal(s.workers, 30); assert.equal(s.present, 30); assert.equal(s.done, 30);
  assert.equal(s.in_shift, 1); assert.equal(s.stale, 1); assert.equal(s.pending, 30);
  assert.equal(s.flagged, 0); assert.equal(s.month_minutes, 0);
  await db.query(`update attendance_records set status='confirmed', approved_minutes = 480 where ended_at is not null`);
  const t = (await asUser(db, owner, `select attendance_summary($1,$2) r`, [org, day])).rows[0].r;
  assert.equal(t.month_minutes, 30 * 480); assert.equal(t.pending, 0); assert.equal(t.top.length, 8);
});

test('xác nhận hàng loạt: chỉ công hợp lệ; bỏ qua công có ngoại lệ hoặc ảnh cờ đỏ; chỉ chủ/quản lý; chạy thử đếm trước', async () => {
  const { db, owner, mgr, stranger, org } = await setup(40);
  const day = (await db.query(`select vn_today()::text d`)).rows[0].d;
  const ids = (await db.query(`select a.id from attendance_records a join worker_profiles w on w.id = a.worker_id order by w.full_name`)).rows.map((r) => r.id);
  await db.query(`update attendance_records set exception_reason = 'Quên ra ca' where id = $1`, [ids[0]]);                 // ngoại lệ
  const kiosk = await addUser(db, 9);
  const kid = (await db.query(`select kiosk_finalize($1,$2,null,$3,'M') id`, [owner, org, kiosk])).rows[0].id;
  const wid = (await db.query(`select worker_id w from attendance_records where id = $1`, [ids[1]])).rows[0].w;
  await db.query(`insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok) values (gen_random_uuid(), $1, $2, $3, $4, 'out', repeat('A', 300), false)`, [org, ids[1], wid, kid]); // ảnh cờ đỏ
  await db.query(`update attendance_records set ended_at = started_at + interval '20 hours' where id = $1`, [ids[2]]);       // 20 giờ: quá dài, cần xem lại
  await db.query(`update attendance_records set status = 'rejected' where id = $1`, [ids[3]]);                              // đã từ chối
  const bulk = (who, dry) => asUser(db, who, `select attendance_bulk_confirm($1,$2,$3,null,$4) r`, [org, day, day, dry]);
  assert.deepEqual((await bulk(owner, true)).rows[0].r, { count: 36, skipped: 0 });
  assert.equal((await db.query(`select count(*)::int c from attendance_records where status='confirmed'`)).rows[0].c, 0);  // chạy thử không đổi gì
  assert.deepEqual((await bulk(mgr, false)).rows[0].r, { count: 36, skipped: 0 });
  assert.equal((await db.query(`select count(*)::int c from attendance_records where status='confirmed' and approved_minutes = 480`)).rows[0].c, 36);
  assert.equal((await db.query(`select status::text s from attendance_records where id = $1`, [ids[0]])).rows[0].s, 'needs_confirmation');
  assert.equal((await db.query(`select status::text s from attendance_records where id = $1`, [ids[1]])).rows[0].s, 'needs_confirmation');
  assert.deepEqual((await bulk(owner, false)).rows[0].r, { count: 0, skipped: 0 });                                          // chạy lại không làm gì thêm
  assert.match(await expectError(bulk(stranger, false)), /FORBIDDEN/);
});

test('tối đa 20 máy chấm công đang dùng mỗi cơ sở', async () => {
  const { db, owner, org } = await setup(1);
  for (let i = 0; i < 20; i++) {
    const u = await addUser(db, 100 + i);
    await db.query(`select kiosk_finalize($1,$2,null,$3,$4)`, [owner, org, u, `Máy ${i}`]);
  }
  assert.match(await expectError(db.query(`select * from kiosk_precheck($1,$2,null,'Máy 21',true)`, [owner, org])), /LIMIT/);
});
