// Kiểm thử script xóa dữ liệu thử (supabase/maintenance/wipe_all_data.sql): xóa sạch dữ liệu của người dùng,
// giữ danh mục dùng chung, và dùng lại được ngay sau đó.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

const script = readFileSync(new URL('../maintenance/wipe_all_data.sql', import.meta.url), 'utf8');
const armed = script.replace("v_confirm constant text := 'KHONG'", "v_confirm constant text := 'XOA-HET'");
const n = async (db, sql) => (await db.query(sql)).rows[0].n;

async function populated() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await db.query(`insert into production_areas (id,organization_id,name) values ('20000000-0000-4000-8000-0000000000f1',$1,'N1')`, [org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-0000000000f1',$1,'20000000-0000-4000-8000-0000000000f1',(select id from crop_types limit 1),'active')`, [org]);
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by) values ('40000000-0000-4000-8000-0000000000f1',$1,'30000000-0000-4000-8000-0000000000f1',(select id from work_types where code='irrigation'),now(),$2)`, [org, worker]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ('50000000-0000-4000-8000-0000000000f1',$1,'Kho')`, [org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ('60000000-0000-4000-8000-0000000000f1',$1,'Phân',(select id from units_of_measure where code='kg'))`, [org]);
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date) values ('70000000-0000-4000-8000-0000000000f1',$1,'50000000-0000-4000-8000-0000000000f1','60000000-0000-4000-8000-0000000000f1','receipt',5,current_date)`, [org]);
  await db.query(`insert into work_types (organization_id,code,name) values ($1,'tu_dinh_nghia','Việc riêng')`, [org]);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [owner]);
  return { db };
}

test('chưa đổi dòng xác nhận thì script từ chối chạy và không xóa gì', async () => {
  const { db } = await populated();
  assert.match(await expectError(db.exec(script)), /DUNG LAI/);
  assert.equal(await n(db, `select count(*)::int n from organizations`), 1);
  assert.equal(await n(db, `select count(*)::int n from auth.users`), 2);
});

test('xóa sạch dữ liệu người dùng, giữ danh mục dùng chung, rồi dùng lại được ngay', async () => {
  const { db } = await populated();
  const shared = async () => ({
    crop: await n(db, `select count(*)::int n from crop_types`),
    wt: await n(db, `select count(*)::int n from work_types where organization_id is null`),
    units: await n(db, `select count(*)::int n from units_of_measure where organization_id is null`),
    plans: await n(db, `select count(*)::int n from plan_tiers`),
    settings: await n(db, `select count(*)::int n from platform_settings`),
  });
  const before = await shared();
  await db.exec(armed);

  for (const t of ['organizations', 'organization_memberships', 'production_areas', 'production_cycles', 'activity_logs',
    'inventory_locations', 'materials', 'inventory_transactions', 'subscriptions', 'audit_events', 'platform_admins']) {
    assert.equal(await n(db, `select count(*)::int n from ${t}`), 0, `${t} phải trống`);
  }
  assert.equal(await n(db, `select count(*)::int n from auth.users`), 0);
  assert.equal(await n(db, `select count(*)::int n from work_types where organization_id is not null`), 0, 'loại việc riêng của cơ sở bị xóa');
  assert.deepEqual(await shared(), before, 'danh mục dùng chung còn nguyên');

  // dùng lại: đăng ký mới, tạo cơ sở (tự cấp gói dùng thử từ bảng gói), tạo khu trồng và vụ
  const u = await addUser(db, 9);
  const org = (await asUser(db, u, `select create_organization('household','Hộ mới') id`)).rows[0].id;
  assert.equal(await n(db, `select count(*)::int n from subscriptions`), 1);
  await asUser(db, u, `insert into production_areas (id,organization_id,name) values ('20000000-0000-4000-8000-0000000000f9',$1,'N1')`, [org]);
  await asUser(db, u, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-0000000000f9',$1,'20000000-0000-4000-8000-0000000000f9',(select id from crop_types limit 1),'active')`, [org]);
  assert.equal(await n(db, `select count(*)::int n from production_cycles`), 1);
});
