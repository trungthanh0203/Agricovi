import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// D148: HTX quản lý hộ thành viên: đồng ý chia sẻ, danh mục bao tiêu, hạn mức theo gói của hộ, tổng quan sản xuất cho HTX.
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2), other = await addUser(db, 3);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ tự đăng ký') id`)).rows[0].id;
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  // hộ có một khu và một vụ riêng với vài việc/thu hoạch
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Vườn hộ')`, [id('2', 1), hh]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name,start_date) values ($1,$2,$3,(select id from crop_types limit 1),'active','Vụ riêng của hộ',current_date)`, [id('3', 1), hh, id('2', 1)]);
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity) values ($1,$2,$3,now(),120)`, [id('d', 1), hh, id('3', 1)]);
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at) values ($1,$2,$3,(select id from work_types limit 1),now())`, [id('a', 1), hh, id('3', 1)]);
  return { db, boss, farmer, other, coop, hh, inv };
}

test('đồng ý chia sẻ: HTX chỉ xem tổng quan hộ khi hộ đồng ý; hộ đổi được; người ngoài bị chặn', async () => {
  const c = await setup();
  await asUser(c.db, c.farmer, `select accept_coop_invitation($1,$2,false)`, [c.inv, c.hh]);   // không bao tiêu: hộ được chọn không chia sẻ
  const sh = (await asUser(c.db, c.farmer, `select * from my_coop_sharing($1)`, [c.hh])).rows[0];
  assert.deepEqual([sh.coop_name, sh.share_production, sh.required], ['HTX A', false, false]);
  const o1 = (await asUser(c.db, c.boss, `select coop_household_overview($1,$2) r`, [c.coop, c.hh])).rows[0].r;
  assert.equal(o1.shared, false); assert.equal(o1.cycles.length, 0);

  await asUser(c.db, c.farmer, `select set_coop_sharing($1,true)`, [c.hh]);
  const o2 = (await asUser(c.db, c.boss, `select coop_household_overview($1,$2) r`, [c.coop, c.hh])).rows[0].r;
  assert.equal(o2.shared, true); assert.equal(o2.cycles.length, 1);
  const cy = o2.cycles[0];
  assert.deepEqual([cy.kind, cy.status, Number(cy.harvest_kg), Number(cy.logs_30d)], ['own', 'active', 120, 1]);

  // thu hồi có hiệu lực ngay; người ngoài/hộ gọi hàm của HTX bị chặn
  await asUser(c.db, c.farmer, `select set_coop_sharing($1,false)`, [c.hh]);
  assert.equal((await asUser(c.db, c.boss, `select coop_household_overview($1,$2) r`, [c.coop, c.hh])).rows[0].r.shared, false);
  assert.match(await expectError(asUser(c.db, c.farmer, `select coop_household_overview($1,$2)`, [c.coop, c.hh])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.other, `select coop_household_overview($1,$2)`, [c.coop, c.hh])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.other, `select set_coop_sharing($1,true)`, [c.hh])), /FORBIDDEN/);
});

test('danh mục bao tiêu: chỉ HTX sửa; có danh mục thì hộ bắt buộc chia sẻ sản xuất', async () => {
  const c = await setup();
  const crop = (await c.db.query(`select id from crop_types limit 1`)).rows[0].id;
  assert.match(await expectError(asUser(c.db, c.farmer, `select save_procurement_item($1,$2,25000,true)`, [c.coop, crop])), /FORBIDDEN/);
  await asUser(c.db, c.boss, `select save_procurement_item($1,$2,25000,true)`, [c.coop, crop]);
  await asUser(c.db, c.boss, `select save_procurement_item($1,$2,26000,true)`, [c.coop, crop]);   // lưu lại là cập nhật, không nhân đôi
  assert.equal((await c.db.query(`select count(*)::int n from coop_procurement_items`)).rows[0].n, 1);
  // hộ nhập HTX khi đã có danh mục: bắt buộc chia sẻ dù chọn false
  await asUser(c.db, c.farmer, `select accept_coop_invitation($1,$2,false)`, [c.inv, c.hh]);
  const sh = (await asUser(c.db, c.farmer, `select * from my_coop_sharing($1)`, [c.hh])).rows[0];
  assert.deepEqual([sh.share_production, sh.required], [true, true]);
  assert.match(await expectError(asUser(c.db, c.farmer, `select set_coop_sharing($1,false)`, [c.hh])), /SHARING_REQUIRED/);
  const items = (await asUser(c.db, c.farmer, `select * from my_coop_procurement($1)`, [c.hh])).rows;
  assert.equal(items.length, 1); assert.equal(Number(items[0].ref_price_per_kg), 26000);
  // bỏ khỏi danh mục thì không còn bắt buộc
  await asUser(c.db, c.boss, `select save_procurement_item($1,$2,26000,false)`, [c.coop, crop]);
  await asUser(c.db, c.farmer, `select set_coop_sharing($1,false)`, [c.hh]);
});

test('hạn mức: hộ trong HTX chưa có gói trả phí chỉ tạo vụ theo HTX; có gói trả phí thì chọn được', async () => {
  const c = await setup();
  const ctx = async () => (await asUser(c.db, c.farmer, `select kind, allowed, is_default from quota_contexts($1)`, [c.hh])).rows;
  // chưa vào HTX: chỉ có ngữ cảnh riêng
  assert.deepEqual(await ctx(), [{ kind: 'own', allowed: true, is_default: true }]);
  await asUser(c.db, c.farmer, `select accept_coop_invitation($1,$2)`, [c.inv, c.hh]);
  const t = await ctx();
  assert.deepEqual(t.map((x) => [x.kind, x.allowed, x.is_default]), [['own', false, false], ['cooperative', true, true]]);
  // tạo vụ riêng bị chặn ở CSDL
  await c.db.query(`select set_config('agri.legacy_cycle_insert','on',false)`);
  const mk = (n) => asUser(c.db, c.farmer, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),'preparing','V')`, [id('3', n), c.hh, id('2', 1)]);
  assert.match(await expectError(mk(5)), /COOP_MEMBER_USE_COOP/);
  // hộ mua gói trả phí riêng: được chọn
  await c.db.query(`update subscriptions set status='active', price_per_quarter=300000, period_start=now()-interval '1 day', period_end=now()+interval '90 days' where organization_id=$1`, [c.hh]);
  const p = await ctx();
  assert.deepEqual(p.map((x) => [x.kind, x.allowed, x.is_default]), [['own', true, true], ['cooperative', true, false]]);
  await mk(6);
});
