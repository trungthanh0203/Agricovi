import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

// Migration 0033 (D45): đổi họ tên, số điện thoại nhân viên.
test('đổi tên và số điện thoại nhân viên: chỉ chủ; số trùng bị chặn; email ẩn đổi theo; hồ sơ lao động đổi theo', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const mk = async (n, phone) => {
    const pre = (await db.query(`select * from staff_precheck($1,$2,$3,$4::member_role[])`, [owner, org, phone, '{worker}'])).rows[0];
    await db.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password) values ($1,$1,'authenticated','authenticated',$2,'h')`, [uid(n), pre.auth_email]);
    await db.query(`select staff_finalize($1,$2,$3,$4,$5,'NV Một','{worker}'::member_role[],'self_hourly',null)`, [owner, org, uid(n), pre.phone, pre.auth_email]);
  };
  await mk(10, '0911111111');
  await mk(11, '0922222222');
  const upd = (actor, user, name, phone) => db.query(`select staff_update_profile($1,$2,$3,$4,$5) r`, [actor, org, user, name, phone]);

  const r = (await upd(owner, uid(10), '  Nguyễn Văn A  ', '0933 333 333')).rows[0].r;
  assert.equal(r.phone, '0933333333');
  assert.match(r.auth_email, /^0933333333@sdt\./);
  assert.equal(r.old_phone, '0911111111');
  const s = (await db.query(`select full_name, phone, auth_email from staff_accounts where user_id=$1`, [uid(10)])).rows[0];
  assert.deepEqual([s.full_name, s.phone], ['Nguyễn Văn A', '0933333333']);
  const w = (await db.query(`select full_name, phone from worker_profiles where user_id=$1`, [uid(10)])).rows[0];
  assert.deepEqual([w.full_name, w.phone], ['Nguyễn Văn A', '0933333333']);

  await upd(owner, uid(10), 'Chỉ đổi tên', '0933333333'); // giữ số: không báo trùng với chính mình
  assert.match(await expectError(upd(owner, uid(10), 'Tên', '0922222222')), /PHONE_IN_USE/);
  assert.match(await expectError(upd(owner, uid(10), 'Tên', '123')), /INVALID_PHONE/);
  assert.match(await expectError(upd(owner, uid(10), 'A', '0933333333')), /INVALID_NAME/);
  assert.match(await expectError(upd(uid(11), uid(10), 'Tên', '0933333333')), /FORBIDDEN/);
});
