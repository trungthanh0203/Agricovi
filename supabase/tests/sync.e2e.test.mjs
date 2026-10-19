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

test('tạo offline rồi đồng bộ: đúng thứ tự, gửi lặp không nhân đôi bản ghi', async () => {
  const { pg, owner, org } = await setup();
  const d = device(pg, owner);
  const area = 'aaaaaaaa-0000-4000-8000-000000000001';
  const cyc = 'bbbbbbbb-0000-4000-8000-000000000002';
  const log = 'cccccccc-0000-4000-8000-000000000003';
  // xếp hàng theo thứ tự khu trồng -> vụ -> nhật ký (như khi người dùng làm offline)
  await d.box.enqueue('production_areas', { id: area, organization_id: org, name: 'Nhà màng offline' });
  await d.box.enqueue('production_cycles', { id: cyc, owner_org_id: org, area_id: area, crop_type_id: (await pg.query(`select id from crop_types limit 1`)).rows[0].id, status: 'preparing', start_date: null });
  await d.box.enqueue('activity_logs', { id: log, organization_id: org, cycle_id: cyc, area_id: area, work_type_id: (await pg.query(`select id from work_types where code='irrigation'`)).rows[0].id, performed_at: new Date().toISOString(), data: { duration_min: 15 }, note: 'offline', source: 'offline', created_by: owner, performed_by: owner });

  const r = await d.box.flush();
  assert.equal(r.synced, 3);
  assert.equal(r.failed, 0);
  await d.box.flush(); // lượt thứ hai không làm gì thêm
  // gửi lại cả bộ một lần nữa (mô phỏng mất phản hồi): đặt lại trạng thái rồi gửi
  await d.local.outbox.toCollection().modify({ state: 'local_only' });
  await d.box.flush();

  for (const [t, id] of [['production_areas', area], ['production_cycles', cyc], ['activity_logs', log]]) {
    assert.equal((await pg.query(`select count(*)::int n from ${t} where id=$1`, [id])).rows[0].n, 1, `${t} bị nhân đôi`);
  }
  assert.deepEqual((await pg.query(`select data from activity_logs where id=$1`, [log])).rows[0].data, { duration_min: 15 });
});

test('hai lần sửa xếp hàng offline cho cùng một bản ghi đều được áp dụng theo thứ tự (không tự gây xung đột)', async () => {
  const { pg, owner } = await setup();
  const d = device(pg, owner);
  await d.local.logs.put({ id: LOG, organization_id: '', cycle_id: CYC, area_id: AREA, work_type_id: '', performed_at: '', data: {}, note: 'gốc', version: 1 });
  await d.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'sửa lần 1' });
  await d.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'sửa lần 2' }); // cùng phiên bản gốc vì cả hai đều làm offline
  const r = await d.box.flush();
  assert.equal(r.failed, 0);
  const row = (await pg.query(`select note, version from activity_logs where id=$1`, [LOG])).rows[0];
  assert.deepEqual({ ...row }, { note: 'sửa lần 2', version: 3 });
  assert.equal((await d.local.logs.get(LOG)).version, 3);
});

test('XUNG ĐỘT: máy chủ đã bị sửa trước -> không ghi đè; dữ liệu của người sửa trước còn nguyên; thay đổi của tôi được giữ để chọn', async () => {
  const { pg, owner, mgr } = await setup();
  const owned = device(pg, owner);
  const mine = device(pg, mgr);
  await mine.local.logs.put({ id: LOG, organization_id: '', cycle_id: CYC, area_id: AREA, work_type_id: '', performed_at: '', data: {}, note: 'gốc', version: 1 });
  await owned.local.logs.put({ id: LOG, organization_id: '', cycle_id: CYC, area_id: AREA, work_type_id: '', performed_at: '', data: {}, note: 'gốc', version: 1 });

  // quản lý sửa OFFLINE (chưa gửi); trong lúc đó chủ sửa và gửi lên trước
  await mine.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'của quản lý' });
  await owned.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'của chủ' });
  assert.equal((await owned.box.flush()).failed, 0);

  const r = await mine.box.flush();
  assert.equal(r.failed, 1);
  assert.equal((await pg.query(`select note from activity_logs where id=$1`, [LOG])).rows[0].note, 'của chủ'); // không bị ghi đè
  const item = (await mine.local.outbox.toArray())[0];
  assert.equal(item.state, 'needs_attention');
  assert.match(item.lastError, /CONFLICT/);
  assert.equal(item.conflict.server.note, 'của chủ');
  assert.equal(item.conflict.server.version, 2);

  // gửi lại tự động không đổi gì khi chưa giải quyết
  await mine.box.flush();
  assert.equal((await pg.query(`select note from activity_logs where id=$1`, [LOG])).rows[0].note, 'của chủ');

  // chọn "Giữ thay đổi của tôi"
  await mine.box.resolveKeepMine(item.id);
  const after = (await pg.query(`select note, version from activity_logs where id=$1`, [LOG])).rows[0];
  assert.deepEqual({ ...after }, { note: 'của quản lý', version: 3 });
  assert.equal((await mine.local.outbox.get(item.id)).state, 'synced');
});

test('XUNG ĐỘT -> "Dùng bản máy chủ": bỏ thay đổi của tôi, bản trên máy lấy theo máy chủ, không gửi gì lên', async () => {
  const { pg, owner, mgr } = await setup();
  const owned = device(pg, owner);
  const mine = device(pg, mgr);
  const seed = { id: LOG, organization_id: '', cycle_id: CYC, area_id: AREA, work_type_id: '', performed_at: '', data: {}, note: 'gốc', version: 1 };
  await mine.local.logs.put(seed);
  await owned.local.logs.put(seed);
  await mine.local.logs.update(LOG, { note: 'của quản lý' }); // hiển thị lạc quan trên máy
  await mine.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'của quản lý' });
  await owned.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'của chủ' });
  await owned.box.flush();
  await mine.box.flush();
  const item = (await mine.local.outbox.toArray())[0];

  await mine.box.resolveUseServer(item.id);
  const local = await mine.local.logs.get(LOG);
  assert.equal(local.note, 'của chủ');
  assert.equal(local.version, 2);
  assert.equal(await mine.local.outbox.count(), 0);
  assert.equal((await pg.query(`select note from activity_logs where id=$1`, [LOG])).rows[0].note, 'của chủ');
});

test('mất phản hồi sau khi máy chủ đã áp dụng: gửi lại KHÔNG bị coi là xung đột và không tăng phiên bản hai lần', async () => {
  const { pg, owner } = await setup();
  const opts = { loseNextResponse: true };
  const d = device(pg, owner, opts);
  await d.local.logs.put({ id: LOG, organization_id: '', cycle_id: CYC, area_id: AREA, work_type_id: '', performed_at: '', data: {}, note: 'gốc', version: 1 });
  await d.box.enqueueUpdate('activity_logs', LOG, 1, { note: 'đã sửa' });

  await d.box.flush(); // máy chủ đã áp dụng nhưng điện thoại không nhận được phản hồi
  assert.equal((await pg.query(`select version from activity_logs where id=$1`, [LOG])).rows[0].version, 2);
  const stuck = (await d.local.outbox.toArray())[0];
  assert.equal(stuck.state, 'needs_attention');
  assert.equal(stuck.conflict, undefined);

  await d.box.retryFailed();
  assert.equal((await d.local.outbox.toArray())[0].state, 'synced');
  assert.equal((await pg.query(`select version from activity_logs where id=$1`, [LOG])).rows[0].version, 2);
});

test('vượt hạn mức khi đồng bộ: vụ vào "Cần xử lý", nhật ký của vụ đó chờ, không mất dữ liệu; có chỗ trống thì tự gửi được', async () => {
  const { pg, owner, org } = await setup();
  await pg.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-0000000000f2',$1,$2,${cropSql},'active')`, [org, AREA]); // đủ 2/2
  const d = device(pg, owner);
  const cyc = 'dddddddd-0000-4000-8000-000000000001';
  const log = 'dddddddd-0000-4000-8000-000000000002';
  const crop = (await pg.query(`select id from crop_types limit 1`)).rows[0].id;
  const wt = (await pg.query(`select id from work_types where code='irrigation'`)).rows[0].id;
  await d.box.enqueue('production_cycles', { id: cyc, owner_org_id: org, area_id: AREA, crop_type_id: crop, status: 'active', start_date: null });
  await d.box.enqueue('activity_logs', { id: log, organization_id: org, cycle_id: cyc, area_id: AREA, work_type_id: wt, performed_at: new Date().toISOString(), data: {}, note: null, source: 'offline', created_by: owner, performed_by: owner });

  const r = await d.box.flush();
  assert.equal(r.failed, 1);
  const items = await d.local.outbox.toArray();
  const byTable = Object.fromEntries(items.map((i) => [i.table, i]));
  assert.equal(byTable.production_cycles.state, 'needs_attention');
  assert.match(byTable.production_cycles.lastError, /QUOTA_EXCEEDED/);
  assert.notEqual(byTable.activity_logs.state, 'synced'); // nhật ký chờ vụ
  assert.equal((await pg.query(`select count(*)::int n from activity_logs where id=$1`, [log])).rows[0].n, 0);
  assert.equal(items.length, 2); // dữ liệu vẫn nằm trên máy

  await pg.query(`update production_cycles set status='ended' where id='30000000-0000-4000-8000-0000000000f2'`); // có chỗ trống
  await d.box.retryFailed();
  assert.equal((await pg.query(`select count(*)::int n from production_cycles where id=$1`, [cyc])).rows[0].n, 1);
  assert.equal((await pg.query(`select count(*)::int n from activity_logs where id=$1`, [log])).rows[0].n, 1);
});

test('kho offline: nhập kho + điều chỉnh xếp hàng rồi đồng bộ; gửi lặp không nhân đôi; điều chỉnh thiếu lý do báo "Cần xử lý" và không mất', async () => {
  const { pg, org } = await setup();
  const fin = await addUser(pg, 7);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['inventory_finance']::member_role[])`, [org, fin]);
  const loc = '50000000-0000-4000-8000-0000000000f1';
  const mat = '60000000-0000-4000-8000-0000000000f1';
  await pg.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho chính')`, [loc, org]);
  await pg.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [mat, org]);

  const d = device(pg, fin);
  const txn = (id, type, delta, extra = {}) => ({
    id, organization_id: org, location_id: loc, material_id: mat, txn_type: type, quantity_delta: delta,
    unit_cost: type === 'receipt' ? 12000 : null, txn_date: '2026-10-19', reason: null, source: 'offline', ...extra,
  });
  const R = 'dddddddd-0000-4000-8000-000000000001';
  const A = 'dddddddd-0000-4000-8000-000000000002';
  const BAD = 'dddddddd-0000-4000-8000-000000000003';
  await d.box.enqueue('inventory_transactions', txn(R, 'receipt', 25));
  await d.box.enqueue('inventory_transactions', txn(A, 'adjustment', -2, { reason: 'Kiểm kê thấy thiếu' }));
  await d.box.enqueue('inventory_transactions', txn(BAD, 'adjustment', -1)); // thiếu lý do

  const r = await d.box.flush();
  assert.equal(r.synced, 2);
  assert.equal(r.failed, 1);
  const bad = await d.local.outbox.get(BAD);
  assert.equal(bad.state, 'needs_attention'); // giữ lại trên thiết bị, không mất
  assert.equal((await asUser(pg, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [mat])).rows[0].b, '23');

  // gửi lại toàn bộ (mất phản hồi): không nhân đôi
  await d.local.outbox.toCollection().modify({ state: 'local_only' });
  await d.box.flush();
  assert.equal((await pg.query(`select count(*)::int n from inventory_transactions where material_id=$1`, [mat])).rows[0].n, 2);
  assert.equal((await asUser(pg, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [mat])).rows[0].b, '23');
});

test('xuất dùng khi ghi việc offline: nhật ký + giao dịch xuất gửi đúng thứ tự; hủy nhật ký thì kho được đảo', async () => {
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

  // hủy nhật ký (người ghi, trong 24 giờ) -> máy chủ tự đảo kho
  await d.local.logs.put({ id: log, organization_id: org, cycle_id: CYC, area_id: AREA, work_type_id: wt, performed_at: '', data: {}, note: 'bón', version: 1 });
  await d.box.enqueueUpdate('activity_logs', log, 1, { voided_at: new Date().toISOString(), void_reason: 'ghi nhầm' });
  assert.equal((await d.box.flush()).failed, 0);
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

test('thu hoạch offline: ghi, sửa có phiên bản, xung đột khi người khác sửa trước, hủy; gửi lặp không nhân đôi', async () => {
  const { pg, org, owner, mgr } = await setup();
  const worker = await addUser(pg, 8);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const H = 'ffffffff-0000-4000-8000-000000000001';
  const d = device(pg, worker);
  const row = { id: H, organization_id: org, cycle_id: CYC, harvested_at: new Date().toISOString(), grade: 'Loại 1', quantity: 120, unit: 'kg', loss_quantity: 8, note: null, source: 'offline', created_by: worker };

  await d.box.enqueue('harvest_records', row);
  assert.equal((await d.box.flush()).synced, 1);
  await d.local.outbox.toCollection().modify({ state: 'local_only' }); // gửi lặp (mất phản hồi)
  await d.box.flush();
  assert.equal((await pg.query(`select count(*)::int n from harvest_records where id=$1`, [H])).rows[0].n, 1);

  // người ghi sửa bản của mình (trong 24 giờ) -> phiên bản 2
  await d.local.harvests.put({ ...row, version: 1 });
  await d.box.enqueueUpdate('harvest_records', H, 1, { quantity: 125, loss_quantity: 10 });
  assert.equal((await d.box.flush()).failed, 0);
  const cur = (await pg.query(`select quantity::numeric q, loss_quantity::numeric l, version from harvest_records where id=$1`, [H])).rows[0];
  assert.deepEqual({ q: cur.q, l: cur.l, v: cur.version }, { q: '125', l: '10', v: 2 });
  assert.equal((await d.local.harvests.get(H)).version, 2);

  // quản lý đang offline sửa trên phiên bản 2; trong lúc đó chủ sửa và gửi trước -> quản lý nhận XUNG ĐỘT, dữ liệu của chủ còn nguyên
  const mgrDev = device(pg, mgr);
  const ownDev = device(pg, owner);
  for (const dev of [mgrDev, ownDev]) await dev.local.harvests.put({ ...row, quantity: 125, loss_quantity: 10, version: 2 });
  await mgrDev.box.enqueueUpdate('harvest_records', H, 2, { quantity: 130 });
  await ownDev.box.enqueueUpdate('harvest_records', H, 2, { quantity: 126 });
  assert.equal((await ownDev.box.flush()).failed, 0);
  assert.equal((await mgrDev.box.flush()).failed, 1);
  assert.equal((await pg.query(`select quantity::numeric q from harvest_records where id=$1`, [H])).rows[0].q, '126');
  const item = (await mgrDev.local.outbox.toArray())[0];
  assert.match(item.lastError, /CONFLICT/);
  assert.equal(Number(item.conflict.server.quantity), 126);

  // "Dùng bản máy chủ": bản trên máy lấy theo máy chủ, không gửi gì thêm
  await mgrDev.box.resolveUseServer(item.id);
  assert.equal(Number((await mgrDev.local.harvests.get(H)).quantity), 126);
  assert.equal((await mgrDev.local.outbox.toArray()).length, 0);

  // hủy phiếu (có lý do) một chiều; sau đó không sửa được nội dung
  await ownDev.local.harvests.update(H, { version: 3 });
  await ownDev.box.enqueueUpdate('harvest_records', H, 3, { voided_at: new Date().toISOString(), void_reason: 'nhập nhầm' });
  assert.equal((await ownDev.box.flush()).failed, 0);
  assert.ok((await pg.query(`select voided_at from harvest_records where id=$1`, [H])).rows[0].voided_at);
  await ownDev.local.harvests.update(H, { version: 4 });
  await ownDev.box.enqueueUpdate('harvest_records', H, 4, { quantity: 1 });
  assert.equal((await ownDev.box.flush()).failed, 1);
  assert.match((await ownDev.local.outbox.toArray()).find((o) => o.state === 'needs_attention').lastError, /VOIDED/);
});

test('chi phí và doanh thu offline: ghi, ước tính thiếu giả định bị từ chối nhưng không mất, sửa có xung đột, quản lý không ghi/sửa được', async () => {
  const { pg, org, owner, mgr } = await setup();
  const fin = await addUser(pg, 8);
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['inventory_finance']::member_role[])`, [org, fin]);
  const d = device(pg, fin);
  const E1 = 'ffffffff-0000-4000-8000-0000000000e1'; // chi phí chung, không gắn vụ
  const E2 = 'ffffffff-0000-4000-8000-0000000000e2'; // gắn vụ
  const E3 = 'ffffffff-0000-4000-8000-0000000000e3'; // ước tính nhưng thiếu giả định
  const S1 = 'ffffffff-0000-4000-8000-0000000000a1';
  const exp = (id, over = {}) => ({ id, organization_id: org, cycle_id: null, category: 'utility', kind: 'cash_paid', amount: 150000, expense_date: '2026-10-19', note: null, source: 'offline', created_by: fin, ...over });

  await d.box.enqueue('expense_records', exp(E1));
  await d.box.enqueue('expense_records', exp(E2, { cycle_id: CYC, category: 'labor', amount: 400000 }));
  await d.box.enqueue('expense_records', exp(E3, { cycle_id: CYC, kind: 'estimated' }));
  await d.box.enqueue('sales_records', { id: S1, organization_id: org, cycle_id: CYC, sold_date: '2026-10-19', quantity: 80, unit: 'kg', amount: 2400000, buyer_note: 'Thương lái A', source: 'offline', created_by: fin });
  const r = await d.box.flush();
  assert.equal(r.synced, 3);
  assert.equal(r.failed, 1);
  const bad = await d.local.outbox.get(E3);
  assert.equal(bad.state, 'needs_attention'); // thiếu giả định: giữ lại trên thiết bị để người dùng bổ sung, không mất
  assert.equal((await pg.query(`select count(*)::int n from expense_records`)).rows[0].n, 2);

  // gửi lặp không nhân đôi (khoản thiếu giả định vẫn bị từ chối mỗi lần gửi lại)
  await d.local.outbox.toCollection().modify({ state: 'local_only' });
  assert.equal((await d.box.flush()).failed, 1);
  assert.equal((await pg.query(`select count(*)::int n from expense_records where id in ($1,$2)`, [E1, E2])).rows[0].n, 2);
  await d.local.outbox.delete(E3); // người dùng bỏ khoản chưa hợp lệ để các bước sau không bị lẫn
  assert.equal((await pg.query(`select count(*)::int n from sales_records`)).rows[0].n, 1);

  // sửa khoản chi có phiên bản
  await d.local.expenses.put({ ...exp(E2, { cycle_id: CYC, category: 'labor', amount: 400000 }), version: 1 });
  await d.box.enqueueUpdate('expense_records', E2, 1, { amount: 450000, note: 'thêm giờ' });
  assert.equal((await d.box.flush()).failed, 0);
  assert.equal((await pg.query(`select amount::numeric a, version from expense_records where id=$1`, [E2])).rows[0].a, '450000');

  // chủ sửa trước, Kho & chi phí đang offline sửa tiếp trên phiên bản cũ -> XUNG ĐỘT, không ghi đè
  const ownDev = device(pg, owner);
  await ownDev.local.expenses.put({ ...exp(E2, { cycle_id: CYC }), amount: 450000, version: 2 });
  await d.local.expenses.put({ ...exp(E2, { cycle_id: CYC }), amount: 450000, version: 2 });
  await ownDev.box.enqueueUpdate('expense_records', E2, 2, { amount: 460000 });
  await d.box.enqueueUpdate('expense_records', E2, 2, { amount: 470000 });
  assert.equal((await ownDev.box.flush()).failed, 0);
  assert.equal((await d.box.flush()).failed, 1);
  assert.equal((await pg.query(`select amount::numeric a from expense_records where id=$1`, [E2])).rows[0].a, '460000');
  const item = (await d.local.outbox.toArray()).find((o) => o.state === 'needs_attention' && o.id !== E3);
  assert.match(item.lastError, /CONFLICT/);
  assert.equal(Number(item.conflict.server.amount), 460000);

  // doanh thu: sửa rồi hủy
  await d.local.sales.put({ id: S1, organization_id: org, cycle_id: CYC, sold_date: '2026-10-19', quantity: 80, unit: 'kg', amount: 2400000, buyer_note: null, version: 1 });
  await d.box.enqueueUpdate('sales_records', S1, 1, { amount: 2500000 });
  await d.box.flush();
  assert.equal((await pg.query(`select amount::numeric a from sales_records where id=$1`, [S1])).rows[0].a, '2500000');

  // quản lý chỉ xem: ghi và sửa đều bị từ chối, vào "Cần xử lý" chứ không mất
  const m = device(pg, mgr);
  await m.box.enqueue('expense_records', exp('ffffffff-0000-4000-8000-0000000000e4', { created_by: mgr }));
  await m.local.expenses.put({ ...exp(E1), version: 1 });
  await m.box.enqueueUpdate('expense_records', E1, 1, { amount: 1 });
  const mr = await m.box.flush();
  assert.equal(mr.failed, 2);
  assert.equal((await pg.query(`select amount::numeric a from expense_records where id=$1`, [E1])).rows[0].a, '150000');
});
