import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0078 (D96): thời gian cách ly. Dùng thuốc có cách ly thì thu hoạch/bán trong thời gian đó phải ghi lý do.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000a1';
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [CYC, org, area, tpl]);
  const unit = (await db.query(`select id from units_of_measure limit 1`)).rows[0].id;
  const mat = (await db.query(`insert into materials (organization_id,name,base_unit_id,withdrawal_days) values ($1,'Radiant 60SC',$2,7) returning id`, [org, unit])).rows[0].id;
  const loc = (await db.query(`insert into inventory_locations (organization_id,name) values ($1,'Kho') returning id`, [org])).rows[0].id;
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date) values ($1,$2,$3,$4,'receipt',10,'2026-10-01')`, [id('a', 1), org, loc, mat]);
  const issue = (n, date) => db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id) values ($1,$2,$3,$4,'issue',-1,$5,$6)`, [id('a', n), org, loc, mat, date, CYC]);
  return { db, owner, wk, org, mat, issue };
}
const harvest = (c, u, date, reason = null, n = 1) => asUser(c.db, u, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,withdrawal_reason) values ($1,$2,$3,$4::timestamptz,100,$5)`, [id('d', n), c.org, CYC, `${date} 07:00+07`, reason]);

test('dùng thuốc có cách ly: bảng tóm tắt đúng; hủy nhật ký thì bỏ', async () => {
  const c = await setup();
  assert.equal((await c.db.query(`select count(*)::int n from cycle_withdrawal`)).rows[0].n, 0);
  await c.issue(2, '2026-10-20');
  await c.issue(3, '2026-10-22');
  const w = (await asUser(c.db, c.owner, `select safe_date::text s, jsonb_array_length(items) n from cycle_withdrawal where cycle_id=$1`, [CYC])).rows[0];
  assert.deepEqual([w.s, w.n], ['2026-10-29', 2]);
  assert.equal((await asUser(c.db, c.wk, `select count(*)::int n from cycle_withdrawal`)).rows[0].n, 1);
  assert.match(await expectError(asUser(c.db, c.owner, `update cycle_withdrawal set safe_date='2026-01-01'`)), /permission denied|row-level/i);
  // đổi số ngày cách ly của vật tư thì tính lại
  await c.db.query(`update materials set withdrawal_days = 14 where id = $1`, [c.mat]);
  assert.equal((await c.db.query(`select safe_date::text s from cycle_withdrawal`)).rows[0].s, '2026-11-05');
});

test('thu hoạch trong thời gian cách ly phải ghi lý do; ngoài thời gian hoặc trước lần phun thì không', async () => {
  const c = await setup();
  await c.issue(2, '2026-10-20'); // cách ly 7 ngày: đến 2026-10-27
  await harvest(c, c.owner, '2026-10-19', null, 1);   // trước lần phun: không vi phạm
  await harvest(c, c.owner, '2026-10-27', null, 2);   // đúng ngày hết cách ly: được
  assert.match(await expectError(harvest(c, c.owner, '2026-10-25', null, 3)), /WITHDRAWAL_REASON.*27\/10\/2026.*Radiant 60SC/);
  assert.match(await expectError(harvest(c, c.owner, '2026-10-25', 'ok', 3)), /WITHDRAWAL_REASON/);
  await harvest(c, c.owner, '2026-10-25', 'Đã kiểm tra dư lượng, đạt', 3);
  assert.equal((await c.db.query(`select withdrawal_reason r from harvest_records where id=$1`, [id('d', 3)])).rows[0].r, 'Đã kiểm tra dư lượng, đạt');
  // đổi ngày phiếu cũ vào thời gian cách ly mà không có lý do thì bị chặn; hủy phiếu thì không
  assert.match(await expectError(c.db.query(`update harvest_records set harvested_at='2026-10-24 07:00+07' where id=$1`, [id('d', 1)])), /WITHDRAWAL_REASON/);
  await c.db.query(`update harvest_records set voided_at=now(), void_reason='nhầm' where id=$1`, [id('d', 2)]);
});

test('bán trong thời gian cách ly: ghi trực tiếp và qua record_sale đều cần lý do; đơn website được miễn', async () => {
  const c = await setup();
  await c.issue(2, '2026-10-20');
  const sale = (date, reason, n) => asUser(c.db, c.owner, `insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount,withdrawal_reason) values ($1,$2,$3,$4::date,10,100000,$5)`, [id('c', n), c.org, CYC, date, reason]);
  assert.match(await expectError(sale('2026-10-23', null, 1)), /WITHDRAWAL_REASON/);
  await sale('2026-10-23', 'Hàng thu trước khi phun', 1);
  await sale('2026-10-28', null, 2);
  const partner = (await c.db.query(`insert into partners (id,organization_id,name,is_supplier,is_customer) values ($1,$2,'Khách A',false,true) returning id`, [id('7', 1), c.org]));
  assert.ok(partner.rows[0].id);
  {
    const rs = (n, reason) => asUser(c.db, c.owner, `select * from record_sale($1,$2,$3,'2026-10-23'::date,5,50000,null,$4,null,null,0,'cash',$5)`, [id('9', n), c.org, CYC, id('7', 1), reason]);
    assert.match(await expectError(rs(1, null)), /WITHDRAWAL_REASON/);
    await rs(2, 'Khách nhận sau cách ly');
    assert.equal((await c.db.query(`select withdrawal_reason r from sales_records where id=$1`, [id('9', 2)])).rows[0].r, 'Khách nhận sau cách ly');
  }
});
