import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0132: liên kết lại máy chấm công đã có (chỉ chủ; bật lại máy đã ngừng trong hạn mức 20 máy).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const kioskUser = await addUser(db, 9);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const kid = (await db.query(`select kiosk_finalize($1,$2,null,$3,'Máy cổng') id`, [owner, org, kioskUser])).rows[0].id;
  return { db, owner, mgr, org, kid, kioskUser };
}

test('chủ liên kết lại máy đang dùng: trả về tài khoản thiết bị, không đổi cài đặt; quản lý/người lạ không được', async () => {
  const { db, owner, mgr, kid, kioskUser } = await setup();
  const r = (await db.query(`select * from kiosk_relink($1,$2)`, [owner, kid])).rows[0];
  assert.equal(r.device_user, kioskUser); assert.equal(r.kiosk_name, 'Máy cổng'); assert.match(r.auth_email, /@test\.local$/);
  assert.equal((await db.query(`select active from attendance_kiosks where id=$1`, [kid])).rows[0].active, true);
  assert.match(await expectError(db.query(`select * from kiosk_relink($1,$2)`, [mgr, kid])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select * from kiosk_relink($1,$2)`, [owner, kid])), /permission denied/);   // chỉ Edge Function (service_role) gọi được
  assert.match(await expectError(db.query(`select * from kiosk_relink($1,gen_random_uuid())`, [owner])), /FORBIDDEN/);
});

test('máy đã ngừng được bật lại khi liên kết lại, nhưng không vượt 20 máy đang dùng', async () => {
  const { db, owner, org, kid } = await setup();
  await db.query(`select kiosk_revoke($1,$2)`, [owner, kid]);
  assert.equal((await db.query(`select active from attendance_kiosks where id=$1`, [kid])).rows[0].active, false);
  // đầy 20 máy khác
  for (let i = 0; i < 20; i++) {
    const u = await addUser(db, 100 + i);
    await db.query(`select kiosk_finalize($1,$2,null,$3,$4)`, [owner, org, u, `Máy ${i}`]);
  }
  assert.match(await expectError(db.query(`select * from kiosk_relink($1,$2)`, [owner, kid])), /LIMIT/);
  await db.query(`update attendance_kiosks set active = false where name = 'Máy 0'`);
  await db.query(`select * from kiosk_relink($1,$2)`, [owner, kid]);
  assert.equal((await db.query(`select active from attendance_kiosks where id=$1`, [kid])).rows[0].active, true);
});
