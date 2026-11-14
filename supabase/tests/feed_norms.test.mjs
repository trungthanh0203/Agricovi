import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { checkFeed, normForAge, parseNormRows } from '../../apps/app/src/lib/feedNormLogic.ts';

// Migration 0204 (D167, mục 14 lát 4): định mức thức ăn theo ngày tuổi, tùy chọn, có phiên bản.

const AREA = '20000000-0000-4000-8000-0000000000c9';
const C1 = '30000000-0000-4000-8000-0000000000c1';
const C2 = '30000000-0000-4000-8000-0000000000c2';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;
const NORMS = JSON.stringify([{ from_day: 0, kg: 0.5 }, { from_day: 30, kg: 1.5 }]);

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
  for (const c of [C1, C2]) await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,null)`, [c, org, AREA, tpl]);
  return { db, owner, wk, other };
}

test('đặt bảng định mức: có phiên bản, lệch phiên bản báo CONFLICT; nhân viên không ghi, người ngoài không đọc', async () => {
  const { db, owner, wk, other } = await setup();
  const p1 = (await asUser(db, owner, `select * from set_cycle_feed_plan($1,0,'week',20,$2::jsonb,0)`, [C1, NORMS])).rows[0];
  assert.equal(p1.version, 1);
  assert.deepEqual(p1.norms, [{ from_day: 0, kg: 0.5 }, { from_day: 30, kg: 1.5 }]);
  assert.match(await expectError(asUser(db, owner, `select * from set_cycle_feed_plan($1,0,'all',25,$2::jsonb,0)`, [C1, NORMS])), /CONFLICT/);
  const p2 = (await asUser(db, owner, `select * from set_cycle_feed_plan($1,3,'all',25,$2::jsonb,1)`, [C1, NORMS])).rows[0];
  assert.equal(p2.version, 2); assert.equal(p2.window_kind, 'all'); assert.equal(p2.age_at_start, 3);
  assert.match(await expectError(asUser(db, wk, `select * from set_cycle_feed_plan($1,0,'week',20,$2::jsonb,2)`, [C1, NORMS])), /FORBIDDEN/);
  assert.equal((await asUser(db, other, `select count(*)::int n from cycle_feed_plans`)).rows[0].n, 0);
  assert.equal((await asUser(db, wk, `select count(*)::int n from cycle_feed_plans`)).rows[0].n, 1);
});

test('bảng sai bị chặn: trùng ngày tuổi, kg ≤ 0, quá 50, ngưỡng ngoài 5–100, kỳ lạ', async () => {
  const { db, owner } = await setup();
  const bad = async (norms, win = 'week', tol = 20) => expectError(asUser(db, owner, `select * from set_cycle_feed_plan($1,0,$2,$3,$4::jsonb,0)`, [C1, win, tol, JSON.stringify(norms)]));
  assert.match(await bad([{ from_day: 5, kg: 1 }, { from_day: 5, kg: 2 }]), /cùng ngày tuổi/);
  assert.match(await bad([{ from_day: 0, kg: 0 }]), /INVALID_NORMS/);
  assert.match(await bad([{ from_day: 0, kg: 51 }]), /INVALID_NORMS/);
  assert.match(await bad([]), /INVALID_NORMS/);
  assert.match(await bad([{ from_day: 0, kg: 1 }], 'week', 3), /INVALID_ARGUMENT/);
  assert.match(await bad([{ from_day: 0, kg: 1 }], 'month'), /INVALID_ARGUMENT/);
});

test('chép từ lứa khác cùng cơ sở tăng phiên bản; lứa nguồn chưa có bảng báo NOT_FOUND; xóa được', async () => {
  const { db, owner, other } = await setup();
  assert.match(await expectError(asUser(db, owner, `select * from copy_cycle_feed_plan($1,$2)`, [C1, C2])), /NOT_FOUND/);
  await asUser(db, owner, `select * from set_cycle_feed_plan($1,2,'week',15,$2::jsonb,0)`, [C1, NORMS]);
  const c = (await asUser(db, owner, `select * from copy_cycle_feed_plan($1,$2)`, [C1, C2])).rows[0];
  assert.equal(c.version, 1); assert.equal(c.age_at_start, 2); assert.equal(Number(c.tolerance_pct), 15);
  assert.equal((await asUser(db, owner, `select * from copy_cycle_feed_plan($1,$2)`, [C1, C2])).rows[0].version, 2);
  assert.match(await expectError(asUser(db, other, `select * from copy_cycle_feed_plan($1,$2)`, [C1, C2])), /FORBIDDEN/);
  await asUser(db, owner, `select delete_cycle_feed_plan($1)`, [C2]);
  assert.equal((await db.query(`select count(*)::int n from cycle_feed_plans where cycle_id=$1`, [C2])).rows[0].n, 0);
});

// ---- logic thuần
const plan = { age_at_start: 0, window_kind: 'week', tolerance_pct: 20, norms: [{ from_day: 0, kg: 0.5 }, { from_day: 30, kg: 1.5 }] };
const cyc = { start_date: '2026-11-01', plant_count: 100 };

test('định mức theo ngày tuổi: dùng dòng gần nhất không vượt quá; nhập dòng bằng chuỗi được kiểm', () => {
  assert.equal(normForAge(plan.norms, 0), 0.5);
  assert.equal(normForAge(plan.norms, 29), 0.5);
  assert.equal(normForAge(plan.norms, 30), 1.5);
  assert.equal(normForAge([{ from_day: 10, kg: 1 }], 5), null);
  assert.equal(parseNormRows([{ from_day: '0', kg: '0,5' }, { from_day: '', kg: '' }]).norms[0].kg, 0.5);
  assert.equal(parseNormRows([{ from_day: '5', kg: '1' }, { from_day: '5', kg: '2' }]).ok, false);
  assert.equal(parseNormRows([]).ok, false);
});

test('so sánh 7 ngày: đúng, dùng nhiều, dùng ít; thiếu số liệu thì không kết luận; hao hụt giảm số con', () => {
  const today = '2026-11-07'; // ngày tuổi 0..6: 100 con x 0,5 kg x 7 ngày = 350 kg
  const feed = (kg) => [{ date: '2026-11-03', kg }];
  assert.equal(checkFeed(plan, cyc, [], [], feed(350), today).state, 'ok');
  const hi = checkFeed(plan, cyc, [], [], feed(450), today);
  assert.equal(hi.state, 'high'); assert.equal(hi.expectedKg, 350); assert.equal(hi.diffPct, 28.6);
  assert.equal(checkFeed(plan, cyc, [], [], feed(250), today).state, 'low');
  assert.equal(checkFeed(plan, cyc, [], [], [], today).state, 'no_feed');
  assert.equal(checkFeed(plan, cyc, [], [], [{ date: '2026-10-01', kg: 999 }], today).state, 'no_feed');
  assert.equal(checkFeed(null, cyc, [], [], feed(1), today).state, 'no_plan');
  assert.equal(checkFeed(plan, { start_date: '2026-11-01' }, [], [], feed(1), today).state, 'no_heads');
  assert.equal(checkFeed({ ...plan, norms: [{ from_day: 50, kg: 1 }] }, cyc, [], [], feed(1), today).state, 'no_norm');
  // 20 con chết từ 04/11: 3 ngày đầu 100 con, 4 ngày sau 80 con => 150 + 160 = 310
  const ev = [{ kind: 'dead', quantity: 20, event_date: '2026-11-04' }];
  assert.equal(checkFeed(plan, cyc, ev, [], feed(310), today).expectedKg, 310);
  assert.equal(checkFeed(plan, cyc, ev, [], feed(310), today).todayKg, 40);
});

test('tuổi lúc nhập đổi định mức; kỳ "cả lứa" tính từ ngày bắt đầu', () => {
  const p = { ...plan, age_at_start: 30 };   // nhập con 30 ngày tuổi: ngay ngày đầu đã áp dòng 1,5 kg
  assert.equal(checkFeed(p, cyc, [], [], [{ date: '2026-11-02', kg: 1050 }], '2026-11-07').expectedKg, 1050);
  const all = checkFeed({ ...plan, window_kind: 'all' }, cyc, [], [], [{ date: '2026-11-02', kg: 1 }], '2026-11-20');
  assert.equal(all.from, '2026-11-01'); assert.equal(all.periodDays, 20);
});
