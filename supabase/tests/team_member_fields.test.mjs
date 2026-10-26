import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0091: tổ có mô tả + trang trại, sửa/xóa tổ; mô tả nhân sự.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Cơ sở B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const area = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Vườn 1') returning id`, [org])).rows[0].id;
  const area2 = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Vườn khác') returning id`, [org2])).rows[0].id;
  const lw = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Hải','self_hourly') returning id`, [org, wk])).rows[0].id;
  return { db, owner, wk, other, org, area, area2, lw };
}

test('tạo/sửa/xóa tổ với mô tả và trang trại; trang trại phải cùng cơ sở', async () => {
  const { db, owner, wk, org, area, area2, lw } = await setup();
  const t = (await asUser(db, owner, `select create_team($1,'Tổ 1',null,'  Tổ thu hoạch  ',$2) id`, [org, area])).rows[0].id;
  let r = (await db.query(`select name, description, area_id from worker_teams where id=$1`, [t])).rows[0];
  assert.deepEqual([r.name, r.description, r.area_id], ['Tổ 1', 'Tổ thu hoạch', area]);
  assert.match(await expectError(asUser(db, owner, `select create_team($1,'Tổ X',null,null,$2)`, [org, area2])), /INVALID_AREA/);
  assert.match(await expectError(asUser(db, owner, `select update_team($1,'Tổ 1',null,null,$2)`, [t, area2])), /INVALID_AREA/);

  await asUser(db, owner, `select update_team($1,'Tổ 1A',$2,'',null)`, [t, lw]);
  r = (await db.query(`select name, description, area_id, leader_worker_id from worker_teams where id=$1`, [t])).rows[0];
  assert.deepEqual([r.name, r.description, r.area_id, r.leader_worker_id], ['Tổ 1A', null, null, lw]);
  assert.equal((await db.query(`select count(*)::int n from worker_team_memberships where team_id=$1 and worker_id=$2 and valid_to is null`, [t, lw])).rows[0].n, 1);

  assert.match(await expectError(asUser(db, wk, `select archive_team($1)`, [t])), /FORBIDDEN/);
  await asUser(db, owner, `select archive_team($1)`, [t]);
  assert.equal((await db.query(`select is_active from worker_teams where id=$1`, [t])).rows[0].is_active, false);
  assert.equal((await db.query(`select count(*)::int n from worker_team_memberships where team_id=$1 and valid_to is null`, [t])).rows[0].n, 0);
});

test('mô tả nhân sự: chỉ chủ ghi; hiện trong list_org_members', async () => {
  const { db, owner, wk, org } = await setup();
  assert.match(await expectError(asUser(db, wk, `select set_member_description($1,$2,'x')`, [org, wk])), /FORBIDDEN/);
  await asUser(db, owner, `select set_member_description($1,$2,' Lái máy ')`, [org, wk]);
  const rows = (await asUser(db, owner, `select user_id, description from list_org_members($1)`, [org])).rows;
  assert.equal(rows.find((x) => x.user_id === wk).description, 'Lái máy');
  await asUser(db, owner, `select set_member_description($1,$2,'')`, [org, wk]);
  assert.equal((await db.query(`select description from organization_memberships where user_id=$1 and organization_id=$2`, [wk, org])).rows[0].description, null);
});

// Migration 0092: loại khu mới; thông tin hộ thành viên HTX
test('loại khu: crop/livestock/facility/other hợp lệ, growing cũ bị từ chối', async () => {
  const { db, org } = await setup();
  for (const k of ['crop', 'livestock', 'facility', 'other']) await db.query(`insert into production_areas (id,organization_id,name,kind) values (gen_random_uuid(),$1,$2,$2)`, [org, k]);
  assert.match(await expectError(db.query(`insert into production_areas (id,organization_id,name,kind) values (gen_random_uuid(),$1,'X','growing')`, [org])), /check|kind/i);
  assert.equal((await db.query(`select kind from production_areas where organization_id=$1 and name='Vườn 1'`, [org])).rows[0].kind, 'crop'); // mặc định
});

test('hộ thành viên: HTX ghi thông tin, mã hộ không trùng, người ngoài không sửa được', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1), stranger = await addUser(db, 2);
  const C = (await asUser(db, boss, `select create_organization('cooperative','HTX') id`)).rows[0].id;
  const H1 = (await asUser(db, boss, `select create_member_household($1,'Hộ bác Tư') id`, [C])).rows[0].id;
  const H2 = (await asUser(db, boss, `select create_member_household($1,'Hộ bác Năm') id`, [C])).rows[0].id;
  await asUser(db, boss, `select update_coop_household($1,$2,' HV-001 ','Nguyễn Văn Tư','0912345678','Ấp 3','Dưa lưới',1.5,'Ghi chú','paused',' VietGAP, OCOP ')`, [C, H1]);
  const r = (await asUser(db, boss, `select * from list_coop_households($1) where household_org_id=$2`, [C, H1])).rows[0];
  assert.deepEqual([r.member_code, r.head_name, r.phone, r.main_products, Number(r.area_ha), r.activity_status, r.certificates], ['HV-001', 'Nguyễn Văn Tư', '0912345678', 'Dưa lưới', 1.5, 'paused', 'VietGAP, OCOP']);
  assert.match(await expectError(asUser(db, boss, `select update_coop_household($1,$2,null,null,null,null,null,null,null,'xx',null)`, [C, H2])), /INVALID_STATUS/);
  assert.match(await expectError(asUser(db, boss, `select update_coop_household($1,$2,'hv-001',null,null,null,null,null,null)`, [C, H2])), /DUPLICATE_CODE/);
  assert.match(await expectError(asUser(db, stranger, `select update_coop_household($1,$2,'X',null,null,null,null,null,null)`, [C, H1])), /FORBIDDEN/);
});

// Migration 0094: nhóm loại sản phẩm có Thủy sản
test('nhóm loại sản phẩm: cây trồng, vật nuôi, thủy sản, khác hợp lệ; giá trị lạ bị từ chối', async () => {
  const { db, org } = await setup();
  for (const k of ['crop', 'livestock', 'aquatic', 'other']) await db.query(`insert into crop_types (organization_id,code,name,kind) values ($1,$2,$2,$3)`, [org, `t_${k}`, k]);
  assert.match(await expectError(db.query(`insert into crop_types (organization_id,code,name,kind) values ($1,'zz','zz','nuoi')`, [org])), /check|kind/i);
});

// Migration 0095: cấu hình của cơ sở
test('cấu hình cơ sở: chủ/quản lý sửa, thành viên chỉ đọc; nhóm loại sản phẩm đúng 4 mục; làm sạch danh sách', async () => {
  const { db, owner, wk, other, org } = await setup();
  assert.match(await expectError(asUser(db, wk, `select set_org_config($1,'housing',array['Kín'])`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_org_config($1,'housing',array['Kín'])`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'khac',array['a'])`, [org])), /INVALID_KEY/);
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'product_groups',array['A','B','C'])`, [org])), /INVALID_KEY/); // nhóm có mã đi qua set_org_entries
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'housing',array[' ',''])`, [org])), /INVALID_ITEMS/);
  await asUser(db, owner, `select set_org_config($1,'housing',array[' Kín ','Hở','Kín','Nửa kín hở'])`, [org]);
  assert.deepEqual((await asUser(db, wk, `select items from org_config where organization_id=$1 and key='housing'`, [org])).rows[0].items, ['Kín', 'Hở', 'Nửa kín hở']);
  assert.equal((await asUser(db, other, `select count(*)::int n from org_config where organization_id=$1`, [org])).rows[0].n, 0); // cơ sở khác không đọc được
  await db.query(`insert into production_areas (id,organization_id,name,kind,housing) values (gen_random_uuid(),$1,'A','aquatic','Nửa kín hở')`, [org]);
});

// Migration 0097: nhóm vật tư đúng 8 mục
test('cấu hình nhóm vật tư: đúng 8 mục', async () => {
  const { db, owner, org } = await setup();
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'material_groups',array['A','B'])`, [org])), /INVALID_KEY/);
});

// Migration 0098: nhóm có mã, thêm/bớt/dừng
const ENT = (arr) => JSON.stringify(arr);
const PG = [['crop', 'Cây trồng'], ['livestock', 'Vật nuôi'], ['aquatic', 'Thủy sản'], ['other', 'Khác']].map(([code, label]) => ({ code, label, active: true }));

test('nhóm có mã: thêm mục tự thêm, không xóa mục có sẵn, dừng được, xóa mục đang dùng bị chặn', async () => {
  const { db, owner, wk, org } = await setup();
  const set = (arr, who = owner) => asUser(db, who, `select set_org_entries($1,'product_groups',$2::jsonb)`, [org, ENT(arr)]);
  assert.match(await expectError(set(PG, wk)), /FORBIDDEN/);
  assert.match(await expectError(set(PG.slice(0, 3))), /không xóa được/); // thiếu mục có sẵn
  assert.match(await expectError(set([...PG, { code: 'c_1', label: 'Gia cầm' }])), /tính như/); // thiếu base
  assert.match(await expectError(set([...PG, { code: 'c_1', label: 'vật nuôi', base: 'livestock' }])), /trùng/);
  assert.match(await expectError(set(PG.map((x) => ({ ...x, active: false })))), /ít nhất một mục/);

  const withCustom = [...PG, { code: 'c_gc', label: 'Gia cầm', base: 'livestock', active: true }];
  await set(withCustom);
  const saved = (await asUser(db, wk, `select entries from org_config where organization_id=$1 and key='product_groups'`, [org])).rows[0].entries;
  assert.deepEqual(saved.find((x) => x.code === 'c_gc'), { code: 'c_gc', label: 'Gia cầm', base: 'livestock', active: true });
  assert.equal(saved.find((x) => x.code === 'livestock').base, 'livestock');

  // dùng mục tự thêm
  await db.query(`insert into production_areas (id,organization_id,name,kind,kind_item) values (gen_random_uuid(),$1,'Chuồng gà','livestock','c_gc')`, [org]);
  assert.match(await expectError(set(PG)), /đang được dùng/); // xóa mục đang dùng
  await set(withCustom.map((x) => (x.code === 'c_gc' ? { ...x, active: false } : x))); // dừng thì được
  await db.query(`delete from production_areas where organization_id=$1`, [org]);
  await set(PG); // chưa ai dùng thì xóa được
});

test('nhóm vật tư có mã: mục tự thêm tính như một nhóm gốc; mục đang dùng không xóa được', async () => {
  const { db, owner, org } = await setup();
  const MG = ['feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other'].map((code) => ({ code, label: code, active: true }));
  const set = (arr) => asUser(db, owner, `select set_org_entries($1,'material_groups',$2::jsonb)`, [org, ENT(arr)]);
  await set([...MG, { code: 'c_cam', label: 'Cám đậm đặc', base: 'feed', active: true }]);
  const unit = (await db.query(`select id from units_of_measure limit 1`)).rows[0].id;
  await db.query(`insert into materials (id,organization_id,name,base_unit_id,material_group,group_item) values (gen_random_uuid(),$1,'Cám 1',$2,'feed','c_cam')`, [org, unit]);
  assert.match(await expectError(set(MG)), /đang được dùng/);
});

// Migration 0096: kho theo trang trại
test('kho dùng cho trang trại nào: rỗng = tất cả; trang trại phải cùng cơ sở', async () => {
  const { db, owner, org, area, area2 } = await setup();
  const loc = (await db.query(`insert into inventory_locations (id,organization_id,name) values (gen_random_uuid(),$1,'Kho chính') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `update inventory_locations set area_ids=array[$2::uuid] where id=$1`, [loc, area]);
  assert.deepEqual((await db.query(`select area_ids from inventory_locations where id=$1`, [loc])).rows[0].area_ids, [area]);
  assert.match(await expectError(asUser(db, owner, `update inventory_locations set area_ids=array[$2::uuid] where id=$1`, [loc, area2])), /INVALID_AREA/);
  await asUser(db, owner, `update inventory_locations set area_ids='{}' where id=$1`, [loc]);
  assert.equal((await db.query(`select area_ids from inventory_locations where id=$1`, [loc])).rows[0].area_ids, null);
});

// Migration 0099: loại khách là chữ tự do lấy từ cấu hình
test('loại khách hàng: cấu hình tự do; cột lưu chữ, tối đa 40 ký tự', async () => {
  const { db, owner, wk, org } = await setup();
  assert.match(await expectError(asUser(db, wk, `select set_org_config($1,'customer_kinds',array['Quán ăn'])`, [org])), /FORBIDDEN/);
  await asUser(db, owner, `select set_org_config($1,'customer_kinds',array['Quán ăn','Chợ đầu mối'])`, [org]);
  await db.query(`insert into partners (id,organization_id,name,is_customer,customer_kind) values (gen_random_uuid(),$1,'Khách A',true,'Quán ăn')`, [org]);
  assert.match(await expectError(db.query(`insert into partners (id,organization_id,name,is_customer,customer_kind) values (gen_random_uuid(),$1,'Khách B',true,repeat('x',41))`, [org])), /check|customer_kind/i);
});
