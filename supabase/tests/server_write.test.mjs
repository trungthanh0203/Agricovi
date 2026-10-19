// Ghi thẳng lên máy chủ (quyết định D24): serverWrite.ts chạy trên CSDL thật (PGlite + toàn bộ migration + RLS).
// Các thao tác ngoài "ghi mới việc hằng ngày của nhân viên" cần mạng và báo kết quả ngay, không qua hàng đợi.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';
import { insertRow, updateVersioned, CONFLICT_MESSAGE } from '../../apps/app/src/lib/serverWrite.ts';

const AREA = '20000000-0000-4000-8000-0000000000e1';
const CYC = '30000000-0000-4000-8000-0000000000e1';
const HV = '80000000-0000-4000-8000-0000000000e1';
const EX = '90000000-0000-4000-8000-0000000000e1';
const cropSql = `(select id from crop_types limit 1)`;

/** Máy chủ giả: chạy mọi lệnh như người dùng đã đăng nhập (RLS có hiệu lực), giống supabase-js (INSERT không RETURNING) */
function client(pg, userId) {
  const param = (v) => (v !== null && typeof v === 'object' ? [JSON.stringify(v), '::jsonb'] : [v, '']);
  return {
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const vals = keys.map((k) => param(args[k]));
      const sql = `select * from ${fn}(${keys.map((k, i) => `${k} => $${i + 1}${vals[i][1]}`).join(', ')})`;
      try {
        const r = await asUser(pg, userId, sql, vals.map((v) => v[0]));
        return { data: r.rows[0] ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    from(table) {
      return {
        async insert(values) {
          const cols = Object.keys(values);
          const vals = cols.map((c) => param(values[c]));
          const sql = `insert into ${table} (${cols.join(',')}) values (${vals.map((v, i) => `$${i + 1}${v[1]}`).join(',')})`;
          try {
            await asUser(pg, userId, sql, vals.map((v) => v[0]));
            return { error: null };
          } catch (e) {
            return { error: { message: e.message } };
          }
        },
        select() { throw new Error('không dùng trong test này'); },
      };
    },
  };
}

async function setup() {
  const pg = await createDb();
  const owner = await addUser(pg, 1);
  const mgr = await addUser(pg, 2);
  const worker = await addUser(pg, 3);
  const fin = await addUser(pg, 4);
  const org = (await asUser(pg, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await pg.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['inventory_finance']::member_role[])`, [org, mgr, worker, fin]);
  await pg.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await pg.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropSql},'active')`, [CYC, org, AREA]);
  await pg.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity,created_by) values ($1,$2,$3,now(),100,5,$4)`, [HV, org, CYC, worker]);
  return { pg, owner, mgr, worker, fin, org };
}

test('sửa đúng phiên bản: áp dụng, tăng phiên bản, trả về hàng mới', async () => {
  const { pg, mgr } = await setup();
  const row = await updateVersioned('harvest_records', HV, 1, { quantity: 120 }, client(pg, mgr));
  assert.equal(row.version, 2);
  assert.equal(Number(row.quantity), 120);
});

test('xung đột: người khác đã sửa trước -> báo câu dễ hiểu, dữ liệu người trước còn nguyên (không ghi đè)', async () => {
  const { pg, mgr, owner } = await setup();
  await updateVersioned('harvest_records', HV, 1, { quantity: 120 }, client(pg, owner));
  await assert.rejects(updateVersioned('harvest_records', HV, 1, { quantity: 999 }, client(pg, mgr)), (e) => {
    assert.equal(e.message, CONFLICT_MESSAGE);
    return true;
  });
  assert.equal((await pg.query(`select quantity::numeric q from harvest_records where id=$1`, [HV])).rows[0].q, '120');
  // sửa lại trên phiên bản mới nhất thì được
  assert.equal((await updateVersioned('harvest_records', HV, 2, { quantity: 130 }, client(pg, mgr))).version, 3);
});

test('không đủ quyền: lỗi từ máy chủ được giữ nguyên để báo ngay (không cất vào hàng đợi)', async () => {
  const { pg, mgr, fin, org } = await setup();
  await insertRow('expense_records', { id: EX, organization_id: org, cycle_id: CYC, category: 'utility', kind: 'cash_paid', amount: 1000, expense_date: '2026-10-19', source: 'online', created_by: fin }, client(pg, fin));
  await assert.rejects(updateVersioned('expense_records', EX, 1, { amount: 1 }, client(pg, mgr)), /FORBIDDEN/); // quản lý chỉ xem
  assert.equal((await updateVersioned('expense_records', EX, 1, { amount: 2000 }, client(pg, fin))).version, 2);
  await assert.rejects(updateVersioned('bang_khong_ton_tai', EX, 1, {}, client(pg, fin)), /chưa hỗ trợ sửa/);
});

test('thêm mới: quản lý không ghi được chi phí (RLS); gửi lặp cùng id coi như đã lưu, không nhân đôi', async () => {
  const { pg, mgr, fin, org } = await setup();
  const row = { id: EX, organization_id: org, cycle_id: CYC, category: 'labor', kind: 'cash_paid', amount: 500000, expense_date: '2026-10-19', source: 'online', created_by: fin };
  await assert.rejects(insertRow('expense_records', { ...row, created_by: mgr }, client(pg, mgr)), /row-level security/);
  await insertRow('expense_records', row, client(pg, fin));
  await insertRow('expense_records', row, client(pg, fin)); // bấm Lưu lặp / mất phản hồi
  assert.equal((await pg.query(`select count(*)::int n from expense_records`)).rows[0].n, 1);
});

test('tạo vụ vượt hạn mức: máy chủ từ chối ngay với thông báo rõ (không còn "Cần xử lý" muộn)', async () => {
  const { pg, owner, org } = await setup();
  const c = client(pg, owner);
  const mk = (id, status) => ({ id, owner_org_id: org, area_id: AREA, crop_type_id: null, status, start_date: null });
  const crop = (await pg.query(`select id from crop_types limit 1`)).rows[0].id;
  await insertRow('production_cycles', { ...mk('30000000-0000-4000-8000-0000000000e2', 'active'), crop_type_id: crop }, c); // vụ thứ 2 (gói dùng thử 2 vụ)
  await assert.rejects(insertRow('production_cycles', { ...mk('30000000-0000-4000-8000-0000000000e3', 'active'), crop_type_id: crop }, c), /QUOTA_EXCEEDED/);
  // lưu ở trạng thái Chuẩn bị thì không tính hạn mức
  await insertRow('production_cycles', { ...mk('30000000-0000-4000-8000-0000000000e4', 'preparing'), crop_type_id: crop }, c);
});

test('thêm khu trồng: chủ/quản lý được, nhân viên bị từ chối', async () => {
  const { pg, mgr, worker, org } = await setup();
  await insertRow('production_areas', { id: '20000000-0000-4000-8000-0000000000e9', organization_id: org, name: 'N2' }, client(pg, mgr));
  await assert.rejects(insertRow('production_areas', { id: '20000000-0000-4000-8000-0000000000ea', organization_id: org, name: 'N3' }, client(pg, worker)), /row-level security/);
});
