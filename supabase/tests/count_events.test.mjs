import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { countSummary } from '../../apps/app/src/lib/countLogic.ts';

// Migration 0085 (D100, P2 gọn): biến động số lượng của vụ. Ghi mới của nhân viên đi theo hàng đợi offline (ON CONFLICT DO NOTHING).

const AREA = '20000000-0000-4000-8000-0000000000f1';
const CYC = '30000000-0000-4000-8000-0000000000f1';
const eid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,plant_count,planted_area_m2) values ($1,$2,$3,(select id from crop_types limit 1),'active',500,400)`, [CYC, org, AREA]);
  // như hàng đợi offline: ON CONFLICT DO NOTHING
  const add = (u, n, kind, qty, date = 'current_date') => asUser(db, u,
    `insert into cycle_count_events (id,cycle_id,organization_id,event_date,kind,quantity,created_by,source)
     values ($1,$2,(select owner_org_id from production_cycles where id=$2),${date},$3,$4,$5,'offline') on conflict (id) do nothing`, [eid(n), CYC, kind, qty, u]);
  return { db, owner, wk, other, org, add };
}

test('nhân viên ghi chết/loại/nhập/xuất bằng hàng đợi offline được; gửi lặp không nhân đôi; người ngoài không ghi và không thấy', async () => {
  const { db, wk, other, add } = await setup();
  await add(wk, 1, 'dead', 3);
  await add(wk, 1, 'dead', 3); // gửi lặp
  await add(wk, 2, 'culled', 2);
  assert.equal((await db.query(`select count(*)::int n from cycle_count_events`)).rows[0].n, 2);
  assert.equal((await asUser(db, wk, `select count(*)::int n from cycle_count_events`)).rows[0].n, 2); // người ghi đọc lại được
  assert.match(await expectError(add(other, 3, 'dead', 1)), /row-level|violates/i);
  assert.equal((await asUser(db, other, `select count(*)::int n from cycle_count_events`)).rows[0].n, 0);
  assert.match(await expectError(add(wk, 4, 'chet', 1)), /check/i);
  assert.match(await expectError(add(wk, 5, 'dead', 0)), /check/i);
  assert.match(await expectError(add(wk, 6, 'dead', 1, `current_date + 5`)), /INVALID_DATE/);
});

test('hủy: người quản lý hoặc người ghi trong 24 giờ; cần lý do; người khác không hủy được', async () => {
  const { db, owner, wk, other, add } = await setup();
  await add(wk, 1, 'dead', 3);
  assert.match(await expectError(asUser(db, other, `select void_count_event($1,'nhầm')`, [eid(1)])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, wk, `select void_count_event($1,'x')`, [eid(1)])), /INVALID_REASON/);
  await asUser(db, wk, `select void_count_event($1,'Ghi nhầm số lượng')`, [eid(1)]);
  assert.equal((await db.query(`select void_reason from cycle_count_events where id=$1`, [eid(1)])).rows[0].void_reason, 'Ghi nhầm số lượng');
  await add(owner, 2, 'out', 10);
  await db.query(`update cycle_count_events set created_at = now() - interval '2 days' where id=$1`, [eid(1)]);
  await add(wk, 3, 'dead', 1);
  await db.query(`update cycle_count_events set created_at = now() - interval '2 days' where id=$1`, [eid(3)]);
  assert.match(await expectError(asUser(db, wk, `select void_count_event($1,'quá hạn 24 giờ')`, [eid(3)])), /FORBIDDEN/);
  await asUser(db, owner, `select void_count_event($1,'Chủ hủy')`, [eid(3)]); // người quản lý hủy được
  assert.match(await expectError(asUser(db, wk, `update cycle_count_events set quantity=99 where id=$1`, [eid(2)])), /permission denied/i);
});

test('số còn lại, tỉ lệ hao, mật độ: tính từ số ban đầu của vụ + sự kiện chưa hủy (+ số con đã xuất ở phiếu thu với vật nuôi)', async () => {
  const { db, owner, wk, add } = await setup();
  await add(wk, 1, 'dead', 3);
  await add(wk, 2, 'culled', 2);
  await add(owner, 3, 'in', 20);
  await add(owner, 4, 'out', 100);
  await add(wk, 5, 'dead', 50);
  await asUser(db, owner, `select void_count_event($1,'ghi nhầm')`, [eid(5)]);
  const ev = (await db.query(`select kind, quantity, voided_at from cycle_count_events`)).rows;
  const cyc = { plant_count: 500, planted_area_m2: 400 };
  const s = countSummary(cyc, ev, 0);
  assert.deepEqual([s.initial, s.added, s.dead, s.culled, s.out, s.remaining], [500, 20, 3, 2, 100, 415]);
  assert.equal(s.lossPct, 0.96);        // (3+2)/(500+20)
  assert.equal(s.m2PerUnit, 0.96);      // 400 m² / 415
  assert.equal(countSummary(cyc, ev, 40).remaining, 375); // 40 con đã xuất ở phiếu thu hoạch của vật nuôi
  assert.equal(countSummary({ plant_count: null, planted_area_m2: null }, [], 0).remaining, null); // chưa có số liệu thì không bịa
});

// Mục 14 (lát 1): cảnh báo hao hụt cộng dồn và 7 ngày, ngưỡng lấy từ bảng ngưỡng của cơ sở. Phần thuần.
import { lossStatus, lossThresholds, lossMessages } from '../../apps/app/src/lib/countLogic.ts';

test('cảnh báo hao hụt: mặc định cộng dồn 10%, 7 ngày tắt; ngưỡng cơ sở đổi được; chỉ tính sự kiện chưa hủy trong 7 ngày', () => {
  const cyc = { plant_count: 1000 };
  const ev = (kind, quantity, event_date, extra = {}) => ({ kind, quantity, event_date, ...extra });
  const today = '2026-11-14';
  const th0 = lossThresholds([]);
  assert.deepEqual(th0, { cumPct: 10, weekPct: null });
  // 80 con chết cách đây 30 ngày, 30 con chết trong 3 ngày gần đây → cộng dồn 11% (≥ 10%), 7 ngày: 30 / 920 ≈ 3,26% (đầu cửa sổ 890 + 30 con)
  const events = [ev('dead', 80, '2026-10-15'), ev('dead', 30, '2026-11-12'), ev('dead', 500, '2026-11-13', { voided_at: '2026-11-13T10:00:00Z' })];
  const a = lossStatus(cyc, events, 0, th0, today);
  assert.deepEqual([a.cumPct, a.weekLoss, a.weekPct, a.cumAlert, a.weekAlert], [11, 30, 3.26, true, false]);
  assert.deepEqual(lossMessages(a, th0, 'con'), ['Hao hụt cộng dồn 11%, đã tới ngưỡng 10%.']);
  // cơ sở đặt ngưỡng 7 ngày 2% và cộng dồn 15%
  const th1 = lossThresholds([{ metric: 'loss_cum_pct', max_value: 15, is_active: true }, { metric: 'loss_week_pct', max_value: 2, is_active: true }]);
  const b = lossStatus(cyc, events, 0, th1, today);
  assert.deepEqual([b.cumAlert, b.weekAlert], [false, true]);
  assert.match(lossMessages(b, th1, 'con')[0], /7 ngày gần đây hao 3,26% \(30 con\), vượt ngưỡng 2%/);
  // ngưỡng 7 ngày bị tắt (is_active false) hoặc không có giá trị: không báo; ngày ngoài cửa sổ 7 ngày không tính
  assert.equal(lossThresholds([{ metric: 'loss_week_pct', max_value: 2, is_active: false }]).weekPct, null);
  const old = lossStatus(cyc, [ev('dead', 50, '2026-11-07')], 0, th1, today);   // đúng 7 ngày trước: ngoài cửa sổ (6 ngày + hôm nay)
  assert.equal(old.weekLoss, 0);
  // chưa có biến động hoặc chưa có số ban đầu: không cảnh báo, không bịa số
  const none = lossStatus({ plant_count: null }, [], 0, th1, today);
  assert.deepEqual([none.cumPct, none.cumAlert, none.weekAlert, none.remaining], [null, false, false, null]);
  // nhập thêm trong cửa sổ không làm sai mẫu số: còn 900 + chết 20 − nhập 100 → đầu cửa sổ 820 con (20/820 = 2,44%)
  const c = lossStatus({ plant_count: 1000 }, [ev('dead', 180, '2026-10-01'), ev('in', 100, '2026-11-12'), ev('dead', 20, '2026-11-13')], 0, th1, today);
  assert.equal(c.remaining, 900);
  assert.equal(c.weekPct, 2.44);
});
