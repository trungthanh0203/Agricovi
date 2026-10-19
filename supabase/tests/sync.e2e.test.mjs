// Kiểm thử đồng bộ OFFLINE -> máy chủ, đầu-cuối: logic hàng đợi THẬT của app (apps/app/src/lib/outbox.ts)
// chạy trên IndexedDB giả (fake-indexeddb), nói chuyện với CSDL THẬT của dự án (PGlite + toàn bộ migration + RLS).
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, uid } from './harness.mjs';
import { createOutbox } from '../../apps/app/src/lib/outbox.ts';
import { LocalDb } from '../../apps/app/src/lib/db.ts';

let dbCounter = 0;
const AREA = '20000000-0000-4000-8000-0000000000f1';
const CYC = '30000000-0000-4000-8000-0000000000f1';
const LOG = '40000000-0000-4000-8000-0000000000f1';
const wtSql = `(select id from work_types where code='irrigation')`;
const cropSql = `(select id from crop_types limit 1)`;

/** Máy chủ giả: chạy mọi lệnh như người dùng đã đăng nhập (RLS có hiệu lực). */
function fakeClient(pg, userId, opts = {}) {
  const param = (v) => (v !== null && typeof v === 'object' ? [JSON.stringify(v), '::jsonb'] : [v, '']);
  return {
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const vals = keys.map((k) => param(args[k]));
      const sql = `select * from ${fn}(${keys.map((k, i) => `${k} => $${i + 1}${vals[i][1]}`).join(', ')})`;
      try {
        const r = await asUser(pg, userId, sql, vals.map((v) => v[0]));
        if (opts.loseNextResponse) { opts.loseNextResponse = false; return { data: null, error: { message: 'Failed to fetch' } }; }
        return { data: r.rows[0] ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    from(table) {
      return {
        async upsert(values) {
          const cols = Object.keys(values);
          const vals = cols.map((c) => param(values[c]));
          const sql = `insert into ${table} (${cols.join(',')}) values (${vals.map((v, i) => `$${i + 1}${v[1]}`).join(',')}) on conflict (id) do nothing`;
          try {
            await asUser(pg, userId, sql, vals.map((v) => v[0]));
            return { error: null };
          } catch (e) {
            return { error: { message: e.message } };
          }
        },
        select() {
          return {
            eq: (col, val) => ({
              async maybeSingle() {
                const r = await asUser(pg, userId, `select * from ${table} where ${col} = $1`, [val]);
                return { data: r.rows[0] ?? null, error: null };
              },
            }),
          };
        },
      };
    },
  };
}

async function setup(role = 'owner') {
  const pg = await createDb();
  const owner = await addUser(pg, 1);
  const mgr = await addUser(pg, 2);
  const org = (await asUser(pg, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  await pg.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await pg.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropSql},'active')`, [CYC, org, AREA]);
  await pg.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,note) values ($1,$2,$3,${wtSql},now(),$4,'gốc')`, [LOG, org, CYC, owner]);
  return { pg, owner, mgr, org };
}

function device(pg, userId, opts) {
  const local = new LocalDb(`test-${++dbCounter}`);
  const client = fakeClient(pg, userId, opts);
  const box = createOutbox({ db: local, client: () => client, online: () => true });
  return { local, box, opts };
}

// Phạm vi offline (quyết định D24): chỉ GHI MỚI việc hằng ngày của nhân viên (nhật ký, vật tư đã dùng, thu hoạch).
// Mọi thao tác khác cần mạng và ghi thẳng lên máy chủ (xem server_write.test.mjs).

test('hàng đợi chỉ có thêm mới: không còn đường sửa/xung đột trong hàng đợi', async () => {
  const { pg, owner } = await setup();
  const d = device(pg, owner);
  assert.equal(d.box.enqueueUpdate, undefined);
  assert.equal(d.box.resolveKeepMine, undefined);
  assert.equal(d.box.resolveUseServer, undefined);
});

test('ghi nhật ký offline rồi đồng bộ: gửi lặp (mất phản hồi) không nhân đôi bản ghi', async () => {
  const { pg, owner, org } = await setup();
  const d = device(pg, owner);
  const log = 'cccccccc-0000-4000-8000-000000000003';
  const wtId = (await pg.query(`select id from work_types where code='irrigation'`)).rows[0].id;
  await d.box.enqueue('activity_logs', { id: log, organization_id: org, cycle_id: CYC, area_id: AREA, work_type_id: wtId, performed_at: new Date().toISOString(), data: { duration_min: 15 }, note: 'offline', source: 'offline', created_by: owner, performed_by: owner });

  const r = await d.box.flush();
  assert.equal(r.synced, 1);
  assert.equal(r.failed, 0);
  await d.box.flush(); // lượt thứ hai không làm gì thêm
  await d.local.outbox.toCollection().modify({ state: 'local_only' }); // mất phản hồi: gửi lại cả bộ
  await d.box.flush();
  assert.equal((await pg.query(`select count(*)::int n from activity_logs where id=$1`, [log])).rows[0].n, 1);
  assert.deepEqual((await pg.query(`select data from activity_logs where id=$1`, [log])).rows[0].data, { duration_min: 15 });
});

test('xuất dùng khi ghi việc offline: nhật ký + giao dịch xuất gửi đúng thứ tự; hủy nhật ký (cần mạng) thì kho được đảo', async () => {
  const { pg, org } = await setup();
  const worker = await addUser(pg, 8);
  const fin = await addUser(pg, 9);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['inventory_finance']::member_role[])`, [org, worker, fin]);
  const loc = '50000000-0000-4000-8000-0000000000f2';
  const mat = '60000000-0000-4000-8000-0000000000f2';
  await pg.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho chính')`, [loc, org]);
  await pg.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [mat, org]);
  await asUser(pg, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ('70000000-0000-4000-8000-0000000000f2',$1,$2,$3,'receipt',20,100,current_date)`, [org, loc, mat]);

  const d = device(pg, worker);
  const log = 'eeeeeeee-0000-4000-8000-000000000001';
  const wt = (await pg.query(`select id from work_types where code='fertilizing' or code='irrigation' order by code limit 1`)).rows[0].id;
  const issueRow = (id, qty, logId) => ({
    id, organization_id: org, location_id: loc, material_id: mat, txn_type: 'issue', quantity_delta: -qty, unit_cost: null,
    txn_date: '2026-10-19', cycle_id: CYC, activity_log_id: logId, reason: null, source: 'offline',
  });
  const logRow = (id, wtId) => ({ id, organization_id: org, cycle_id: CYC, area_id: AREA, work_type_id: wtId, performed_at: new Date().toISOString(), data: {}, note: 'bón', source: 'offline', created_by: worker, performed_by: worker });

  // xếp hàng cùng một khoảnh khắc: nhật ký trước, rồi hai dòng vật tư
  await d.box.enqueue('activity_logs', logRow(log, wt));
  await d.box.enqueue('inventory_transactions', issueRow('dddddddd-0000-4000-8000-0000000000a1', 3, log));
  await d.box.enqueue('inventory_transactions', issueRow('dddddddd-0000-4000-8000-0000000000a2', 2, log));
  const queued = await d.local.outbox.orderBy('createdAt').toArray();
  assert.deepEqual(queued.map((o) => o.id), [log, 'dddddddd-0000-4000-8000-0000000000a1', 'dddddddd-0000-4000-8000-0000000000a2'], 'đúng thứ tự tạo');
  assert.equal(new Set(queued.map((o) => o.createdAt)).size, 3, 'thời điểm tạo phải khác nhau để thứ tự gửi không bị hòa');

  const r = await d.box.flush();
  const errs = (await d.local.outbox.toArray()).map((o) => o.lastError).filter(Boolean);
  assert.deepEqual(errs, []);
  assert.equal(r.synced, 3);
  assert.equal(r.failed, 0);
  const bal = async () => Number((await pg.query(`select sum(quantity_delta) b from inventory_transactions where material_id=$1`, [mat])).rows[0].b);
  assert.equal(await bal(), 15);
  assert.equal((await pg.query(`select cycle_id from inventory_transactions where id='dddddddd-0000-4000-8000-0000000000a1'`)).rows[0].cycle_id, CYC);

  // hủy nhật ký (người ghi, trong 24 giờ, có mạng): ghi thẳng, máy chủ tự đảo kho
  await asUser(pg, worker, `select * from update_activity_log($1,1,$2,$3::jsonb)`, [log, uid(901), JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'ghi nhầm' })]);
  assert.equal(await bal(), 20);
});

test('nhật ký bị lỗi khi đồng bộ thì giao dịch xuất kho của nó chờ, không gửi lẻ và không mất', async () => {
  const { pg, org } = await setup();
  const worker = await addUser(pg, 8);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const loc = '50000000-0000-4000-8000-0000000000f3';
  const mat = '60000000-0000-4000-8000-0000000000f3';
  await pg.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [loc, org]);
  await pg.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Thuốc',(select id from units_of_measure where code='ml'))`, [mat, org]);
  const d = device(pg, worker);
  const log = 'eeeeeeee-0000-4000-8000-000000000002';
  // loại việc không tồn tại -> nhật ký bị từ chối
  await d.box.enqueue('activity_logs', { id: log, organization_id: org, cycle_id: CYC, area_id: AREA, work_type_id: '99999999-0000-4000-8000-000000000999', performed_at: new Date().toISOString(), data: {}, note: null, source: 'offline', created_by: worker, performed_by: worker });
  await d.box.enqueue('inventory_transactions', {
    id: 'dddddddd-0000-4000-8000-0000000000b1', organization_id: org, location_id: loc, material_id: mat, txn_type: 'issue', quantity_delta: -1,
    unit_cost: null, txn_date: '2026-10-19', cycle_id: CYC, activity_log_id: log, reason: null, source: 'offline',
  });
  const r = await d.box.flush();
  assert.equal(r.failed, 1);
  assert.equal((await pg.query(`select count(*)::int n from inventory_transactions`)).rows[0].n, 0, 'giao dịch xuất không được gửi lẻ khi nhật ký chưa lên');
  const left = await d.local.outbox.get('dddddddd-0000-4000-8000-0000000000b1');
  assert.ok(left && left.state !== 'synced');
});

test('thu hoạch ghi mới offline: nhân viên ghi được, gửi lặp không nhân đôi; người ngoài bị từ chối và bản ghi vẫn giữ trên máy', async () => {
  const { pg, org } = await setup();
  const worker = await addUser(pg, 8);
  const outsider = await addUser(pg, 9);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const H = 'ffffffff-0000-4000-8000-000000000001';
  const row = (created_by) => ({ id: H, organization_id: org, cycle_id: CYC, harvested_at: new Date().toISOString(), grade: 'Loại 1', quantity: 120, unit: 'kg', loss_quantity: 8, note: null, source: 'offline', created_by });

  const d = device(pg, worker);
  await d.box.enqueue('harvest_records', row(worker));
  assert.equal((await d.box.flush()).synced, 1);
  await d.local.outbox.toCollection().modify({ state: 'local_only' }); // gửi lặp (mất phản hồi)
  await d.box.flush();
  assert.equal((await pg.query(`select count(*)::int n from harvest_records where id=$1`, [H])).rows[0].n, 1);

  const o = device(pg, outsider);
  await o.box.enqueue('harvest_records', { ...row(outsider), id: 'ffffffff-0000-4000-8000-000000000002' });
  const r = await o.box.flush();
  assert.equal(r.failed, 1);
  assert.equal((await o.local.outbox.get('ffffffff-0000-4000-8000-000000000002')).state, 'needs_attention');
  assert.equal((await pg.query(`select count(*)::int n from harvest_records`)).rows[0].n, 1);
});

test('TỔNG HỢP bước C: nhân viên ghi offline, người phụ trách kho/chi phí ghi trực tiếp -> tổng kết vụ khớp số đã ghi; hủy nhật ký thì chi phí vật tư tự giảm', async () => {
  const { pg, org, owner } = await setup();
  const worker = await addUser(pg, 8);
  const fin = await addUser(pg, 9);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['inventory_finance']::member_role[])`, [org, worker, fin]);
  const loc = '50000000-0000-4000-8000-0000000000f9';
  const mat = '60000000-0000-4000-8000-0000000000f9';
  await pg.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho chính')`, [loc, org]);
  await pg.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [mat, org]);
  const today = new Date().toISOString().slice(0, 10);
  const wt = (await pg.query(`select id from work_types where code='fertilizing'`)).rows[0].id;
  const summary = async (u) => (await asUser(pg, u, `select get_cycle_summary($1) s`, [CYC])).rows[0].s;

  // người phụ trách Kho & chi phí (có mạng, ghi thẳng): nhập kho có giá, chi phí, doanh thu
  await asUser(pg, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ('dddddddd-0000-4000-8000-0000000000c1',$1,$2,$3,'receipt',20,100,$4)`, [org, loc, mat, today]);
  await asUser(pg, fin, `insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ('ffffffff-0000-4000-8000-0000000000c2',$1,$2,'utility','cash_paid',1000,$3)`, [org, CYC, today]);
  await asUser(pg, fin, `insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,unit,amount) values ('ffffffff-0000-4000-8000-0000000000c3',$1,$2,$3,80,'kg',2400000)`, [org, CYC, today]);

  // nhân viên (offline): ghi việc bón phân kèm 4 kg vật tư, và một phiếu thu hoạch
  const wDev = device(pg, worker);
  const log = 'eeeeeeee-0000-4000-8000-0000000000c4';
  await wDev.box.enqueue('activity_logs', { id: log, organization_id: org, cycle_id: CYC, area_id: AREA, work_type_id: wt, performed_at: new Date().toISOString(), data: {}, note: 'bón phân', source: 'offline', created_by: worker, performed_by: worker });
  await wDev.box.enqueue('inventory_transactions', { id: 'dddddddd-0000-4000-8000-0000000000c5', organization_id: org, location_id: loc, material_id: mat, txn_type: 'issue', quantity_delta: -4, unit_cost: null, txn_date: today, cycle_id: CYC, activity_log_id: log, reason: null, source: 'offline' });
  await wDev.box.enqueue('harvest_records', { id: 'ffffffff-0000-4000-8000-0000000000c6', organization_id: org, cycle_id: CYC, harvested_at: new Date().toISOString(), grade: null, quantity: 100, unit: 'kg', loss_quantity: 10, note: null, source: 'offline', created_by: worker });

  // chưa đồng bộ: tổng kết chưa có thu hoạch và vật tư, nói rõ thiếu dữ liệu
  let s = await summary(owner);
  assert.equal(s.missing_harvest, true);
  assert.equal(s.cost_per_kg, null);
  assert.equal(Number(s.material_used_cost), 0);

  // có mạng: máy nhân viên gửi; gửi lặp (mất phản hồi) không đổi số liệu
  assert.equal((await wDev.box.flush()).failed, 0);
  assert.equal((await wDev.local.outbox.toArray()).filter((o) => o.state !== 'synced').length, 0);
  await wDev.local.outbox.toCollection().modify({ state: 'local_only' });
  await wDev.box.flush();

  s = await summary(owner);
  assert.equal(Number(s.cash_paid_other), 1000);
  assert.equal(Number(s.material_used_cost), 400);   // 4 kg x 100 đ (giá nhập bình quân, tính khi dùng)
  assert.equal(Number(s.total_cost), 1400);
  assert.equal(Number(s.harvested_net_qty), 90);
  assert.equal(Number(s.sold_qty), 80);
  assert.equal(Number(s.revenue_recorded), 2400000);
  assert.equal(s.issues_missing_cost, 0);
  assert.equal(s.missing_harvest, false);
  assert.equal(s.missing_revenue, false);
  assert.equal(Number(s.cost_per_kg), Math.round(1400 / 90));
  assert.equal((await asUser(pg, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [mat])).rows[0].b, '16');

  // nhân viên không xem được tổng kết chi phí
  await assert.rejects(summary(worker), /FORBIDDEN/);

  // hủy nhật ký (có mạng, ghi thẳng): máy chủ đảo kho, chi phí vật tư về 0, tồn trở lại 20
  await asUser(pg, worker, `select * from update_activity_log($1,1,$2,$3::jsonb)`, [log, uid(902), JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'ghi nhầm vụ' })]);
  s = await summary(owner);
  assert.equal(Number(s.material_used_cost), 0);
  assert.equal(Number(s.total_cost), 1000);
  assert.equal(Number(s.cost_per_kg), Math.round(1000 / 90));
  assert.equal((await asUser(pg, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [mat])).rows[0].b, '20');
});
