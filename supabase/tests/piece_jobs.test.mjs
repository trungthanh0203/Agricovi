import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0197-0198 (mục 11): phiếu khoán nối vào kỳ lương tháng, Bảng lương và chi phí nhân công của vụ.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1), CYC = id('3', 1);
const D = '2026-09-10', M = '2026-09-01';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), ua = await addUser(db, 2), ub = await addUser(db, 3), mgr = await addUser(db, 4), uc = await addUser(db, 5);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['manager']::member_role[]),($1,$5,array['worker']::member_role[])`, [org, ua, ub, mgr, uc]);
  const w = {};
  for (const [k, u, n] of [['a', ua, 'An'], ['b', ub, 'Bình'], ['c', uc, 'Chi']]) {
    w[k] = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,$3) returning id`, [org, u, n])).rows[0].id;
  }
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  const c = { db, owner, ua, ub, uc, mgr, org, w };
  c.create = (u, o = {}) => asUser(db, u, `select create_piece_job($1,$2,$3,$4::date,$5,$6,$7,$8,$9::jsonb,$10) j`,
    [org, o.cycle === undefined ? CYC : o.cycle, o.title ?? 'Hái dưa lô A', o.date ?? D, o.mode ?? 'output', o.unit ?? 'kg', o.price ?? 2000, o.lump ?? null,
      JSON.stringify(o.workers ?? [{ worker_id: w.a, pct: 60 }, { worker_id: w.b, pct: 40 }]), o.note ?? null]);
  c.confirm = (u, jid, q = null) => asUser(db, u, `select confirm_piece_job($1,$2) r`, [jid, q]);
  c.overview = async (u, worker = null) => (await asUser(db, u, `select get_pay_overview($1,$2::date,$3::date,$4) r`, [org, M, '2026-09-30', worker])).rows[0].r.workers;
  return c;
}

test('lập phiếu: chỉ người có quyền Tiền công; kiểm tra phần chia, ngày, người nhận, vụ', async () => {
  const c = await setup();
  assert.match(await expectError(c.create(c.mgr)), /FORBIDDEN/);          // quản lý chưa được cấp mục Tiền công
  assert.match(await expectError(c.create(c.ua)), /FORBIDDEN/);
  assert.match(await expectError(c.create(c.owner, { workers: [{ worker_id: c.w.a, pct: 60 }, { worker_id: c.w.b, pct: 30 }] })), /100%/);
  assert.match(await expectError(c.create(c.owner, { workers: [{ worker_id: c.w.a, pct: 50 }, { worker_id: c.w.a, pct: 50 }] })), /một lần/);
  assert.match(await expectError(c.create(c.owner, { workers: [] })), /ít nhất một người/);
  assert.match(await expectError(c.create(c.owner, { date: '2030-01-01' })), /INVALID_DATE/);
  assert.match(await expectError(c.create(c.owner, { price: 0 })), /đơn giá/);
  assert.match(await expectError(c.create(c.owner, { mode: 'lump', unit: null, price: null, lump: null })), /số tiền/);
  assert.match(await expectError(c.create(c.owner, { cycle: id('3', 99) })), /NOT_FOUND/);
  const other = await addUser(c.db, 9);
  const org2 = (await asUser(c.db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  const wx = (await c.db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Người ngoài') returning id`, [org2])).rows[0].id;
  assert.match(await expectError(c.create(c.owner, { workers: [{ worker_id: wx, pct: 100 }] })), /không thuộc cơ sở/);
  const j = (await c.create(c.owner)).rows[0].j;
  assert.ok(j);
  assert.equal((await c.db.query(`select count(*)::int n from piece_job_shares where job_id=$1`, [j])).rows[0].n, 2);
  assert.match(await expectError(asUser(c.db, c.owner, `select * from piece_jobs`)), /permission denied/i);   // chỉ đọc qua hàm
});

test('nghiệm thu theo sản lượng: tiền chia theo phần, người cuối nhận phần lẻ; vào kỳ lương tháng, Bảng lương và chi phí vụ; nháp chưa tính', async () => {
  const c = await setup();
  // công theo giờ sẵn có của An để đối chiếu không bị lệch
  await c.db.query(`insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,'hour',$2,30000,'2026-01-01')`, [c.org, c.w.a]);
  await c.db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes)
    values ($1,$2,$3,'2026-09-03','2026-09-03T07:00:00+07','2026-09-03T09:00:00+07','admin','confirmed',120)`, [id('a', 1), c.org, c.w.a]);
  const j = (await c.create(c.owner, { price: 1999, workers: [{ worker_id: c.w.a, pct: 60 }, { worker_id: c.w.b, pct: 40 }] })).rows[0].j;
  assert.equal((await c.overview(c.owner)).find((r) => r.worker_id === c.w.a).piece, 0);          // phiếu nháp chưa vào lương
  assert.match(await expectError(c.confirm(c.owner, j)), /sản lượng thực tế/);
  const r = (await c.confirm(c.owner, j, 333)).rows[0].r;                                             // 333 kg × 1.999 = 665.667
  assert.equal(r.job_total, 665667);
  const sh = (await c.db.query(`select worker_id, amount::int a from piece_job_shares where job_id=$1`, [j])).rows;
  assert.equal(sh.reduce((s, x) => s + x.a, 0), 665667);                                                // tổng khớp tuyệt đối
  const adj = (await c.db.query(`select kind::text k, amount::int a, reason, cycle_id from pay_adjustments where piece_job_id=$1`, [j])).rows;
  assert.equal(adj.length, 2);
  assert.ok(adj.every((x) => x.k === 'piece' && x.cycle_id === CYC && /Khoán: Hái dưa lô A \(333 kg × 1999 đ\)/.test(x.reason)));
  const ov = await c.overview(c.owner);
  const a = ov.find((x) => x.worker_id === c.w.a), b = ov.find((x) => x.worker_id === c.w.b);
  assert.equal(a.piece + b.piece, 665667);
  assert.equal(a.hourly, 60000);                                                                        // công giờ không đổi
  assert.equal(a.net, 60000 + a.piece);                                                                 // thực nhận = công + khoán
  assert.equal(Number((await c.db.query(`select total_estimated t from worker_pay_statements where worker_id=$1`, [c.w.a])).rows[0].t), 60000 + a.piece);
  // chi tiết một người có dòng "piece" kèm lý do
  const det = (await asUser(c.db, c.owner, `select get_pay_detail($1,$2,$3::date,$4::date) r`, [c.org, c.w.b, M, '2026-09-30'])).rows[0].r.items;
  assert.ok(det.some((x) => x.kind === 'piece' && x.amount === b.piece && /Khoán/.test(x.label)));
  // chi phí nhân công của vụ: kỳ chưa khóa = dự tính
  const sm = (await asUser(c.db, c.owner, `select get_cycle_summary($1) r`, [CYC])).rows[0].r;
  assert.equal(sm.labor_estimated, 665667);
  assert.match(await expectError(c.confirm(c.owner, j, 10)), /NOT_DRAFT/);                              // không nghiệm thu hai lần
});

test('khoán trọn gói chia đều ba người; phần lẻ về người cuối; không có sản lượng vẫn nghiệm thu được', async () => {
  const c = await setup();
  const j = (await c.create(c.owner, { mode: 'lump', unit: null, price: null, lump: 100000, title: 'Dọn nhà màng',
    workers: [{ worker_id: c.w.a }, { worker_id: c.w.b }, { worker_id: c.w.c }] })).rows[0].j;
  await c.confirm(c.owner, j);
  const amts = (await c.db.query(`select amount::int a from piece_job_shares where job_id=$1 order by amount`, [j])).rows.map((x) => x.a);
  assert.deepEqual(amts, [33333, 33333, 33334]);
});

test('quyền xem: người nhận chỉ thấy phần của mình; người ngoài phiếu không thấy; chủ thấy tất cả', async () => {
  const c = await setup();
  const j = (await c.create(c.owner)).rows[0].j;
  await c.confirm(c.owner, j, 100);
  const list = (u) => asUser(c.db, u, `select get_piece_jobs($1,$2::date,$3::date) r`, [c.org, M, '2026-09-30']).then((x) => x.rows[0].r);
  const own = await list(c.owner);
  assert.equal(own.jobs.length, 1);
  assert.equal(own.jobs[0].shares.length, 2);
  assert.equal(own.jobs[0].total_amount, 200000);
  const asB = await list(c.ub);
  assert.equal(asB.jobs.length, 1);
  assert.equal(asB.jobs[0].shares.length, 1);                  // chỉ phần của mình
  assert.equal(asB.jobs[0].shares[0].amount, 80000);
  assert.equal(asB.jobs[0].total_amount, null);                // không thấy tổng
  assert.equal((await list(c.uc)).jobs.length, 0);             // Chi không có tên trong phiếu
  assert.equal((await list(c.mgr)).jobs.length, 0);
  assert.equal((await c.overview(c.ub)).length, 1);            // Bảng lương của Bình chỉ có chính mình
  assert.equal((await c.overview(c.ub))[0].piece, 80000);
});

test('hủy: nháp hủy được; đã nghiệm thu thì gỡ khỏi kỳ lương và tính lại; cần lý do; khoản khoán không sửa/xóa như thưởng-phạt', async () => {
  const c = await setup();
  const j = (await c.create(c.owner)).rows[0].j;
  await c.confirm(c.owner, j, 100);
  const adjId = (await c.db.query(`select id from pay_adjustments where piece_job_id=$1 limit 1`, [j])).rows[0].id;
  assert.match(await expectError(asUser(c.db, c.owner, `select update_pay_adjustment($1,'bonus',1000,'sửa tay')`, [adjId])), /USE_PIECE/);
  assert.match(await expectError(asUser(c.db, c.owner, `select delete_pay_adjustment($1)`, [adjId])), /USE_PIECE/);
  assert.match(await expectError(asUser(c.db, c.mgr, `select cancel_piece_job($1,'nhầm')`, [j])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select cancel_piece_job($1,'x')`, [j])), /REASON_REQUIRED/);
  await asUser(c.db, c.owner, `select cancel_piece_job($1,'Ghi nhầm sản lượng')`, [j]);
  assert.equal((await c.db.query(`select count(*)::int n from pay_adjustments where piece_job_id=$1`, [j])).rows[0].n, 0);
  assert.equal((await c.overview(c.owner)).reduce((s, x) => s + x.piece, 0), 0);
  assert.equal((await c.db.query(`select status, cancel_reason from piece_jobs where id=$1`, [j])).rows[0].status, 'cancelled');
  const d = (await c.create(c.owner)).rows[0].j;                                                        // nháp: hủy và sửa
  await asUser(c.db, c.owner, `select update_piece_job($1,$2,'Hái lô B',$3::date,'lump',null,null,50000,$4::jsonb,null)`, [d, CYC, D, JSON.stringify([{ worker_id: c.w.c }])]);
  assert.equal(Number((await c.db.query(`select lump_amount l from piece_jobs where id=$1`, [d])).rows[0].l), 50000);
  await asUser(c.db, c.owner, `select cancel_piece_job($1,'Không làm nữa')`, [d]);
  assert.match(await expectError(asUser(c.db, c.owner, `select update_piece_job($1,$2,'x1',$3::date,'lump',null,null,1000,$4::jsonb,null)`, [d, CYC, D, JSON.stringify([{ worker_id: c.w.c }])])), /NOT_DRAFT/);
});

test('chốt lương: phiếu nháp trong tháng chặn khóa kỳ; nghiệm thu xong thì khóa được; kỳ đã khóa thì chặn nghiệm thu/hủy và chi phí vụ thành "đã duyệt"', async () => {
  const c = await setup();
  const j = (await c.create(c.owner)).rows[0].j;
  const st = (await asUser(c.db, c.owner, `select get_pay_settle_state($1,$2) r`, [c.org, M])).rows[0].r;
  assert.equal(st.blockers.draft_piece_jobs, 1);
  assert.match(st.blockers.messages.join(';'), /phiếu khoán chưa nghiệm thu/);
  const pid = (await c.confirm(c.owner, j, 100)).rows[0].r.period_id;
  assert.equal((await asUser(c.db, c.owner, `select get_pay_settle_state($1,$2) r`, [c.org, M])).rows[0].r.blockers.blocked, false);
  await asUser(c.db, c.owner, `select lock_payroll($1)`, [pid]);
  const sm = (await asUser(c.db, c.owner, `select get_cycle_summary($1) r`, [CYC])).rows[0].r;
  assert.equal(sm.labor_cost, 200000);
  assert.equal(sm.labor_estimated, 0);
  assert.match(await expectError(asUser(c.db, c.owner, `select cancel_piece_job($1,'muộn rồi')`, [j])), /PERIOD_LOCKED/);
  const j2 = (await c.create(c.owner, { title: 'Hái lô C' })).rows[0].j;
  assert.match(await expectError(c.confirm(c.owner, j2, 5)), /PERIOD_LOCKED/);
  const ov = await c.overview(c.owner);
  assert.equal(ov.reduce((s, x) => s + x.piece, 0), 200000);
  assert.equal(ov.reduce((s, x) => s + x.net_locked, 0), 200000);
});
