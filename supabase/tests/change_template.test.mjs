import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0181: đổi quy trình mẫu của vụ khi chưa bắt đầu.
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const cid = (n) => `8a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`update subscriptions set max_cycles = 20 where organization_id = $1`, [org]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,area_size) values (gen_random_uuid(),$1,'Ô 1',1000) returning id`, [org])).rows[0].id;
  const mkTpl = async (name, durations, crop = melon) => {
    const t = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${crop},$2) returning id`, [org, name])).rows[0].id;
    for (const d of durations) await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},$2)`, [t, d]);
    return t;
  };
  const t1 = await mkTpl('Mẫu A', [10, 10]), t2 = await mkTpl('Mẫu B', [5, 5, 5]);
  const tOther = await mkTpl('Mẫu rau', [3], `(select id from crop_types where organization_id is null and code <> 'melon' limit 1)`);
  const mk = (id, tpl, start = '2026-11-01') => asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,$5::date,'active'::cycle_status,'Vụ thử')`, [id, org, area, tpl, start]);
  return { db, owner, wk, other, org, area, t1, t2, tOther, mk };
}
const stages = async (c, cyc) => (await c.db.query(`select seq, status, planned_start::text ps, planned_end::text pe, duration_days d from production_stages where cycle_id=$1 order by seq`, [cyc])).rows;

test('đổi quy trình khi chưa bắt đầu: tạo lại việc theo ngày bắt đầu, giống hệt khi tạo thẳng bằng quy trình mới', async () => {
  const c = await setup();
  await c.mk(cid(1), c.t1);
  await c.mk(cid(2), c.t2);                                   // vụ đối chứng tạo thẳng bằng quy trình B
  await asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(1), c.t2]);
  assert.deepEqual(await stages(c, cid(1)), await stages(c, cid(2)));
  const r = (await c.db.query(`select template_name, expected_end_date::text e from production_cycles where id=$1`, [cid(1)])).rows[0];
  assert.deepEqual([r.template_name, r.e], ['Mẫu B', '2026-11-15']);
  assert.equal((await c.db.query(`select count(*)::int n from audit_events where action='change_template'`)).rows[0].n, 1);
});

test('đổi quy trình bị chặn: đã bắt đầu việc, đã có nhật ký, sản phẩm khác, cùng quy trình, người không có quyền', async () => {
  const c = await setup();
  await c.mk(cid(1), c.t1);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(1), c.t1])), /SAME_TEMPLATE/);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(1), c.tOther])), /INVALID_TEMPLATE/);
  assert.match(await expectError(asUser(c.db, c.wk, `select change_cycle_template($1,$2)`, [cid(1), c.t2])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.other, `select change_cycle_template($1,$2)`, [cid(1), c.t2])), /FORBIDDEN/);
  await c.db.query(`update production_stages set status='in_progress', actual_start='2026-11-01' where cycle_id=$1 and seq=(select min(seq) from production_stages where cycle_id=$1)`, [cid(1)]);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(1), c.t2])), /STAGE_STARTED/);
  await c.mk(cid(2), c.t1);
  await c.db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity) values (gen_random_uuid(),$1,$2,'2026-11-05 07:00+07',10)`, [c.org, cid(2)]);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(2), c.t2])), /HAS_RECORDS/);
  await c.mk(cid(3), c.t1);
  await c.db.query(`update production_cycles set status='ended' where id=$1`, [cid(3)]);
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(3), c.t2])), /INVALID_STATE/);
});
