import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0117: sửa/xóa công đoạn của vụ đã tạo, chuyển việc sang công đoạn khác.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), worker = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const sys = (await db.query(`select id from system_templates where code='melon_greenhouse'`)).rows[0].id;
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys, melon])).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng') returning id`, [org])).rows[0].id;
  const cyc = 'aaaaaaaa-0000-4000-8000-0000000000c1';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  return { db, owner, worker, other, cyc };
}

test('đổi tên và số thứ tự công đoạn của vụ: áp cho mọi việc trong công đoạn; người không có quyền không đổi được', async () => {
  const { db, owner, worker, other, cyc } = await setup();
  const n = (await asUser(db, owner, `select update_cycle_phase($1,'Ươm cây','2A','Ươm cây con') n`, [cyc])).rows[0].n;
  assert.equal(n, 3);
  const r = (await db.query(`select distinct phase_code, phase_name from production_stages where cycle_id=$1 and phase_name='Ươm cây con'`, [cyc])).rows;
  assert.deepEqual(r, [{ phase_code: '2A', phase_name: 'Ươm cây con' }]);
  assert.match(await expectError(asUser(db, owner, `select update_cycle_phase($1,'Không có','1','X')`, [cyc])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, owner, `select update_cycle_phase($1,'Ươm cây con','1','  ')`, [cyc])), /INVALID_NAME/);
  assert.match(await expectError(asUser(db, worker, `select update_cycle_phase($1,'Ươm cây con','1','Đổi')`, [cyc])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select update_cycle_phase($1,'Ươm cây con','1','Đổi')`, [cyc])), /FORBIDDEN/);
});

test('chuyển một việc sang công đoạn khác hoặc ra ngoài công đoạn qua update_cycle_stage', async () => {
  const { db, owner, cyc } = await setup();
  const st = (await db.query(`select id from production_stages where cycle_id=$1 and phase_name='Chuẩn bị' order by seq limit 1`, [cyc])).rows[0].id;
  await asUser(db, owner, `select * from update_cycle_stage($1,$2::jsonb)`, [st, JSON.stringify({ phase_name: 'Trồng cây', phase_code: '3' })]);
  assert.deepEqual((await db.query(`select phase_name, phase_code from production_stages where id=$1`, [st])).rows[0], { phase_name: 'Trồng cây', phase_code: '3' });
  await asUser(db, owner, `select * from update_cycle_stage($1,$2::jsonb)`, [st, JSON.stringify({ phase_name: '' })]);
  assert.deepEqual((await db.query(`select phase_name, phase_code from production_stages where id=$1`, [st])).rows[0], { phase_name: null, phase_code: null });
});

test('xóa công đoạn của vụ: giữ việc hoặc xóa cả; việc đã bắt đầu hoặc có nhật ký thì không xóa cả được', async () => {
  const { db, owner, cyc } = await setup();
  assert.equal((await asUser(db, owner, `select delete_cycle_phase($1,'Chuẩn bị',false) n`, [cyc])).rows[0].n, 2);
  assert.equal((await db.query(`select count(*)::int n from production_stages where cycle_id=$1 and phase_name is null and name in ('Chuẩn bị giá thể','Bón phân')`, [cyc])).rows[0].n, 2);
  // xóa cả: Ươm cây (3 việc, chưa làm) → mất 3
  const before = (await db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [cyc])).rows[0].n;
  assert.equal((await asUser(db, owner, `select delete_cycle_phase($1,'Ươm cây',true) n`, [cyc])).rows[0].n, 3);
  assert.equal((await db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [cyc])).rows[0].n, before - 3);
  // việc đã bắt đầu thì chặn
  await db.query(`update production_cycles set status='active' where id=$1`, [cyc]);
  const s = (await db.query(`select id from production_stages where cycle_id=$1 and phase_name='Trồng cây' order by seq limit 1`, [cyc])).rows[0].id;
  await asUser(db, owner, `select advance_stage($1,'start')`, [s]);
  assert.match(await expectError(asUser(db, owner, `select delete_cycle_phase($1,'Trồng cây',true)`, [cyc])), /INVALID_TRANSITION/);
  assert.equal((await asUser(db, owner, `select delete_cycle_phase($1,'Trồng cây',false) n`, [cyc])).rows[0].n, 3); // vẫn tách được khỏi công đoạn
});
