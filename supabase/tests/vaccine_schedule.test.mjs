import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0203 (D166, mục 14 lát 3): lịch vaccine = mốc loại 'vaccine' + số lô khi đánh dấu đã tiêm.

const AREA = '20000000-0000-4000-8000-0000000000b9';
const CYC = '30000000-0000-4000-8000-0000000000b9';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Trại B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng 1')`, [AREA, org]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,null)`, [CYC, org, AREA, tpl]);
  return { db, owner, wk, other };
}

test('thêm mũi tiêm; nhân viên đánh dấu đã tiêm kèm số lô; bỏ đánh dấu xóa số lô', async () => {
  const { db, owner, wk } = await setup();
  const v = (await asUser(db, owner, `select * from add_cycle_milestone($1,'Dịch tả lần 1','start',21,'Theo thú y','vaccine')`, [CYC])).rows[0];
  assert.equal(v.kind, 'vaccine');
  const t = (await asUser(db, owner, `select * from add_cycle_milestone($1,'Tẩy giun','start',30,null)`, [CYC])).rows[0];
  assert.equal(t.kind, 'task');
  const done = (await asUser(db, wk, `select * from set_milestone_done($1,true,' LO-123 ')`, [v.id])).rows[0];
  assert.ok(done.done_at);
  assert.equal(done.lot_no, 'LO-123');
  // việc thường không lưu số lô
  assert.equal((await asUser(db, wk, `select * from set_milestone_done($1,true,'LO-9')`, [t.id])).rows[0].lot_no, null);
  const undone = (await asUser(db, wk, `select * from set_milestone_done($1,false)`, [v.id])).rows[0];
  assert.equal(undone.done_at, null);
  assert.equal(undone.lot_no, null);
});

test('loại mốc và số lô sai bị chặn; người ngoài cơ sở không thêm/đánh dấu được', async () => {
  const { db, owner, wk, other } = await setup();
  assert.match(await expectError(asUser(db, owner, `select * from add_cycle_milestone($1,'Mũi lạ','start',5,null,'khac')`, [CYC])), /INVALID_ARGUMENT/);
  assert.match(await expectError(asUser(db, wk, `select * from add_cycle_milestone($1,'Tự thêm','start',5,null,'vaccine')`, [CYC])), /FORBIDDEN/);
  const v = (await asUser(db, owner, `select * from add_cycle_milestone($1,'Mũi 1','start',7,null,'vaccine')`, [CYC])).rows[0];
  assert.match(await expectError(asUser(db, other, `select * from set_milestone_done($1,true,'X')`, [v.id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, wk, `select * from set_milestone_done($1,true,$2)`, [v.id, 'x'.repeat(61)])), /INVALID_ARGUMENT/);
});
