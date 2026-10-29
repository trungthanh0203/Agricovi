import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0130: chỉ giữ ảnh khi máy nghi ngờ; hỏi vụ khi Vào ca tùy chọn theo máy (mặc định tắt).

const PHOTO = 'A'.repeat(300);
const vec = (base, delta = 0) => Array.from({ length: 128 }, (_, i) => base + (i === 0 ? delta : 0));

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const kioskUser = await addUser(db, 9);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const kid = (await db.query(`select kiosk_finalize($1,$2,null,$3,'Máy cổng') id`, [owner, org, kioskUser])).rows[0].id;
  const dev = (sql, params) => asUser(db, kioskUser, sql, params);
  const w = async (name, phone, pin, withFace) => {
    const id = (await db.query(`insert into worker_profiles (organization_id, full_name, phone) values ($1,$2,$3) returning id`, [org, name, phone])).rows[0].id;
    const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [id])).rows[0].c;
    await dev(`select kiosk_set_pin($1,$2,$3,$4::jsonb,$5,$6) r`, [phone, code, pin, withFace ? JSON.stringify([vec(0.1)]) : null, withFace ? PHOTO : null, Boolean(withFace)]);
    return id;
  };
  let n = 900;
  const id = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const punch = async (phone, pin, action, { desc = null, faceOk = true, attempts = 1 } = {}) =>
    (await dev(`select kiosk_punch($1,$2,$3,$4,$5,$6,$7::jsonb,$8) r`, [phone, pin, action, id(), PHOTO, faceOk, desc ? JSON.stringify(desc) : null, attempts])).rows[0].r;
  const lastKept = async () => (await db.query(`select photo is not null k from attendance_photos order by taken_at desc limit 1`)).rows[0].k;
  return { db, owner, mgr, org, kid, dev, w, punch, lastKept };
}

test('chỉ cờ đỏ mới giữ ảnh: không thấy mặt, không khớp, chụp lại từ 3 lần; khớp rõ, khớp chưa chắc, không so được thì không giữ', async () => {
  const { w, punch, lastKept, db } = await setup();
  await w('Lan', '0912345678', '2468', true);
  await punch('0912345678', '2468', 'in', { desc: vec(0.1, 0.2) });          // khớp rõ ràng
  assert.equal(await lastKept(), false);
  await punch('0912345678', '2468', 'out', { desc: vec(0.1, 0.3) });
  assert.equal(await lastKept(), false);
  await punch('0912345678', '2468', 'in', { desc: vec(0.1, 0.55) });         // khớp chưa chắc: cờ nhẹ, không giữ
  assert.equal(await lastKept(), false);
  await punch('0912345678', '2468', 'out', { desc: vec(0.1, 0.8) });         // không khớp -> giữ
  assert.equal(await lastKept(), true);
  await punch('0912345678', '2468', 'in', { desc: vec(0.1, 0.2), faceOk: false }); // máy không thấy mặt -> giữ
  assert.equal(await lastKept(), true);
  await punch('0912345678', '2468', 'out', { desc: vec(0.1, 0.2), attempts: 3 });  // phải chụp lại nhiều lần -> giữ
  assert.equal(await lastKept(), true);
  await punch('0912345678', '2468', 'in', { desc: null });                   // không so được: cờ nhẹ, không giữ
  assert.equal(await lastKept(), false);
  assert.equal((await db.query(`select count(*)::int c from attendance_photos where photo is null`)).rows[0].c, 4);
  assert.equal((await db.query(`select count(*)::int c from attendance_photos where photo is not null`)).rows[0].c, 3);
});

test('chưa có mẫu thì không giữ ảnh; hai người khác nhau bấm cùng máy trong 6 giây thì giữ ảnh', async () => {
  const { db, w, punch, lastKept } = await setup();
  await w('Mai', '0987654321', '1357', false);
  await punch('0987654321', '1357', 'in', { desc: vec(0.1) });
  assert.equal(await lastKept(), false);                                     // lượt đầu: chưa ai bấm sát trước đó
  await w('Lan', '0912345678', '2468', true);
  await punch('0912345678', '2468', 'in', { desc: vec(0.1) });               // ngay sau Mai, cùng máy, dưới 6 giây -> giữ
  assert.equal(await lastKept(), true);
  await db.query(`update attendance_photos set taken_at = taken_at - interval '1 minute'`);
  await punch('0987654321', '1357', 'out', { desc: vec(0.1) });              // cách xa các lượt khác -> không giữ
  assert.equal(await lastKept(), false);
});

test('quên Ra ca hôm trước thì giữ ảnh dù khớp mặt', async () => {
  const { db, w, punch, lastKept } = await setup();
  const w1 = await w('Lan', '0912345678', '2468', true);
  await db.query(`insert into attendance_records (id, worker_id, work_date, started_at, source, status) values ('eeeeeeee-0000-4000-8000-000000000002', $1, vn_today() - 1, now() - interval '30 hours', 'admin', 'open')`, [w1]);
  const r = await punch('0912345678', '2468', 'out', { desc: vec(0.1) });
  assert.equal(r.stale, true);
  assert.equal(await lastKept(), true);
});

test('màn xem chỉ liệt kê dòng có ảnh', async () => {
  const { db, owner, org, w, punch } = await setup();
  await w('Lan', '0912345678', '2468', true);
  await punch('0912345678', '2468', 'in', { desc: vec(0.1, 0.2) });
  await punch('0912345678', '2468', 'out', { desc: vec(0.1, 0.9) });
  const rows = (await asUser(db, owner, `select ph_kind from attendance_photo_review($1, current_date - 1, current_date + 1)`, [org])).rows;
  assert.deepEqual(rows.map((r) => r.ph_kind), ['out']);
});

test('hỏi vụ khi Vào ca: mặc định tắt, chỉ chủ bật được', async () => {
  const { db, owner, mgr, org, kid, dev } = await setup();
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Khu 1') returning id`, [org])).rows[0].id;
  const crop = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  await db.query(`insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, name) values (gen_random_uuid(), $1,$2,$3,'active', current_date, 'Vụ A')`, [org, area, crop]);
  assert.deepEqual((await dev(`select kiosk_cycles() r`)).rows[0].r, []);
  assert.match(await expectError(asUser(db, mgr, `select set_kiosk_ask_cycle($1,true)`, [kid])), /FORBIDDEN/);
  await asUser(db, owner, `select set_kiosk_ask_cycle($1,true)`, [kid]);
  assert.equal((await dev(`select kiosk_cycles() r`)).rows[0].r.length, 1);
  await asUser(db, owner, `select set_kiosk_ask_cycle($1,false)`, [kid]);
  assert.deepEqual((await dev(`select kiosk_cycles() r`)).rows[0].r, []);
});
