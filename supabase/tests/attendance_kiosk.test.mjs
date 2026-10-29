import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0127: máy chấm công (điện thoại cố định ở phân khu): số điện thoại + PIN, một nút Vào/Ra, ảnh kèm theo, khóa khi sai nhiều lần.

const PHOTO = 'A'.repeat(300);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const kioskUser = await addUser(db, 9);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const worker = async (name, phone) => (await db.query(`insert into worker_profiles (organization_id, full_name, phone) values ($1,$2,$3) returning id`, [org, name, phone])).rows[0].id;
  const w1 = await worker('Lan', '0912345678');
  const w2 = await worker('Mai', '0987654321');
  // Edge Function: kiểm tra rồi ghi máy chấm công
  const email = (await db.query(`select auth_email from kiosk_precheck($1,$2,$3,'Máy cổng',true)`, [owner, org, area])).rows[0].auth_email;
  assert.match(email, /^kiosk-[0-9a-f]{32}@kiosk\./);
  const kioskId = (await db.query(`select kiosk_finalize($1,$2,$3,$4,'Máy cổng') id`, [owner, org, area, kioskUser])).rows[0].id;
  const dev = (sql, params) => asUser(db, kioskUser, sql, params);
  const setPin = async (w, phone, pin) => {
    const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w])).rows[0].c;
    return (await dev(`select kiosk_set_pin($1,$2,$3) r`, [phone, code, pin])).rows[0].r;
  };
  let n = 100;
  const id = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const check = async (phone, pin) => (await dev(`select kiosk_check($1,$2) r`, [phone, pin])).rows[0].r;
  const punch = async (phone, pin, action, pid = id(), photo = PHOTO, face = true) =>
    (await dev(`select kiosk_punch($1,$2,$3,$4,$5,$6) r`, [phone, pin, action, pid, photo, face])).rows[0].r;
  return { db, owner, mgr, kioskUser, org, area, w1, w2, kioskId, dev, setPin, check, punch, id };
}

test('luồng đầy đủ: cấp mã, đặt PIN, chỉ hiện đúng một nút, vào ca rồi ra ca kèm ảnh', async () => {
  const { db, w1, org, area, kioskId, dev, setPin, check, punch } = await setup();
  const me = (await dev(`select kiosk_me() m`)).rows[0].m;
  assert.equal(me.org_name, 'Hộ A'); assert.equal(me.area_name, 'Nhà màng 1');

  assert.equal((await check('0912345678', '2468')).code, 'NO_PIN');
  assert.equal((await setPin(w1, '0912345678', '2468')).ok, true);
  assert.deepEqual({ ...(await check('0912345678', '2468')), since: null, name: 'x' }, { ok: true, name: 'x', state: 'out', since: null, stale: false, cycle_name: null, is_owner: false, last_cycle: null });

  assert.equal((await punch('0912345678', '2468', 'out')).code, 'NOT_IN');           // chưa vào ca thì không Ra ca
  const r1 = await punch('0912345678', '2468', 'in');
  assert.equal(r1.ok, true); assert.equal(r1.name, 'Lan');
  assert.equal((await check('0912345678', '2468')).state, 'in');                      // giờ chỉ còn nút Ra ca
  assert.equal((await punch('0912345678', '2468', 'in')).code, 'ALREADY_IN');          // vào hai lần bị từ chối
  const r2 = await punch('0912345678', '2468', 'out');
  assert.equal(r2.ok, true);
  assert.equal((await check('0912345678', '2468')).state, 'out');

  const a = (await db.query(`select source::text s, status::text st, kiosk_id, area_id, ended_at is not null e from attendance_records where worker_id=$1`, [w1])).rows;
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { s: 'kiosk', st: 'needs_confirmation', kiosk_id: kioskId, area_id: area, e: true });
  assert.equal((await db.query(`select count(*)::int c from attendance_photos where worker_id=$1 and organization_id=$2`, [w1, org])).rows[0].c, 2);
});

test('bấm lặp cùng mã không nhân đôi; thiếu ảnh bị từ chối', async () => {
  const { db, w1, setPin, punch, id } = await setup();
  await setPin(w1, '0912345678', '2468');
  assert.equal((await punch('0912345678', '2468', 'in', id(), null)).code, 'NO_PHOTO');
  const pid = id();
  await punch('0912345678', '2468', 'in', pid);
  const again = await punch('0912345678', '2468', 'in', pid);
  assert.equal(again.ok, true); assert.equal(again.duplicate, true);
  assert.equal((await db.query(`select count(*)::int c from attendance_records where worker_id=$1`, [w1])).rows[0].c, 1);
});

test('sai PIN 5 lần thì khóa 15 phút (kể cả nhập đúng sau đó); chủ cấp mã mới thì mở khóa; không lộ sai số hay sai PIN', async () => {
  const { w1, setPin, check, owner, db, dev } = await setup();
  await setPin(w1, '0912345678', '2468');
  assert.equal((await check('0999999999', '2468')).message, (await check('0912345678', '1111')).message); // cùng một thông báo
  for (let i = 0; i < 3; i++) assert.equal((await check('0912345678', '0000')).code, 'BAD_LOGIN');
  assert.equal((await check('0912345678', '0000')).code, 'LOCKED');                  // lần sai thứ 5 (lần 1 ở dòng đầu)
  assert.equal((await check('0912345678', '2468')).code, 'LOCKED');                  // đúng PIN cũng không vào được khi đang khóa
  const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w1])).rows[0].c;
  assert.equal((await check('0912345678', '2468')).ok, true);                        // cấp mã mới = mở khóa, PIN cũ vẫn dùng được tới khi đặt PIN mới
  assert.equal((await dev(`select kiosk_set_pin('0912345678', $1, '1357') r`, [code])).rows[0].r.ok, true);
  assert.equal((await check('0912345678', '2468')).code, 'BAD_LOGIN');
  assert.equal((await check('0912345678', '1357')).ok, true);
});

test('đặt PIN: mã sai/hết hạn bị từ chối, PIN yếu bị từ chối, mã chỉ dùng được một lần', async () => {
  const { db, owner, w1, dev } = await setup();
  const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w1])).rows[0].c;
  assert.match(code, /^[0-9]{6}$/);
  const set = async (c, pin) => (await dev(`select kiosk_set_pin('0912345678', $1, $2) r`, [c, pin])).rows[0].r;
  assert.equal((await set('000000' === code ? '111111' : '000000', '2468')).code, 'BAD_CODE');
  for (const weak of ['1111', '1234', '654321', '5678', 'abcd', '12']) {
    const r = await set(code, weak);
    assert.equal(r.ok, false, weak);
  }
  assert.equal((await set(code, '2468')).ok, true);
  assert.equal((await set(code, '8642')).code, 'BAD_CODE');                           // mã đã dùng
  await asUser(db, owner, `select issue_pin_code($1) c`, [w1]);
  await db.query(`update worker_kiosk_pins set code_expires_at = now() - interval '1 minute' where worker_id=$1`, [w1]);
  assert.equal((await set('123456', '8642')).code, 'BAD_CODE');                       // hết hạn
});

test('quên Ra ca hôm trước: máy báo ca cũ, Ra ca xong đánh dấu để chủ xem lại giờ', async () => {
  const { db, w1, setPin, check, punch } = await setup();
  await setPin(w1, '0912345678', '2468');
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, source) values ('eeeeeeee-0000-4000-8000-000000000001', $1, vn_today() - 1, now() - interval '30 hours', 'admin')`, [w1]);
  const c = await check('0912345678', '2468');
  assert.equal(c.state, 'in'); assert.equal(c.stale, true);
  assert.equal((await punch('0912345678', '2468', 'out')).stale, true);
  const r = (await db.query(`select status::text s, exception_reason r from attendance_records where id='eeeeeeee-0000-4000-8000-000000000001'`)).rows[0];
  assert.equal(r.s, 'needs_confirmation'); assert.match(r.r, /Quên ra ca/);
});

test('phân quyền: tài khoản thiết bị không đọc được dữ liệu quản lý; người thường không dùng được hàm máy; PIN không đọc được; quản lý không liên kết/ngừng máy', async () => {
  const { db, owner, mgr, kioskUser, org, w1, kioskId, dev, setPin, punch } = await setup();
  await setPin(w1, '0912345678', '2468');
  await punch('0912345678', '2468', 'in');

  // thiết bị chỉ thấy chính nó, không thấy hồ sơ lao động, công, ảnh, PIN
  for (const t of ['worker_profiles', 'attendance_records', 'attendance_photos', 'worker_kiosk_pins', 'organization_memberships']) {
    const rows = (await dev(`select count(*)::int c from ${t}`)).rows[0].c;
    assert.equal(rows === 0 || t === 'organization_memberships' && rows === 0, true, t);
  }
  assert.equal((await dev(`select count(*)::int c from attendance_kiosks`)).rows[0].c, 1);
  assert.match(await expectError(dev(`select * from attendance_photo_review($1, current_date, current_date)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(dev(`select issue_pin_code($1)`, [w1])), /FORBIDDEN/);

  // chủ/quản lý cũng không đọc được PIN; người thường không phải máy chấm công
  assert.equal((await asUser(db, owner, `select count(*)::int c from worker_kiosk_pins`)).rows[0].c, 0);
  const asOwner = (await asUser(db, owner, `select kiosk_check('0912345678','2468') r`)).rows[0].r;
  assert.equal(asOwner.code, 'NO_KIOSK');
  assert.equal((await asUser(db, owner, `select kiosk_me() m`)).rows[0].m, null);

  // quản lý được cấp mã và xem ảnh, nhưng không tạo/ngừng máy (hàm này chỉ service_role gọi được)
  assert.match((await asUser(db, mgr, `select issue_pin_code($1) c`, [w1])).rows[0].c, /^[0-9]{6}$/);
  assert.equal((await asUser(db, mgr, `select count(*)::int c from attendance_photo_review($1, current_date - 1, current_date)`, [org])).rows[0].c, 0); // quản lý xem được (chưa có ảnh cờ đỏ)
  assert.match(await expectError(asUser(db, mgr, `select kiosk_revoke($1,$2)`, [mgr, kioskId])), /permission denied/);
  assert.match(await expectError(db.query(`select kiosk_revoke($1,$2)`, [mgr, kioskId])), /FORBIDDEN/);
  assert.match(await expectError(asAnon(db, `select kiosk_me()`)), /permission denied/);

  // thoát máy: chỉ chủ
  assert.equal((await asUser(db, owner, `select kiosk_can_exit($1) c`, [org])).rows[0].c, true);
  assert.equal((await asUser(db, mgr, `select kiosk_can_exit($1) c`, [org])).rows[0].c, false);

  // ngừng máy: không chấm công được nữa
  await db.query(`select kiosk_revoke($1,$2)`, [owner, kioskId]);
  assert.equal((await punch('0912345678', '2468', 'out')).code, 'NO_KIOSK');
  assert.equal((await dev(`select kiosk_me() m`)).rows[0].m, null);
  assert.ok(kioskUser);
});

test('liên kết máy: cần chủ, cần xác nhận đồng ý chụp ảnh, phân khu đúng cơ sở', async () => {
  const { db, owner, mgr, org, area } = await setup();
  assert.match(await expectError(db.query(`select * from kiosk_precheck($1,$2,$3,'Máy 2',true)`, [mgr, org, area])), /FORBIDDEN/);
  assert.match(await expectError(db.query(`select * from kiosk_precheck($1,$2,$3,'Máy 2',false)`, [owner, org, area])), /CONSENT_REQUIRED/);
  assert.match(await expectError(db.query(`select * from kiosk_precheck($1,$2,gen_random_uuid(),'Máy 2',true)`, [owner, org])), /INVALID_AREA/);
  assert.match(await expectError(db.query(`select * from kiosk_precheck($1,$2,$3,'',true)`, [owner, org, area])), /INVALID_NAME/);
});

test('ảnh đối chiếu: gắn cờ không thấy mặt, máy không kiểm được, hai người bấm sát nhau trên cùng máy; dọn ảnh cũ', async () => {
  const { db, owner, org, w1, w2, setPin, punch } = await setup();
  await setPin(w1, '0912345678', '2468');
  await setPin(w2, '0987654321', '1357');
  await punch('0912345678', '2468', 'in', undefined, PHOTO, true);    // máy không so được nhưng không phải cờ đỏ: không giữ ảnh
  await punch('0987654321', '1357', 'in', undefined, PHOTO, false);   // không thấy mặt, lại sát lượt của Lan trên cùng máy: cờ đỏ, giữ ảnh
  const rows = (await asUser(db, owner, `select wk_name, ph_kind, ph_flags from attendance_photo_review($1, current_date - 1, current_date + 1) order by ph_at`, [org])).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].ph_flags, ['no_face', 'fast_pair', 'no_ref']);
  assert.equal(rows[0].wk_name, 'Mai');
  assert.match(await expectError(asUser(db, owner, `select * from attendance_photo_review($1, current_date - 60, current_date)`, [org])), /INVALID_ARGUMENT/);

  await db.query(`update attendance_photos set taken_at = now() - interval '90 days' where kind='in'`);
  assert.equal((await db.query(`select purge_attendance_photos(60) n`)).rows[0].n, 2);
});
