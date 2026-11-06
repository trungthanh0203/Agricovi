import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0182: vườn cây (kỳ, khấu hao), đàn liên tục (nhóm, biến động), tổng kết theo kỳ.
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const cid = (n) => `8b000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`update subscriptions set max_cycles = 20 where organization_id = $1`, [org]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,area_size) values (gen_random_uuid(),$1,'Vườn 1',5000) returning id`, [org])).rows[0].id;
  const mkTpl = async (name, durations) => {
    const t = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},$2) returning id`, [org, name])).rows[0].id;
    for (const d of durations) await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},$2)`, [t, d]);
    return t;
  };
  const t1 = await mkTpl('Mùa A', [30, 30]), t2 = await mkTpl('Mùa B', [20]);
  return { db, owner, wk, org, area, t1, t2 };
}
const mk = (c, id, o = {}) => asUser(c.db, c.owner, `select create_cycle_checked($1,$2,$3,$4,$5::date,'active'::cycle_status,$6,'Na Thái',$7,$8,false,false,null,null,null,null,null,$9,$10::date,$11::jsonb,$12,$13,$14)`,
  [id, c.org, c.area, c.t1, o.start ?? '2026-01-01', o.name ?? 'Vườn na', o.area ?? 2000, o.count ?? 200, o.mode ?? 'perennial', o.planting ?? null, o.groups ? JSON.stringify(o.groups) : null, o.label ?? null, o.maturity ?? null, o.amort ?? null]);

test('vườn cây: bắt buộc ngày trồng, tạo kỳ đầu, mở/đóng kỳ nối nhau', async () => {
  const c = await setup();
  assert.match(await expectError(mk(c, cid(1), { planting: null })), /INVALID_DATE/);
  assert.match(await expectError(mk(c, cid(1), { mode: 'xyz' })), /INVALID_MODE/);
  await mk(c, cid(1), { planting: '2024-01-01', label: 'Mùa 2026', maturity: 2, amort: 10 });
  const cy = (await c.db.query(`select cycle_mode m, planting_date::text p, maturity_years::float my, amort_years ay from production_cycles where id=$1`, [cid(1)])).rows[0];
  assert.deepEqual([cy.m, cy.p, cy.my, cy.ay], ['perennial', '2024-01-01', 2, 10]);
  const per = (await c.db.query(`select id, label, status, start_date::text s, end_date::text e from cycle_periods where cycle_id=$1`, [cid(1)])).rows;
  assert.deepEqual([per.length, per[0].label, per[0].status, per[0].s, per[0].e], [1, 'Mùa 2026', 'open', '2026-01-01', '2026-03-01']);
  assert.equal((await c.db.query(`select count(*)::int n from production_stages where cycle_id=$1 and period_id=$2`, [cid(1), per[0].id])).rows[0].n, 2);
  assert.match(await expectError(asUser(c.db, c.owner, `select open_cycle_period($1,'Mùa 2027','2026-06-01'::date,$2)`, [cid(1), c.t2])), /PERIOD_OPEN/);
  await c.db.query(`update production_stages set status='in_progress', actual_start='2026-01-01' where cycle_id=$1 and seq=(select min(seq) from production_stages where cycle_id=$1)`, [cid(1)]);
  assert.match(await expectError(asUser(c.db, c.owner, `select close_cycle_period($1,'2026-02-01'::date)`, [per[0].id])), /STAGE_RUNNING/);
  await c.db.query(`update production_stages set status='done', actual_end='2026-01-30' where cycle_id=$1 and status='in_progress'`, [cid(1)]);
  assert.match(await expectError(asUser(c.db, c.wk, `select close_cycle_period($1,'2026-02-01'::date)`, [per[0].id])), /FORBIDDEN/);
  await asUser(c.db, c.owner, `select close_cycle_period($1,'2026-02-01'::date)`, [per[0].id]);
  assert.equal((await c.db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [cid(1)])).rows[0].n, 1);   // việc chưa làm của kỳ bị bỏ
  assert.match(await expectError(asUser(c.db, c.owner, `select open_cycle_period($1,'Mùa 2027','2026-01-15'::date,$2)`, [cid(1), c.t2])), /INVALID_DATE/);
  const p2 = (await asUser(c.db, c.owner, `select open_cycle_period($1,'Mùa 2027','2026-06-01'::date,$2) id`, [cid(1), c.t2])).rows[0].id;
  const st = (await c.db.query(`select seq, period_id, planned_start::text ps from production_stages where cycle_id=$1 order by seq`, [cid(1)])).rows;
  assert.equal(st.length, 2);
  assert.ok(st[1].seq > st[0].seq && st[1].period_id === p2 && st[1].ps === '2026-06-01');
  assert.match(await expectError(asUser(c.db, c.owner, `select change_cycle_template($1,$2)`, [cid(1), c.t2])), /INVALID_MODE/);
});

test('vườn cây: chi phí đầu tư khấu hao theo năm, tổng kết theo kỳ, tuổi cây', async () => {
  const c = await setup();
  await mk(c, cid(1), { planting: '2023-01-01', maturity: 2, amort: 10 });
  const ins = (cat, kind, amt, d, cap = false) => c.db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date,is_capital) values (gen_random_uuid(),$1,$2,$3::expense_category,$4::expense_kind,$5,$6::date,$7)`, [c.org, cid(1), cat, kind, amt, d, cap]);
  await ins('other', 'cash_paid', 36500000, '2023-03-01', true);            // đầu tư vườn cây
  await ins('labor', 'cash_paid', 5000000, '2026-04-10');
  await c.db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity) values (gen_random_uuid(),$1,$2,'2026-05-05 07:00+07',1000,100)`, [c.org, cid(1)]);
  await c.db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values (gen_random_uuid(),$1,$2,'2026-05-06',900,27000000)`, [c.org, cid(1)]);
  const s = (await asUser(c.db, c.owner, `select get_cycle_period_summary($1,'2026-01-01'::date,'2026-12-31'::date) r`, [cid(1)])).rows[0].r;
  assert.equal(Number(s.cost_expenses), 5000000);                           // chi phí đầu tư không tính vào chi phí năm
  assert.equal(Number(s.capital_total), 36500000);
  // bắt đầu kinh doanh sau 2 năm (2025-01-01); năm 2026 đủ 365 ngày: 36.500.000 / (10×365) × 365 = 3.650.000
  assert.equal(Number(s.depreciation), 3650000);
  assert.equal(Number(s.total_cost), 8650000);
  assert.equal(Number(s.harvest_net), 900);
  assert.equal(Number(s.profit), 27000000 - 8650000);
  assert.equal(s.phase, 'business');
  assert.equal(Number(s.yield_per_plant), 4.5);
  const early = (await asUser(c.db, c.owner, `select get_cycle_period_summary($1,'2023-01-01'::date,'2023-12-31'::date) r`, [cid(1)])).rows[0].r;
  assert.deepEqual([Number(early.depreciation), early.phase], [0, 'construction']);   // năm kiến thiết chưa khấu hao
  const rep = (await asUser(c.db, c.owner, `select get_cycle_periods_report($1) r`, [cid(1)])).rows[0].r;
  assert.equal(rep.length, 1);
  assert.match(await expectError(asUser(c.db, c.wk, `select get_cycle_period_summary($1,null,null)`, [cid(1)])), /FORBIDDEN/);
});

test('đàn: bắt buộc nhóm khớp số lượng; sinh, chuyển nhóm, chết, xuất; biến động đàn theo nhóm', async () => {
  const c = await setup();
  assert.match(await expectError(mk(c, cid(2), { mode: 'herd', count: 20, groups: [{ group: 'Cái sinh sản', count: 10 }] })), /INVALID_GROUPS/);
  assert.match(await expectError(mk(c, cid(2), { mode: 'herd', count: 20 })), /INVALID_GROUPS/);
  await mk(c, cid(2), { mode: 'herd', name: 'Đàn dê', count: 20, start: '2026-01-01', label: 'Quý 1/2026', groups: [{ group: 'Cái sinh sản', count: 12 }, { group: 'Hậu bị', count: 8 }] });
  const ev = (kind, qty, d, g, to = null) => c.db.query(`insert into cycle_count_events (id,cycle_id,organization_id,event_date,kind,quantity,animal_group,to_group) values (gen_random_uuid(),$1,$2,$3::date,$4,$5,$6,$7)`, [cid(2), c.org, d, kind, qty, g, to]);
  await ev('born', 6, '2026-02-10', 'Cái sinh sản');
  await ev('move', 4, '2026-02-20', 'Hậu bị', 'Cái sinh sản');
  await ev('dead', 1, '2026-03-05', 'Cái sinh sản');
  await ev('out', 3, '2026-03-20', 'Hậu bị');
  await assert.rejects(ev('move', 2, '2026-03-21', 'Hậu bị', 'Hậu bị'));
  await assert.rejects(ev('move', 2, '2026-03-21', null, 'Hậu bị'));
  const b = (await asUser(c.db, c.owner, `select get_herd_balance($1,'2026-02-01'::date,'2026-03-31'::date) r`, [cid(2)])).rows[0].r;
  const g = Object.fromEntries(b.map((x) => [x.group, x]));
  assert.deepEqual([g['Cái sinh sản'].opening, g['Cái sinh sản'].born, g['Cái sinh sản'].move_in, g['Cái sinh sản'].dead, g['Cái sinh sản'].closing].map(Number), [12, 6, 4, 1, 21]);
  assert.deepEqual([g['Hậu bị'].opening, g['Hậu bị'].move_out, g['Hậu bị'].out, g['Hậu bị'].closing].map(Number), [8, 4, 3, 1]);
  const s = (await asUser(c.db, c.owner, `select get_cycle_period_summary($1,'2026-01-01'::date,'2026-03-31'::date) r`, [cid(2)])).rows[0].r;
  assert.equal(Number(s.heads_end), 22);                                  // 20 + 6 sinh − 1 chết − 3 xuất
  assert.equal((await c.db.query(`select count(*)::int n from cycle_count_events where cycle_id=$1 and kind='open'`, [cid(2)])).rows[0].n, 2);
});
