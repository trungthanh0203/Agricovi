import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// D156: chuyển một chiều "vụ theo HTX" → "vụ riêng": hộ có tài khoản riêng + còn gói + còn hạn mức; hộ gửi yêu cầu, HTX duyệt.
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup() {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2), other = await addUser(db, 3);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ có tài khoản') id`)).rows[0].id;
  const managed = (await asUser(db, boss, `select create_member_household($1,'Hộ do HTX tạo') id`, [coop])).rows[0].id;
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv, hh]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn hộ'),($3,$4,'Vườn hộ HTX tạo')`, [id('2', 1), hh, id('2', 2), managed]);
  await db.query(`select set_config('agri.legacy_cycle_insert','on',false)`);
  // vụ theo HTX (chủ vụ là HTX) trên khu của hộ, đang chạy, có nhật ký, giai đoạn, thu hoạch, chi phí, phiếu thu mua
  const mk = (n, area, st = 'active') => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),$4,'Vụ theo HTX ' || $5)`, [id('3', n), coop, area, st, String(n)]);
  await mk(1, id('2', 1)); await mk(2, id('2', 2));
  await db.query(`insert into production_stages (cycle_id, organization_id, name, seq) values ($1,$2,'Việc 1',1)`, [id('3', 1), coop]);
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at) values ($1,$2,$3,(select id from work_types limit 1),now())`, [id('a', 1), coop, id('3', 1)]);
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity) values ($1,$2,$3,now(),100)`, [id('d', 1), coop, id('3', 1)]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',500,current_date)`, [id('e', 1), coop, id('3', 1)]);
  await db.query(`insert into procurement_receipts (id,cooperative_org_id,household_org_id,cycle_id,harvest_id,receipt_date,quantity,unit_price,amount) values ($1,$2,$3,$4,$5,current_date,100,20000,2000000)`, [id('7', 1), coop, hh, id('3', 1), id('d', 1)]);
  return { db, boss, farmer, other, coop, hh, managed };
}
const req = (c, who, n, cyc = 1) => asUser(c.db, who, `select request_cycle_to_own($1,$2,'xin tự quản lý') r`, [id('9', n), id('3', cyc)]);

test('chuyển vụ theo HTX sang vụ riêng: hộ gửi yêu cầu, HTX duyệt; chuyển sản xuất, giữ sổ HTX', async () => {
  const c = await setup();
  assert.match(await expectError(req(c, c.boss, 1)), /FORBIDDEN/);       // HTX không tự gửi thay hộ
  assert.match(await expectError(req(c, c.other, 1)), /FORBIDDEN/);
  await req(c, c.farmer, 1);
  await req(c, c.farmer, 1);                                              // lặp cùng mã: không nhân đôi
  assert.equal((await c.db.query(`select count(*)::int n from cycle_transfer_requests`)).rows[0].n, 1);
  assert.match(await expectError(req(c, c.farmer, 2)), /ALREADY_REQUESTED/);
  // chỉ HTX duyệt; hộ không tự duyệt
  assert.match(await expectError(asUser(c.db, c.farmer, `select decide_cycle_transfer($1,true,null)`, [id('9', 1)])), /FORBIDDEN/);
  await asUser(c.db, c.boss, `select decide_cycle_transfer($1,true,'đồng ý')`, [id('9', 1)]);
  const cy = (await c.db.query(`select owner_org_id from production_cycles where id=$1`, [id('3', 1)])).rows[0];
  assert.equal(cy.owner_org_id, c.hh);
  const org = async (t, k) => (await c.db.query(`select organization_id o from ${t} where ${k}`)).rows[0].o;
  assert.equal(await org('activity_logs', `id='${id('a', 1)}'`), c.hh);
  assert.equal(await org('production_stages', `cycle_id='${id('3', 1)}'`), c.hh);
  assert.equal(await org('harvest_records', `id='${id('d', 1)}'`), c.hh);
  assert.equal(await org('expense_records', `id='${id('e', 1)}'`), c.coop);   // chi phí HTX đã ghi giữ ở sổ HTX
  assert.equal((await c.db.query(`select cooperative_org_id c from procurement_receipts`)).rows[0].c, c.coop);   // phiếu thu mua giữ nguyên
  assert.equal((await c.db.query(`select status from cycle_transfer_requests where id=$1`, [id('9', 1)])).rows[0].status, 'approved');
  // hộ thấy và quản lý được vụ vừa nhận
  assert.equal((await asUser(c.db, c.farmer, `select can_manage_cycle($1) m`, [id('3', 1)])).rows[0].m, true);
  assert.match(await expectError(req(c, c.farmer, 3)), /TRANSFER_BLOCKED/);   // đã là vụ riêng
});

test('điều kiện: hộ do HTX tạo, hết hạn dùng thử, hết hạn mức đều bị chặn; từ chối cần lý do; hộ hủy yêu cầu', async () => {
  const c = await setup();
  assert.match(await expectError(asUser(c.db, c.boss, `select request_cycle_to_own($1,$2,null)`, [id('9', 8), id('3', 2)])), /FORBIDDEN|TRANSFER_BLOCKED/);   // hộ do HTX tạo
  assert.match(await c.db.query(`select cycle_transfer_blocker($1) b`, [id('3', 2)]).then((r) => r.rows[0].b), /do HTX tạo/);
  // hết hạn dùng thử
  await c.db.query(`update subscriptions set period_end = now() - interval '1 day', period_start = now() - interval '100 days' where organization_id=$1`, [c.hh]);
  assert.match(await expectError(req(c, c.farmer, 1)), /gói dịch vụ còn hiệu lực/);
  // mua gói: hết hạn mức (đã đủ số vụ đang chạy của gói)
  await c.db.query(`update subscriptions set status='active', period_start=now()-interval '1 day', period_end=now()+interval '90 days', max_cycles=1 where organization_id=$1`, [c.hh]);
  await c.db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),'active','Vụ riêng sẵn có')`, [id('3', 9), c.hh, id('2', 1)]);
  assert.match(await expectError(req(c, c.farmer, 1)), /Hộ đã dùng 1\/1 vụ/);
  await c.db.query(`update subscriptions set max_cycles=5 where organization_id=$1`, [c.hh]);
  // từ chối cần lý do; hộ hủy yêu cầu rồi gửi lại
  await req(c, c.farmer, 1);
  assert.match(await expectError(asUser(c.db, c.boss, `select decide_cycle_transfer($1,false,'ab')`, [id('9', 1)])), /REASON_REQUIRED/);
  await asUser(c.db, c.boss, `select decide_cycle_transfer($1,false,'chưa đủ điều kiện giám sát')`, [id('9', 1)]);
  assert.equal((await c.db.query(`select status from cycle_transfer_requests where id=$1`, [id('9', 1)])).rows[0].status, 'rejected');
  await req(c, c.farmer, 4);
  await asUser(c.db, c.farmer, `select cancel_cycle_transfer_request($1)`, [id('9', 4)]);
  assert.equal((await c.db.query(`select status from cycle_transfer_requests where id=$1`, [id('9', 4)])).rows[0].status, 'cancelled');
  // gói hết hạn sau khi gửi: lúc duyệt vẫn bị chặn
  await req(c, c.farmer, 5);
  await c.db.query(`update subscriptions set period_end = now() - interval '1 hour', period_start = now() - interval '100 days' where organization_id=$1`, [c.hh]);
  assert.match(await expectError(asUser(c.db, c.boss, `select decide_cycle_transfer($1,true,null)`, [id('9', 5)])), /TRANSFER_BLOCKED/);
});
