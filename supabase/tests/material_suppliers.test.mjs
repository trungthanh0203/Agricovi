import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0188: nhà cung cấp theo vật tư (giống) — từ hóa đơn mua và từ liên kết do người dùng chọn.
test('get_material_suppliers: từ hóa đơn + liên kết; bỏ hóa đơn đã hủy; quyền và cô lập cơ sở', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), stranger = await addUser(db, 2), worker = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const other = (await asUser(db, stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const unit = (await db.query(`select id from units_of_measure limit 1`)).rows[0].id;
  const mat = (await db.query(`insert into materials (id, organization_id, name, base_unit_id, material_group) values (gen_random_uuid(),$1,'Hạt dưa Kim Cô Nương',$2,'seed') returning id`, [org, unit])).rows[0].id;
  const mat2 = (await db.query(`insert into materials (id, organization_id, name, base_unit_id) values (gen_random_uuid(),$1,'Vật tư khác',$2) returning id`, [org, unit])).rows[0].id;
  const loc = (await db.query(`insert into inventory_locations (organization_id, name) values ($1,'Kho') returning id`, [org])).rows[0].id;
  const mkp = async (name) => (await db.query(`insert into partners (id, organization_id, name, is_supplier) values (gen_random_uuid(),$1,$2,true) returning id`, [org, name])).rows[0].id;
  const pA = await mkp('Đại lý A'), pB = await mkp('Đại lý B'), pC = await mkp('Đại lý C'), pD = await mkp('Đại lý D (chưa liên quan)');
  const bill = async (partner, date, material, voided = false) => {
    const id = (await db.query(`insert into purchase_bills (id, organization_id, partner_id, bill_date, total_amount) values (gen_random_uuid(),$1,$2,$3,1000) returning id`, [org, partner, date])).rows[0].id;
    await db.query(`insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, bill_id) values (gen_random_uuid(),$1,$2,$3,'receipt',1,$4,$5)`, [org, loc, material, date, id]);
    if (voided) await db.query(`update purchase_bills set voided_at = now(), void_reason = 'nhầm' where id = $1`, [id]);
  };
  await bill(pA, '2026-09-01', mat); await bill(pA, '2026-10-01', mat); await bill(pB, '2026-08-01', mat);
  await bill(pC, '2026-10-05', mat, true);        // hóa đơn đã hủy: không tính
  await bill(pD, '2026-10-05', mat2);             // mua vật tư khác: không tính
  const get = (who, o = org, m = mat) => asUser(db, who, `select get_material_suppliers($1,$2) r`, [o, m]).then((r) => r.rows[0].r);

  let r = await get(owner);
  assert.deepEqual(r.map((x) => [x.name, Number(x.purchases)]), [['Đại lý A', 2], ['Đại lý B', 1]]);   // nhiều lần mua nhất trước
  assert.equal(r[0].last_date, '2026-10-01');

  // liên kết thủ công: nhà cung cấp chưa từng mua cũng hiện (sau cùng), gọi lặp không nhân đôi
  await asUser(db, owner, `select link_material_supplier($1,$2,$3)`, [org, mat, pC]);
  await asUser(db, owner, `select link_material_supplier($1,$2,$3)`, [org, mat, pC]);
  r = await get(owner);
  assert.deepEqual(r.map((x) => x.name), ['Đại lý A', 'Đại lý B', 'Đại lý C']);
  assert.equal((await db.query(`select count(*)::int n from material_suppliers`)).rows[0].n, 1);

  // quyền: nhân viên không xem Chi phí; người ngoài bị từ chối; nhà cung cấp/vật tư của cơ sở khác bị từ chối
  assert.match(await expectError(get(worker)), /FORBIDDEN/);
  assert.match(await expectError(get(stranger)), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, worker, `select link_material_supplier($1,$2,$3)`, [org, mat, pA])), /FORBIDDEN/);
  const alien = (await db.query(`insert into partners (id, organization_id, name, is_supplier) values (gen_random_uuid(),$1,'Của hộ B',true) returning id`, [other])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select link_material_supplier($1,$2,$3)`, [org, mat, alien])), /NOT_FOUND/);
  assert.match(await expectError(get(owner, org, '00000000-0000-4000-8000-000000000001')), /NOT_FOUND/);
});
