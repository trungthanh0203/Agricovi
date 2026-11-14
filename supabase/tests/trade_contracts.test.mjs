import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0202 (mục 13 lát 2): hợp đồng mua bán / bao tiêu mẫu. Bản nháp sửa được; đã ký thì chỉ đổi trạng thái; số hợp đồng tự đánh số.

const PARTNER = '90000000-0000-4000-8000-000000000001';

async function setup() {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2), staff = await addUser(db, 3), outsider = await addUser(db, 4);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ An') id`)).rows[0].id;
  const alien = (await asUser(db, outsider, `select create_organization('household','Hộ ngoài') id`)).rows[0].id;
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv, hh]);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [coop, staff]);
  await db.query(`insert into partners (id,organization_id,name,is_supplier,is_customer) values ($1,$2,'Công ty Xuất khẩu Nông sản',false,true)`, [PARTNER, hh]);
  const crop = (await db.query(`select id from crop_types limit 1`)).rows[0].id;
  const procure = (u, o = {}) => asUser(db, u, `select save_trade_contract($1,$2,'procure',$3,null,$4,$5,$6,$7,null,$8,$9,null,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) r`, [
    coop, o.id ?? null, o.cp ?? hh, o.name ?? 'Hộ An', 'Nguyễn Văn An', '0901234567', 'Ấp 3, Đồng Nai', crop, o.product ?? 'Sầu riêng', o.qty ?? 5000, o.mode ?? 'fixed',
    o.price === undefined ? 80000 : o.price, 'Loại 1, không sâu bệnh', o.from ?? '2026-12-01', o.to ?? '2027-01-15', 'Kho HTX', o.days ?? 7, 'transfer', null, o.valid ?? '2027-02-01']);
  const sale = (u, o = {}) => asUser(db, u, `select save_trade_contract($1,null,'sale',null,$2,$3,null,null,null,null,$4,'Dưa lưới',null,300,'floor',25000,null,null,null,null,null,'either',null,null) r`,
    [hh, o.partner ?? PARTNER, 'Công ty Xuất khẩu Nông sản', crop]);
  const list = async (u, org) => (await asUser(db, u, `select get_trade_contracts($1) r`, [org])).rows[0].r;
  return { db, boss, farmer, staff, outsider, coop, hh, alien, crop, procure, sale, list };
}

test('lập hợp đồng bao tiêu: chỉ HTX có quyền, hộ phải là thành viên, giá cố định cần đơn giá, ngày hợp lệ; tự đánh số HĐ-năm-0001', async () => {
  const c = await setup();
  assert.match(await expectError(c.procure(c.staff)), /FORBIDDEN/);
  assert.match(await expectError(c.procure(c.farmer)), /FORBIDDEN/);
  assert.match(await expectError(c.procure(c.boss, { cp: c.alien })), /NOT_MEMBER/);
  assert.match(await expectError(c.procure(c.boss, { price: null })), /đơn giá/);
  assert.match(await expectError(c.procure(c.boss, { from: '2027-01-10', to: '2027-01-01' })), /INVALID_DATE/);
  assert.match(await expectError(c.procure(c.boss, { from: '2027-03-01', to: '2027-03-10', valid: '2027-01-01' })), /Hạn hợp đồng/);
  const id1 = (await c.procure(c.boss)).rows[0].r;
  const id2 = (await c.procure(c.boss, { mode: 'market', price: null })).rows[0].r;                 // giá thị trường: không cần đơn giá
  const yr = new Date().getFullYear();
  const rows = await c.list(c.boss, c.coop);
  assert.deepEqual(rows.map((x) => x.contract_no).sort(), [`HĐ-${yr}-0001`, `HĐ-${yr}-0002`]);
  assert.equal(rows.find((x) => x.id === id2).unit_price, null);
  assert.equal(Number(rows.find((x) => x.id === id1).unit_price), 80000);
  // nhân viên chưa có quyền HTX và người ngoài: không thấy hợp đồng
  assert.equal((await c.list(c.staff, c.coop)).length, 0);
  assert.match(await expectError(asUser(c.db, c.outsider, `select get_trade_contracts($1)`, [c.coop])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.boss, `select * from trade_contracts`)), /permission denied/i);
});

test('hợp đồng bán cho khách (quyền Doanh thu): cơ sở hộ lập được, khách phải thuộc cơ sở; HTX khác không lập bao tiêu cho hộ', async () => {
  const c = await setup();
  const id = (await c.sale(c.farmer)).rows[0].r;
  const rows = await c.list(c.farmer, c.hh);
  assert.deepEqual([rows.length, rows[0].kind, rows[0].price_mode, Number(rows[0].unit_price)], [1, 'sale', 'floor', 25000]);
  assert.match(await expectError(asUser(c.db, c.boss, `select save_trade_contract($1,null,'sale',null,$2,'X Y',null,null,null,null,null,'Dưa',null,null,'market',null,null,null,null,null,null,'either',null,null)`, [c.coop, PARTNER])), /NOT_FOUND|FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.farmer, `select save_trade_contract($1,null,'procure',$1,null,'Hộ An',null,null,null,null,null,'Dưa',null,null,'market',null,null,null,null,null,null,'either',null,null)`, [c.hh])), /FORBIDDEN|INVALID_CONTRACT/);
  assert.ok(id);
});

test('trạng thái: nháp sửa/xóa được; ký cần ngày hợp lệ; đã ký không sửa điều khoản; hoàn thành chỉ sau khi ký; hủy cần lý do', async () => {
  const c = await setup();
  const id = (await c.procure(c.boss)).rows[0].r;
  await c.procure(c.boss, { id, price: 90000, name: 'Hộ An (sửa)' });                       // sửa bản nháp
  assert.equal(Number((await c.list(c.boss, c.coop))[0].unit_price), 90000);
  assert.match(await expectError(asUser(c.db, c.staff, `select set_trade_contract_status($1,'signed','2026-11-10')`, [id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.boss, `select set_trade_contract_status($1,'signed','2099-01-01')`, [id])), /INVALID_DATE/);
  assert.match(await expectError(asUser(c.db, c.boss, `select set_trade_contract_status($1,'done')`, [id])), /NOT_SIGNED/);
  await asUser(c.db, c.boss, `select set_trade_contract_status($1,'signed','2026-11-10')`, [id]);
  assert.match(await expectError(c.procure(c.boss, { id, price: 95000 })), /NOT_DRAFT/);       // đã ký: không sửa điều khoản
  assert.match(await expectError(asUser(c.db, c.boss, `select delete_trade_contract_draft($1)`, [id])), /NOT_DRAFT/);
  assert.match(await expectError(asUser(c.db, c.boss, `select set_trade_contract_status($1,'cancelled',null,'x')`, [id])), /REASON_REQUIRED/);
  await asUser(c.db, c.boss, `select set_trade_contract_status($1,'done')`, [id]);
  assert.match(await expectError(asUser(c.db, c.boss, `select set_trade_contract_status($1,'cancelled',null,'hủy muộn')`, [id])), /NOT_ALLOWED/);
  const s = (await c.list(c.boss, c.coop))[0];
  assert.deepEqual([s.status, s.signed_on], ['done', '2026-11-10']);
  // nháp khác: xóa được; hợp đồng đã ký khác: hủy kèm lý do
  const d = (await c.procure(c.boss)).rows[0].r;
  await asUser(c.db, c.boss, `select delete_trade_contract_draft($1)`, [d]);
  assert.equal((await c.list(c.boss, c.coop)).length, 1);
  const e = (await c.procure(c.boss)).rows[0].r;
  await asUser(c.db, c.boss, `select set_trade_contract_status($1,'signed','2026-11-11')`, [e]);
  await asUser(c.db, c.boss, `select set_trade_contract_status($1,'cancelled',null,'Hộ không còn sản phẩm')`, [e]);
  assert.equal((await c.list(c.boss, c.coop)).find((x) => x.id === e).cancel_reason, 'Hộ không còn sản phẩm');
});
