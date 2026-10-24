import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0076 (D95, T3): sự cố của vụ và việc khắc phục.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000f1';
const INC = '50000000-0000-4000-8000-000000000001';
const ACT = '60000000-0000-4000-8000-000000000001';

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), mgr = await addUser(db, 3), out = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['manager']::member_role[])`, [org, wk, mgr]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [CYC, org, area, tpl]);
  return { db, owner, wk, mgr, out, org };
}
const report = (c, u, id = INC, kind = 'pest', extra = 'null, null, null') =>
  asUser(c.db, u, `select report_incident($1,$2,$3,'2026-10-20'::date,null,'high','Dưa bị héo rũ ở luống 3',${extra})`, [id, CYC, kind]);

test('nhân viên báo sự cố được; người ngoài cơ sở không báo và không thấy; gửi lặp không nhân đôi', async () => {
  const c = await setup();
  await report(c, c.wk, INC, 'pest', '12.5, 3000000, null');
  await report(c, c.wk); // gửi lặp
  assert.equal((await c.db.query(`select count(*)::int n from cycle_incidents`)).rows[0].n, 1);
  const r = (await c.db.query(`select kind, severity, status, loss_quantity::float q, loss_amount::float m, organization_id = $1 as org_ok, author_name from cycle_incidents`, [c.org])).rows[0];
  assert.deepEqual([r.kind, r.severity, r.status, r.q, r.m, r.org_ok], ['pest', 'high', 'open', 12.5, 3000000, true]);
  assert.ok(r.author_name);
  assert.match(await expectError(report(c, c.out, '50000000-0000-4000-8000-000000000002')), /FORBIDDEN/);
  assert.equal((await asUser(c.db, c.out, `select count(*)::int n from cycle_incidents`)).rows[0].n, 0);
  assert.equal((await asUser(c.db, c.wk, `select count(*)::int n from cycle_incidents`)).rows[0].n, 1);
  assert.match(await expectError(asUser(c.db, c.wk, `insert into cycle_incidents (id,cycle_id,kind,incident_date,description) values (gen_random_uuid(),$1,'pest','2026-10-20','x')`, [CYC])), /permission denied|row-level/i);
  assert.match(await expectError(report(c, c.wk, '50000000-0000-4000-8000-000000000003', 'khac')), /INVALID_KIND/);
  assert.match(await expectError(asUser(c.db, c.wk, `select report_incident($1,$2,'pest','2030-01-01'::date,null,'low','x')`, ['50000000-0000-4000-8000-000000000004', CYC])), /INVALID_DATE/);
});

test('việc khắc phục: chỉ quản lý giao; người được giao đánh dấu xong; đóng sự cố chỉ khi hết việc', async () => {
  const c = await setup();
  await report(c, c.wk);
  const give = (u, assignee = c.wk) => asUser(c.db, u, `select add_incident_action($1,$2,'Phun thuốc xử lý nấm',$3,'2026-10-22'::date)`, [ACT, INC, assignee]);
  assert.match(await expectError(give(c.wk)), /FORBIDDEN/);
  assert.match(await expectError(give(c.mgr, c.out)), /INVALID_ASSIGNEE/);
  await give(c.mgr);
  assert.ok((await c.db.query(`select assignee_name from incident_actions`)).rows[0].assignee_name);
  assert.match(await expectError(asUser(c.db, c.mgr, `select close_incident($1,'xong')`, [INC])), /OPEN_ACTIONS/);
  assert.match(await expectError(asUser(c.db, c.out, `select set_incident_action_done($1,true)`, [ACT])), /NOT_FOUND/);
  await asUser(c.db, c.wk, `select set_incident_action_done($1,true)`, [ACT]);
  assert.match(await expectError(asUser(c.db, c.wk, `select close_incident($1,'xong')`, [INC])), /FORBIDDEN/);
  const closed = (await asUser(c.db, c.mgr, `select (close_incident($1,'Đã xử lý, dưa phục hồi')).status s`, [INC])).rows[0].s;
  assert.equal(closed, 'closed');
  assert.match(await expectError(asUser(c.db, c.mgr, `select add_incident_action('60000000-0000-4000-8000-000000000002',$1,'Việc mới',null,null)`, [INC])), /CLOSED/);
  assert.equal((await asUser(c.db, c.mgr, `select (reopen_incident($1)).status s`, [INC])).rows[0].s, 'open');
});

test('sửa có phiên bản, hủy cần lý do, số liệu vụ và báo cáo tuần đếm sự cố mở/việc quá hạn', async () => {
  const c = await setup();
  await report(c, c.wk);
  await asUser(c.db, c.mgr, `select add_incident_action($1,$2,'Cách ly luống 3',$3,'2020-01-01'::date)`, [ACT, INC, c.wk]);
  const v = (await c.db.query(`select version from cycle_incidents`)).rows[0].version;
  await asUser(c.db, c.wk, `select update_incident($1,$2,'{"severity":"low","description":"Đã bớt héo"}'::jsonb)`, [INC, v]);
  assert.match(await expectError(asUser(c.db, c.wk, `select update_incident($1,$2,'{"severity":"high"}'::jsonb)`, [INC, v])), /CONFLICT/);
  const s = (await asUser(c.db, c.owner, `select get_cycles_stats($1) r`, [c.org])).rows[0].r.cycles[0];
  assert.equal(s.open_incidents, 1);
  assert.equal(s.overdue_actions, 1);
  const w = (await asUser(c.db, c.owner, `select get_weekly_report($1) r`, [c.org])).rows[0].r.attention;
  assert.equal(w.open_incidents, 1);
  assert.equal(w.overdue_actions, 1);
  assert.match(await expectError(asUser(c.db, c.mgr, `select void_incident($1,'')`, [INC])), /REASON_REQUIRED/);
  await asUser(c.db, c.mgr, `select void_incident($1,'Báo nhầm vụ')`, [INC]);
  const s2 = (await asUser(c.db, c.owner, `select get_cycles_stats($1) r`, [c.org])).rows[0].r.cycles[0];
  assert.equal(s2.open_incidents, 0);
  assert.equal(s2.overdue_actions, 0);
});
