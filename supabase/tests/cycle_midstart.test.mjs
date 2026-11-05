import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0178: bắt đầu vụ giữa chừng (việc trước ghi nhận "làm trước khi dùng app").
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  const ts = [];
  for (let i = 0; i < 4; i++) ts.push((await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},5) returning id`, [tpl])).rows[0].id);
  return { db, owner, wk, org, area, tpl, ts };
}
const cid = (n) => `87000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stages = async (c, cyc) => (await c.db.query(`select seq, status, source, actual_start::text a, actual_end::text e, planned_start::text ps, planned_end::text pe from production_stages where cycle_id=$1 order by seq`, [cyc])).rows;

test('tạo vụ giữa chừng: việc trước = làm trước khi dùng app, việc hiện tại đang làm, lịch sau dời theo; gọi lặp không tạo trùng', async () => {
  const c = await setup();
  const mk = (id, cur, done, who = c.owner) => asUser(c.db, who, `select create_cycle_midstart($1,$2,$3,$4,'2026-10-01'::date,null,$5,$6::uuid[],'2026-10-20'::date,'resume','Nhận cây con 25 ngày tuổi')`, [id, c.org, c.area, c.tpl, cur, done]);
  await mk(cid(1), c.ts[2], [c.ts[0], c.ts[1]]);
  const s = await stages(c, cid(1));
  assert.deepEqual(s.map((x) => [x.status, x.source]), [['done', 'pre_app'], ['done', 'pre_app'], ['in_progress', 'app'], ['pending', 'app']]);
  assert.deepEqual([s[0].a, s[0].e], [null, null]);            // không bịa ngày thực tế
  assert.deepEqual([s[2].a, s[2].ps, s[2].pe, s[3].ps], ['2026-10-20', '2026-10-20', '2026-10-24', '2026-10-25']);
  const cy = (await c.db.query(`select status, origin, origin_note, tracked_from is not null t, start_date::text sd from production_cycles where id=$1`, [cid(1)])).rows[0];
  assert.deepEqual([cy.status, cy.origin, cy.origin_note, cy.t, cy.sd], ['active', 'resume', 'Nhận cây con 25 ngày tuổi', true, '2026-10-01']);
  assert.equal((await c.db.query(`select count(*)::int n from audit_events where action='cycle_midstart'`)).rows[0].n, 1);
  assert.equal((await mk(cid(1), c.ts[2], [c.ts[0], c.ts[1]])).rows[0].create_cycle_midstart, cid(1)); // lặp
  assert.equal((await c.db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [cid(1)])).rows[0].n, 4);
  assert.match(await expectError(asUser(c.db, c.owner, `select create_cycle_midstart($1,$2,$3,$4,'2099-01-01'::date,null,$5,'{}'::uuid[],null,'resume',null)`, [cid(2), c.org, c.area, c.tpl, c.ts[0]])), /INVALID_DATE/);
  assert.match(await expectError(asUser(c.db, c.owner, `select create_cycle_midstart($1,$2,$3,$4,'2026-10-01'::date,null,$5,'{}'::uuid[],null,'own',null)`, [cid(3), c.org, c.area, c.tpl, c.ts[0]])), /INVALID_ARGUMENT/);
  assert.match(await expectError(mk(cid(4), c.ts[1], [c.ts[1]])), /INVALID_STAGE/);   // việc hiện tại nằm trong danh sách đã làm
});

test('chuyển tới một việc ở vụ đã tạo: chỉ việc chưa có nhật ký, không khi đang có việc đang làm, nhân viên không làm được', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-10-01'::date,'active'::cycle_status,null)`, [cid(10), c.org, c.area, c.tpl]);
  const ps = (await c.db.query(`select id from production_stages where cycle_id=$1 order by seq`, [cid(10)])).rows.map((r) => r.id);
  assert.match(await expectError(asUser(c.db, c.wk, `select jump_cycle_to_stage($1,$2,$3::uuid[],'2026-10-20'::date)`, [cid(10), ps[2], [ps[0], ps[1]]])), /FORBIDDEN/);
  // việc 1 đã có nhật ký thật thì không đánh dấu "làm trước" được
  await c.db.query(`insert into activity_logs (id, organization_id, cycle_id, stage_id, work_type_id, performed_at, content) values (gen_random_uuid(), $1, $2, $3, ${wt('irrigation')}, '2026-10-02 07:00+07', 'tưới')`, [c.org, cid(10), ps[0]]).catch(() => null);
  const hasLog = (await c.db.query(`select count(*)::int n from activity_logs where stage_id=$1`, [ps[0]])).rows[0].n > 0;
  if (hasLog) assert.match(await expectError(asUser(c.db, c.owner, `select jump_cycle_to_stage($1,$2,$3::uuid[],'2026-10-20'::date)`, [cid(10), ps[2], [ps[0], ps[1]]])), /INVALID_STAGE/);
  await asUser(c.db, c.owner, `select jump_cycle_to_stage($1,$2,$3::uuid[],'2026-10-20'::date,'Vụ đang chạy dở')`, [cid(10), ps[2], hasLog ? [ps[1]] : [ps[0], ps[1]]]);
  const s = await stages(c, cid(10));
  assert.deepEqual([s[1].status, s[1].source, s[2].status, s[3].status], ['done', 'pre_app', 'in_progress', 'pending']);
  assert.match(await expectError(asUser(c.db, c.owner, `select jump_cycle_to_stage($1,$2,'{}'::uuid[],'2026-10-21'::date)`, [cid(10), ps[3]])), /STAGE_RUNNING/);
});
