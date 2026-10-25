import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { milestoneDue, milestoneStatus, restWarning } from '../../apps/app/src/lib/milestoneLogic.ts';

// Migration 0086 (D100, P4 gọn): mốc nhắc việc an toàn của quy trình và của vụ.

const AREA = '20000000-0000-4000-8000-0000000000a9';
const CYC = '30000000-0000-4000-8000-0000000000a9';
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu dưa') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  return { db, owner, wk, other, org, tpl };
}

test('mốc của quy trình mẫu: người khai báo thêm được; người khác cơ sở không thấy; nhân viên không sửa', async () => {
  const { db, owner, wk, other, tpl } = await setup();
  await asUser(db, owner, `insert into template_milestones (template_id,title,anchor,offset_days) values ($1,'Ngưng bón phân','end',7),($1,'Tiêm vaccine lần 1','start',21)`, [tpl]);
  assert.equal((await db.query(`select count(*)::int n from template_milestones`)).rows[0].n, 2);
  assert.equal((await asUser(db, other, `select count(*)::int n from template_milestones`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, wk, `insert into template_milestones (template_id,title,anchor,offset_days) values ($1,'x y','end',1)`, [tpl])), /row-level|violates/i);
  assert.match(await expectError(asUser(db, owner, `insert into template_milestones (template_id,title,anchor,offset_days) values ($1,'Sai mốc','giua',1)`, [tpl])), /check|anchor/i);
});

test('tạo vụ theo mẫu sao mốc sang vụ; nhân bản mẫu nhân bản mốc; ngày đến hạn tự dời theo ngày thu dự kiến', async () => {
  const { db, owner, org, tpl } = await setup();
  await asUser(db, owner, `insert into template_milestones (template_id,title,anchor,offset_days) values ($1,'Ngưng bón phân','end',7),($1,'Tiêm vaccine lần 1','start',21)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,null)`, [CYC, org, AREA, tpl]);
  const ms = (await db.query(`select id, title, anchor, offset_days from cycle_milestones where cycle_id=$1 order by anchor`, [CYC])).rows;
  assert.deepEqual(ms.map((m) => m.title), ['Ngưng bón phân', 'Tiêm vaccine lần 1']);
  const cyc = (await db.query(`select start_date::text start_date, expected_end_date::text expected_end_date from production_cycles where id=$1`, [CYC])).rows[0];
  assert.equal(cyc.expected_end_date, '2026-11-10');
  assert.equal(milestoneDue(ms[0], cyc), '2026-11-03');   // 7 ngày trước ngày thu dự kiến
  assert.equal(milestoneDue(ms[1], cyc), '2026-11-22');   // 21 ngày sau khi bắt đầu
  assert.equal(milestoneDue(ms[0], { ...cyc, expected_end_date: '2026-11-20' }), '2026-11-13'); // đổi ngày thu thì mốc dời
  const copy = (await asUser(db, owner, `select duplicate_cycle_template($1,'Bản sao') id`, [tpl])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_milestones where template_id=$1`, [copy])).rows[0].n, 2);
});

test('mốc của vụ: quản lý thêm/xóa, nhân viên đánh dấu đã làm; người ngoài không thấy và không sửa', async () => {
  const { db, owner, wk, other, org, tpl } = await setup();
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,null)`, [CYC, org, AREA, tpl]);
  const m = (await asUser(db, owner, `select * from add_cycle_milestone($1,'Tẩy giun','start',45,'Theo thú y')`, [CYC])).rows[0];
  assert.match(await expectError(asUser(db, wk, `select * from add_cycle_milestone($1,'Tự thêm','start',1,null)`, [CYC])), /FORBIDDEN/);
  assert.equal((await asUser(db, other, `select count(*)::int n from cycle_milestones`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, other, `select * from set_milestone_done($1,true)`, [m.id])), /FORBIDDEN/);
  const done = (await asUser(db, wk, `select * from set_milestone_done($1,true)`, [m.id])).rows[0];
  assert.ok(done.done_at && done.done_by);
  assert.equal(milestoneStatus(done, { start_date: '2026-11-01' }, '2026-12-30'), 'done');
  await asUser(db, wk, `select * from set_milestone_done($1,false)`, [m.id]);
  assert.equal(milestoneStatus({ anchor: 'start', offset_days: 45, done_at: null }, { start_date: '2026-11-01' }, '2026-12-15'), 'soon');
  assert.equal(milestoneStatus({ anchor: 'start', offset_days: 45, done_at: null }, { start_date: '2026-11-01' }, '2026-12-17'), 'overdue');
  assert.match(await expectError(asUser(db, wk, `select delete_cycle_milestone($1)`, [m.id])), /FORBIDDEN/);
  await asUser(db, owner, `select delete_cycle_milestone($1)`, [m.id]);
  assert.equal((await db.query(`select count(*)::int n from cycle_milestones where id=$1`, [m.id])).rows[0].n, 0);
});

test('cảnh báo trống chuồng ít hơn 7 ngày và khu còn vụ đang chạy (logic phía app)', () => {
  const cycles = [{ id: 'c1', area_id: 'a', status: 'ended', expected_end_date: '2026-11-01' }];
  assert.match(restWarning('a', '2026-11-05', 7, cycles, () => null), /mới cách 4 ngày/);
  assert.equal(restWarning('a', '2026-11-08', 7, cycles, () => null), null);
  assert.equal(restWarning('a', '2026-11-05', 7, cycles, () => '2026-10-20'), null);   // ngày hoàn thành thực tế sớm hơn dự kiến
  assert.match(restWarning('a', '2026-11-05', 7, [{ id: 'c2', area_id: 'a', status: 'active' }], () => null), /đang có vụ chạy/);
  assert.equal(restWarning('b', '2026-11-05', 7, cycles, () => null), null);          // khu khác
});
