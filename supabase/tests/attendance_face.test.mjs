import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0128: đối chiếu khuôn mặt ở Máy chấm công - chỉ gắn cờ, không chặn; mẫu 128 số không ai đọc được.

const PHOTO = 'A'.repeat(300);
// Dấu vân giả: vector 128 số; lệch ở phần tử đầu => khoảng cách điều khiển được
const vec = (base, delta = 0, n = 128) => Array.from({ length: n }, (_, i) => base + (i === 0 ? delta : 0));
const near = (d) => vec(0.1, d);   // khoảng cách tới vec(0.1) đúng bằng d

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const kioskUser = await addUser(db, 9);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const w1 = (await db.query(`insert into worker_profiles (organization_id, full_name, phone) values ($1,'Lan','0912345678') returning id`, [org])).rows[0].id;
  const w2 = (await db.query(`insert into worker_profiles (organization_id, full_name, phone) values ($1,'Mai','0987654321') returning id`, [org])).rows[0].id;
  await db.query(`select kiosk_finalize($1,$2,null,$3,'Máy cổng')`, [owner, org, kioskUser]);
  const dev = (sql, params) => asUser(db, kioskUser, sql, params);
  let n = 500;
  const id = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const enroll = async (w, phone, pin, descriptors, consent = true, photo = PHOTO) => {
    const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w])).rows[0].c;
    return (await dev(`select kiosk_set_pin($1,$2,$3,$4::jsonb,$5,$6) r`, [phone, code, pin, JSON.stringify(descriptors), photo, consent])).rows[0].r;
  };
  const punch = async (phone, pin, action, desc, attempts = 1) =>
    (await dev(`select kiosk_punch($1,$2,$3,$4,$5,true,$6::jsonb,$7) r`, [phone, pin, action, id(), PHOTO, desc ? JSON.stringify(desc) : null, attempts])).rows[0].r;
  const review = async () => (await asUser(db, owner, `select wk_name, ph_kind, ph_flags, ph_distance from attendance_photo_review($1, current_date - 1, current_date + 1) order by ph_at`, [org])).rows;
  return { db, owner, org, w1, w2, dev, enroll, punch, review };
}

const faceRows = async (db) => (await db.query(`select (select count(*)::int from worker_face_refs) + (select count(*)::int from worker_face_profiles) c`)).rows[0].c;

test('đăng ký khuôn mặt: cần mã chủ cấp, cần người làm đồng ý, dữ liệu phải hợp lệ; ghi mẫu và ảnh mẫu', async () => {
  const { db, owner, org, w1, dev, enroll } = await setup();
  const three = [vec(0.1), vec(0.1, 0.02), vec(0.1, -0.02)];
  // không có mã thì không đăng ký được
  assert.equal((await dev(`select kiosk_set_pin('0912345678','123456','2468',$1::jsonb,$2,true) r`, [JSON.stringify(three), PHOTO])).rows[0].r.code, 'BAD_CODE');
  assert.equal((await enroll(w1, '0912345678', '2468', three, false)).code, 'CONSENT_REQUIRED');
  assert.equal((await enroll(w1, '0912345678', '2468', [vec(0.1, 0, 10)])).code, 'BAD_FACE');       // sai độ dài
  assert.equal((await enroll(w1, '0912345678', '2468', [])).code, 'BAD_FACE');                       // rỗng
  assert.equal((await enroll(w1, '0912345678', '2468', three, true, 'x')).code, 'BAD_FACE');         // ảnh mẫu không hợp lệ
  const r = await enroll(w1, '0912345678', '2468', three);
  assert.equal(r.ok, true); assert.equal(r.face, true);
  assert.equal((await db.query(`select count(*)::int c from worker_face_refs where worker_id=$1`, [w1])).rows[0].c, 3);
  assert.equal((await db.query(`select consent_at is not null c from worker_face_profiles where worker_id=$1`, [w1])).rows[0].c, true);
  // chủ thấy ảnh mẫu và trạng thái, nhưng không đọc được 128 số; máy chấm công không đọc gì
  assert.equal((await asUser(db, owner, `select count(*)::int c from worker_face_profiles`)).rows[0].c, 1);
  assert.equal((await asUser(db, owner, `select count(*)::int c from worker_face_refs`)).rows[0].c, 0);
  assert.equal((await dev(`select count(*)::int c from worker_face_profiles`)).rows[0].c, 0);
  assert.equal((await asUser(db, owner, `select has_face from list_kiosk_pin_status($1) where wid=$2`, [org, w1])).rows[0].has_face, true);
  // đăng ký lại cần mã mới và thay mẫu cũ
  assert.equal((await enroll(w1, '0912345678', '8642', [vec(0.3)])).ok, true);
  assert.equal((await db.query(`select count(*)::int c from worker_face_refs where worker_id=$1`, [w1])).rows[0].c, 1);
});

test('chỉ đặt PIN không kèm khuôn mặt vẫn được (người dùng từ Đợt 1)', async () => {
  const { db, owner, w1, dev } = await setup();
  const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w1])).rows[0].c;
  const r = (await dev(`select kiosk_set_pin('0912345678', $1, '2468') r`, [code])).rows[0].r;
  assert.equal(r.ok, true); assert.equal(r.face, false);
  assert.equal(await faceRows(db), 0);
});

test('so khớp: ba mức, kiểm trước khi ghi, máy chủ lưu khoảng cách, cờ trên màn của chủ', async () => {
  const { db, w1, w2, dev, enroll, punch, review } = await setup();
  await enroll(w1, '0912345678', '2468', [vec(0.1)]);
  const check = async (d) => (await dev(`select kiosk_face_check('0912345678','2468',$1::jsonb) r`, [JSON.stringify(d)])).rows[0].r;
  assert.equal((await check(near(0.3))).state, 'match');
  assert.equal((await check(near(0.55))).state, 'maybe');
  assert.equal((await check(near(0.7))).state, 'mismatch');
  assert.equal((await check([1, 2])).state, 'none');                        // dấu vân hỏng
  assert.equal((await dev(`select count(*)::int c from attendance_photos`)).rows[0].c, 0); // kiểm không ghi gì
  assert.equal((await dev(`select kiosk_face_check('0912345678','0000',$1::jsonb) r`, [JSON.stringify(near(0))])).rows[0].r.code, 'BAD_LOGIN');

  const a = await punch('0912345678', '2468', 'in', near(0.3));
  assert.equal(a.ok, true); assert.equal(a.face, 'match');
  const b = await punch('0912345678', '2468', 'out', near(0.7), 3);          // không khớp, đã thử 3 lần: vẫn ghi công
  assert.equal(b.ok, true); assert.equal(b.face, 'mismatch');
  assert.equal((await db.query(`select status::text s from attendance_records where worker_id=$1`, [w1])).rows[0].s, 'needs_confirmation');
  const rows = await review();
  assert.equal(rows.length, 1);                                              // lượt khớp rõ ràng không giữ ảnh nên không có ở màn xem
  assert.deepEqual(rows[0].ph_flags, ['face_mismatch', 'retries']);
  const kept = (await db.query(`select kind, photo is null np, face_distance d from attendance_photos order by taken_at`)).rows;
  assert.deepEqual(kept.map((x) => x.np), [true, false]);                    // vẫn giữ dòng số liệu của lượt khớp
  assert.ok(Math.abs(kept[0].d - 0.3) < 0.01);

  // khớp chưa chắc; có mẫu nhưng máy không gửi được dấu vân: chỉ cờ nhẹ, không giữ ảnh (vẫn giữ số liệu)
  await db.query(`update attendance_photos set taken_at = taken_at - interval '5 minutes'`);
  await punch('0912345678', '2468', 'in', near(0.55));
  await db.query(`update attendance_photos set taken_at = taken_at - interval '1 minute' where taken_at > now() - interval '30 seconds'`); // tránh cờ "bấm sát nhau"
  await enroll(w2, '0987654321', '1357', [vec(0.9)]);
  await punch('0987654321', '1357', 'in', null);
  assert.equal((await review()).length, 1);
  const soft = (await db.query(`select photo is null np, face_distance d from attendance_photos where taken_at > now() - interval '2 minutes' order by taken_at`)).rows;
  assert.deepEqual(soft.map((x) => x.np), [true, true]);
  assert.ok(soft[0].d > 0.5 && soft[0].d < 0.6 && soft[1].d === null);
});

test('chủ xóa dữ liệu khuôn mặt; nghỉ việc thì tự xóa; người khác không xóa được; cờ "chưa có mẫu"', async () => {
  const { db, owner, w1, dev, enroll, punch, review } = await setup();
  await enroll(w1, '0912345678', '2468', [vec(0.1)]);
  assert.match(await expectError(dev(`select delete_worker_face($1)`, [w1])), /FORBIDDEN/);
  await asUser(db, owner, `select delete_worker_face($1)`, [w1]);
  assert.equal(await faceRows(db), 0);
  await punch('0912345678', '2468', 'in', near(0));
  assert.equal((await review()).length, 0);                                  // chưa có mẫu chỉ là cờ nhẹ: không giữ ảnh
  // nghỉ việc -> xóa
  await enroll(w1, '0912345678', '8642', [vec(0.1)]);
  assert.equal((await db.query(`select count(*)::int c from worker_face_profiles`)).rows[0].c, 1);
  await db.query(`update worker_profiles set status='inactive' where id=$1`, [w1]);
  assert.equal(await faceRows(db), 0);
});
