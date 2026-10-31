import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser } from './harness.mjs';

// Bộ dữ liệu mẫu HTX (supabase/maintenance/seed_sample_htx.sql): nạp đủ, đúng quy mô, nhất quán; chạy lại không nhân đôi; xóa sạch.
const raw = readFileSync(new URL('../maintenance/seed_sample_htx.sql', import.meta.url), 'utf8');
const prep = (mode = 'THEM') => raw.replace("'trungthanhfx23@gmail.com'", "'u1@test.local'").replace("v_mode     constant text := 'THEM'", `v_mode     constant text := '${mode}'`);
const one = async (db, sql) => (await db.query(sql)).rows[0];

test('nạp mẫu HTX: đủ quy mô, nhất quán, chạy lại không nhân đôi, xóa sạch', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const org = (await asUser(db, u, `select create_organization('cooperative','HTX Thử') id`)).rows[0].id;
  const before = await one(db, `select (select count(*)::int from production_areas where organization_id='${org}') a, (select count(*)::int from partners where organization_id='${org}') p`);
  await db.exec(prep());
  const c = await one(db, `select
    (select count(*)::int from production_areas where organization_id='${org}' and parent_id is null) areas,
    (select count(*)::int from production_areas where organization_id='${org}' and parent_id is not null) cells,
    (select count(*)::int from inventory_locations where organization_id='${org}') locs,
    (select count(*)::int from worker_teams where organization_id='${org}') teams,
    (select count(*)::int from worker_profiles where organization_id='${org}') workers,
    (select count(*)::int from worker_team_memberships m join worker_teams t on t.id=m.team_id where t.organization_id='${org}') members,
    (select count(*)::int from cycle_templates where organization_id='${org}') tpls,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and status='ended') ended,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and status='active') active,
    (select count(*)::int from production_cycles where owner_org_id='${org}' and status='preparing') prep,
    (select count(*)::int from partners where organization_id='${org}' and is_supplier) sup,
    (select count(*)::int from partners where organization_id='${org}' and is_customer) cus,
    (select count(*)::int from activity_logs where organization_id='${org}') logs,
    (select count(*)::int from harvest_records where organization_id='${org}') harvests,
    (select count(*)::int from sales_records where organization_id='${org}') sales,
    (select count(*)::int from expense_records where organization_id='${org}') expenses,
    (select count(*)::int from attendance_records where organization_id='${org}') att`);
  assert.deepEqual([c.areas, c.cells, c.locs, c.teams, c.workers, c.members, c.tpls], [5, 20, 10, 5, 50, 50, 10]);
  assert.deepEqual([c.ended, c.active, c.prep, c.sup, c.cus], [20, 20, 20, 5, 6]);
  assert.ok(c.logs > 1000 && c.harvests > 100 && c.sales === c.harvests && c.expenses > 100 && c.att > 1000, JSON.stringify(c));

  // mỗi phân khu 12 vụ: 4/4/4; vụ chưa bắt đầu ở tương lai, vụ đã kết thúc ở quá khứ
  const per = (await db.query(`select a.name, count(*)::int n, count(*) filter (where c.status='ended' and c.end_date < current_date)::int e, count(*) filter (where c.status='active' and c.start_date <= current_date and c.expected_end_date >= current_date)::int a, count(*) filter (where c.status='preparing' and c.start_date > current_date)::int p
    from production_cycles c join production_areas ch on ch.id=c.area_id join production_areas a on a.id=ch.parent_id where c.owner_org_id='${org}' group by a.name`)).rows;
  assert.equal(per.length, 5);
  for (const r of per) assert.deepEqual([r.n, r.e, r.a, r.p], [12, 4, 4, 4], r.name);
  // quy trình riêng ít việc hơn nhưng cùng tổng thời gian
  const t = (await db.query(`select t.name, count(*)::int n, max(coalesce(s.start_day, 0) + s.duration_days) mx from cycle_templates t join template_stages s on s.template_id=t.id where t.organization_id='${org}' group by t.name`)).rows;
  assert.ok(t.some((x) => x.n === 17) && t.some((x) => x.n === 10));
  // tồn kho không âm; công nợ có đủ các trạng thái
  assert.equal((await one(db, `select count(*)::int n from (select location_id, material_id, sum(quantity_delta) q from inventory_transactions where organization_id='${org}' group by 1,2) x where q < 0`)).n, 0);
  const pay = await one(db, `select jsonb_agg(distinct x->>'status') s from jsonb_array_elements(get_payables('${org}', false)) x`);
  const rec = await one(db, `select jsonb_agg(distinct x->>'status') s from jsonb_array_elements(get_receivables('${org}', false)) x`);
  for (const s of ['paid', 'overdue']) { assert.ok(pay.s.includes(s), 'payables ' + pay.s); assert.ok(rec.s.includes(s), 'receivables ' + rec.s); }
  // việc đã xong có nhật ký; vụ chuẩn bị chưa có nhật ký; không có việc làm trong tương lai
  assert.equal((await one(db, `select count(*)::int n from activity_logs l join production_cycles c on c.id=l.cycle_id where c.owner_org_id='${org}' and (c.status='preparing' or l.performed_at > now())`)).n, 0);
  assert.equal((await one(db, `select count(*)::int n from production_stages s join production_cycles c on c.id=s.cycle_id where c.owner_org_id='${org}' and s.status='done' and s.repeat_every_days is null and not exists (select 1 from activity_logs l where l.stage_id=s.id)`)).n, 0);

  // chạy lại: bỏ qua; xóa: sạch, dữ liệu có sẵn còn nguyên
  await db.exec(prep());
  assert.equal((await one(db, `select count(*)::int n from production_cycles where owner_org_id='${org}'`)).n, 60);
  await db.exec(prep('XOA'));
  const after = await one(db, `select (select count(*)::int from production_areas where organization_id='${org}') a, (select count(*)::int from partners where organization_id='${org}') p,
    (select count(*)::int from production_cycles where owner_org_id='${org}') cy, (select count(*)::int from worker_profiles where organization_id='${org}') w,
    (select count(*)::int from inventory_transactions where organization_id='${org}') t, (select count(*)::int from expense_records where organization_id='${org}') e`);
  assert.deepEqual([after.a, after.p, after.cy, after.w, after.t, after.e], [before.a, before.p, 0, 0, 0, 0]);
});

test('mẫu HTX: đơn giá giờ 30.000 / tổ trưởng 35.000, mỗi người đúng một tổ; script bổ sung sửa được dữ liệu cũ', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const org = (await asUser(db, u, `select create_organization('cooperative','HTX Thử') id`)).rows[0].id;
  await db.exec(prep());
  const check = async () => {
    const r = await one(db, `select
      (select count(*)::int from work_rates r join worker_teams t on t.leader_worker_id = r.worker_id where r.organization_id='${org}' and r.rate_type='hour' and r.amount=35000) leaders,
      (select count(*)::int from work_rates r join worker_profiles w on w.id=r.worker_id where r.organization_id='${org}' and r.rate_type='hour' and r.amount=30000 and not exists (select 1 from worker_teams t where t.leader_worker_id=w.id)) staff,
      (select count(*)::int from (select m.worker_id from worker_team_memberships m join worker_teams t on t.id=m.team_id where t.organization_id='${org}' group by 1 having count(*) <> 1) x) multi,
      (select count(*)::int from attendance_records ar join worker_team_memberships m on m.worker_id=ar.worker_id join worker_teams t on t.id=m.team_id where ar.organization_id='${org}' and ar.area_id is distinct from t.area_id) wrongarea`);
    assert.deepEqual([r.leaders, r.staff, r.multi, r.wrongarea], [5, 45, 0, 0]);
  };
  await check();
  // làm lệch như bản nạp cũ (không có đơn giá, sai phân khu, một người mất tổ) rồi chạy script bổ sung
  await db.exec(`delete from work_rates where organization_id='${org}'; update attendance_records set area_id = null where organization_id='${org}';
    delete from worker_team_memberships where worker_id in (select id from worker_profiles where organization_id='${org}' and phone = '0911900015');`);
  const fix = readFileSync(new URL('../maintenance/seed_sample_htx_bosung_luong.sql', import.meta.url), 'utf8').replace("'trungthanhfx23@gmail.com'", "'u1@test.local'");
  await db.exec(fix);
  await check();
  await db.exec(fix); // chạy lại an toàn
  await check();
  await db.exec(prep('XOA'));
  assert.equal((await one(db, `select count(*)::int n from work_rates where organization_id='${org}'`)).n, 0);
});

test('script bổ sung ghi việc: thêm đúng phần thiếu, không nhân đôi, chạy lại an toàn', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const org = (await asUser(db, u, `select create_organization('cooperative','HTX Thử') id`)).rows[0].id;
  await db.exec(prep());
  const count = async () => (await one(db, `select count(*)::int n from activity_logs where organization_id='${org}'`)).n;
  const full = await count();
  // mô phỏng dữ liệu thiếu: xóa nhật ký của các vụ, làm lệch trạng thái việc
  await db.exec(`alter table inventory_transactions disable trigger inventory_txn_guard_mod;
    delete from inventory_transactions where organization_id='${org}' and activity_log_id is not null;
    alter table inventory_transactions enable trigger inventory_txn_guard_mod;
    delete from activity_logs where organization_id='${org}';
    update production_stages set status='pending', actual_start=null, actual_end=null where organization_id='${org}';`);
  assert.equal(await count(), 0);
  const fix = readFileSync(new URL('../maintenance/seed_sample_htx_bosung_ghi_viec.sql', import.meta.url), 'utf8').replace("'trungthanhfx23@gmail.com'", "'u1@test.local'");
  await db.exec(fix);
  assert.equal(await count(), full);   // đúng số nhật ký như bản nạp gốc
  const bad = await one(db, `select count(*)::int n from production_stages s join production_cycles c on c.id=s.cycle_id where c.owner_org_id='${org}' and c.status='ended' and s.status <> 'done'`);
  assert.equal(bad.n, 0);
  const nolog = await one(db, `select count(*)::int n from production_stages s join production_cycles c on c.id=s.cycle_id where c.owner_org_id='${org}' and c.status in ('ended','active') and s.status='done' and not exists (select 1 from activity_logs l where l.stage_id=s.id)`);
  assert.equal(nolog.n, 0);
  await db.exec(fix);
  assert.equal(await count(), full);   // chạy lại không nhân đôi
});
