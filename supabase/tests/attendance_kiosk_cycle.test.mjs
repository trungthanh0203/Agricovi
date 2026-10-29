import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0129: Vào ca ở máy chấm công chọn vụ (để tính chi phí nhân công theo vụ); chủ cơ sở nhận ra bằng SĐT + PIN; đặt SĐT cho người làm.

const PHOTO = 'A'.repeat(300);

async function setup(kioskArea = true) {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const kioskUser = await addUser(db, 9);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const area = async (name) => (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,$2) returning id`, [org, name])).rows[0].id;
  const a1 = await area('Nhà màng 1');
  const a2 = await area('Nhà màng 2');
  const crop = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  const cycle = async (areaId, name, status = 'active') => (await db.query(
    `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, name) values (gen_random_uuid(), $1,$2,$3,$4, current_date, $5) returning id`,
    [org, areaId, crop, status, name])).rows[0].id;
  const c1 = await cycle(a1, 'Dưa lưới vụ 1');
  const c2 = await cycle(a2, 'Dưa lưới vụ 2');
  await cycle(a1, 'Vụ đã xong', 'preparing');                       // không phải vụ đang sản xuất
  await db.query(`select kiosk_finalize($1,$2,$3,$4,'Máy cổng')`, [owner, org, kioskArea ? a1 : null, kioskUser]);
  const dev = (sql, params) => asUser(db, kioskUser, sql, params);
  const worker = async (name, phone, userId = null) => (await db.query(`insert into worker_profiles (organization_id, full_name, phone, user_id) values ($1,$2,$3,$4) returning id`, [org, name, phone, userId])).rows[0].id;
  const setPin = async (w, phone, pin) => {
    const code = (await asUser(db, owner, `select issue_pin_code($1) c`, [w])).rows[0].c;
    return (await dev(`select kiosk_set_pin($1,$2,$3) r`, [phone, code, pin])).rows[0].r;
  };
  let n = 700;
  const id = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const punch = async (phone, pin, action, cycle = null) =>
    (await dev(`select kiosk_punch($1,$2,$3,$4,$5,true,null,1,$6) r`, [phone, pin, action, id(), PHOTO, cycle])).rows[0].r;
  return { db, owner, mgr, org, a1, a2, c1, c2, dev, worker, setPin, punch };
}

test('danh sách vụ ở máy: máy có phân khu thì chỉ vụ của phân khu; không có phân khu thì mọi vụ đang sản xuất', async () => {
  const s = await setup(true);
  const list = (await s.dev(`select kiosk_cycles() r`)).rows[0].r;
  assert.deepEqual(list.map((c) => c.name), ['Dưa lưới vụ 1']);
  assert.equal(list[0].in_area, true);
  const t = await setup(false);
  assert.deepEqual((await t.dev(`select kiosk_cycles() r`)).rows[0].r.map((c) => c.name).sort(), ['Dưa lưới vụ 1', 'Dưa lưới vụ 2']);
  // không phải máy chấm công
  assert.deepEqual((await asUser(s.db, s.owner, `select kiosk_cycles() r`)).rows[0].r, []);
});

test('Vào ca gắn vụ: lưu vào công (để tính chi phí nhân công vụ), nhớ vụ lần trước, hiện vụ ở ca đang mở; vụ không hợp lệ bị từ chối', async () => {
  const { db, c1, c2, dev, worker, setPin, punch } = await setup(true);
  const w = await worker('Lan', '0912345678');
  await setPin(w, '0912345678', '2468');
  assert.equal((await punch('0912345678', '2468', 'in', c2)).code, 'INVALID_CYCLE');     // vụ ở phân khu khác
  assert.equal((await punch('0912345678', '2468', 'in', 'ffffffff-0000-4000-8000-000000000000')).code, 'INVALID_CYCLE');
  assert.equal((await punch('0912345678', '2468', 'in', c1)).ok, true);
  assert.equal((await db.query(`select cycle_id from attendance_records where worker_id=$1`, [w])).rows[0].cycle_id, c1);
  const mid = (await dev(`select kiosk_check('0912345678','2468') r`)).rows[0].r;
  assert.equal(mid.state, 'in'); assert.equal(mid.cycle_name, 'Dưa lưới vụ 1');
  await punch('0912345678', '2468', 'out');
  const after = (await dev(`select kiosk_check('0912345678','2468') r`)).rows[0].r;
  assert.equal(after.state, 'out'); assert.equal(after.last_cycle, c1);
  // việc chung: không thuộc vụ nào
  assert.equal((await punch('0912345678', '2468', 'in', null)).ok, true);
  assert.equal((await db.query(`select cycle_id from attendance_records where worker_id=$1 and ended_at is null`, [w])).rows[0].cycle_id, null);
});

test('chủ cơ sở được nhận ra khi nhập SĐT + PIN của chủ (để hiện nút Thoát); người khác thì không', async () => {
  const { db, owner, mgr, dev, worker, setPin } = await setup(true);
  const wo = await worker('Chủ', '0901112233', owner);
  const wm = await worker('Quản lý', '0904445566', mgr);
  const wx = await worker('Lan', '0912345678');
  await setPin(wo, '0901112233', '2468'); await setPin(wm, '0904445566', '1357'); await setPin(wx, '0912345678', '8642');
  const is = async (p, pin) => (await dev(`select kiosk_check($1,$2) r`, [p, pin])).rows[0].r.is_owner;
  assert.equal(await is('0901112233', '2468'), true);
  assert.equal(await is('0904445566', '1357'), false);
  assert.equal(await is('0912345678', '8642'), false);
  assert.ok(db);
});

test('đặt số điện thoại cho người làm: chủ/quản lý được, đúng định dạng, không trùng; người thường không được', async () => {
  const { db, owner, dev, worker } = await setup(true);
  const w1 = await worker('Chủ', null, owner);
  const w2 = await worker('Mai', '0987654321');
  const set = (who, id, ph) => asUser(db, who, `select set_worker_phone($1,$2) p`, [id, ph]);
  assert.equal((await set(owner, w1, '0901 112 233')).rows[0].p, '0901112233');
  assert.match(await expectError(set(owner, w1, '123')), /INVALID_PHONE/);
  assert.match(await expectError(set(owner, w1, '0987654321')), /PHONE_IN_USE/);
  assert.match(await expectError(dev(`select set_worker_phone($1,'0911223344')`, [w2])), /FORBIDDEN/);
});
