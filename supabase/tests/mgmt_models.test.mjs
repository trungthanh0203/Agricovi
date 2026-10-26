import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { MODELS, SECTION_FEATURE, effectiveModel, featuresOf, featureShown, mergeFeatures, suggestModel } from '../../apps/app/src/lib/models.ts';

// Phần A (lib/models.ts, thuần) và phần B (migration 0102): mô hình quản lý theo vụ, người làm lương tháng không tài khoản.

test('mô hình: 4 mô hình, mô hình lớn hơn không mất chức năng của mô hình nhỏ; VietGAP bật thêm ghi việc và các sổ', () => {
  assert.deepEqual(MODELS.map((m) => m.id), ['family', 'monthly', 'managed', 'staffed']);
  const order = ['family', 'monthly', 'managed', 'staffed'];
  const rank = { off: 0, optional: 1, on: 2 };
  for (let i = 1; i < order.length; i++) {
    const a = featuresOf(order[i - 1], false), b = featuresOf(order[i], false);
    for (const k of Object.keys(a)) assert.ok(rank[b[k]] >= rank[a[k]], `${order[i]} phải có ${k} như ${order[i - 1]}`);
  }
  // quyết định chủ sản phẩm: bán qua website từ mô hình 2 trở đi; mô hình 1 không có
  assert.equal(featuresOf('family', false).web, 'off');
  for (const m of order.slice(1)) assert.equal(featuresOf(m, false).web, 'on');
  assert.equal(featuresOf('family', false).logs, 'optional'); // ghi việc nhẹ tùy chọn
  assert.equal(featuresOf('staffed', false).attendance, 'on');
  assert.equal(featuresOf('monthly', false).attendance, 'off');
  const vg = featuresOf('family', true);
  for (const k of ['logs', 'logbook', 'checklist', 'licenses', 'lots']) assert.equal(vg[k], 'on', k);
  assert.equal(featuresOf('family', false).logbook, 'off');
});

test('mô hình: cơ sở/vụ chưa chọn giữ cách cũ; gộp nhiều vụ lấy mức cao nhất; mục menu đều có chức năng hợp lệ', () => {
  assert.equal(effectiveModel('managed', 'family', false), 'managed'); // vụ ưu tiên
  assert.equal(effectiveModel(null, 'family', false), 'family');       // theo cơ sở
  assert.equal(effectiveModel(null, null, true), 'family');            // chế độ đơn giản cũ
  assert.equal(effectiveModel(null, null, false), 'staffed');          // đầy đủ cũ
  assert.equal(effectiveModel('lạ', 'lạ', false), 'staffed');          // giá trị lạ bị bỏ qua
  const u = mergeFeatures([featuresOf('family', false), featuresOf('managed', false)]);
  assert.equal(u.stock, 'on');
  assert.equal(u.teams, 'off');
  assert.ok(featureShown(u.logs) && !featureShown(u.custom_reports));
  const feats = new Set(Object.keys(featuresOf('family', false)));
  for (const [sec, f] of Object.entries(SECTION_FEATURE)) assert.ok(f === null || feats.has(f), `${sec} -> ${f}`);
});

test('gợi ý mô hình theo tình hình cơ sở', () => {
  assert.equal(suggestModel({ accounts: 0, hasManager: false, offlineWorkers: 0 }), 'family');
  assert.equal(suggestModel({ accounts: 0, hasManager: false, offlineWorkers: 2 }), 'monthly');
  assert.equal(suggestModel({ accounts: 2, hasManager: true, offlineWorkers: 0 }), 'managed');
  assert.equal(suggestModel({ accounts: 6, hasManager: true, offlineWorkers: 0 }), 'staffed');
});

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), worker = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, worker]);
  const area = id('2', 1), cyc = id('3', 1);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu 1')`, [area, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [cyc, org, area]);
  return { db, owner, mgr, worker, other, org, cyc };
}

test('đặt mô hình: cơ sở chỉ chủ; vụ chủ hoặc quản lý; nhân viên và người ngoài bị chặn; giá trị lạ bị từ chối', async () => {
  const { db, owner, mgr, worker, other, org, cyc } = await setup();
  await asUser(db, owner, `select set_org_model($1,'monthly',true)`, [org]);
  assert.deepEqual((await db.query(`select mgmt_model, mgmt_vietgap from organizations where id=$1`, [org])).rows[0], { mgmt_model: 'monthly', mgmt_vietgap: true });
  assert.match(await expectError(asUser(db, mgr, `select set_org_model($1,'family',false)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_org_model($1,'xxx',false)`, [org])), /INVALID_MODEL/);

  await asUser(db, mgr, `select set_cycle_model($1,'managed',false)`, [cyc]);
  assert.deepEqual((await db.query(`select mgmt_model, mgmt_vietgap from production_cycles where id=$1`, [cyc])).rows[0], { mgmt_model: 'managed', mgmt_vietgap: false });
  await asUser(db, owner, `select set_cycle_model($1,'family',null)`, [cyc]); // đổi sang mô hình khác được; null = theo cơ sở
  assert.equal((await db.query(`select mgmt_model, mgmt_vietgap from production_cycles where id=$1`, [cyc])).rows[0].mgmt_vietgap, null);
  assert.match(await expectError(asUser(db, worker, `select set_cycle_model($1,'staffed',false)`, [cyc])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_cycle_model($1,'staffed',false)`, [cyc])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_cycle_model($1,'khac',false)`, [cyc])), /INVALID_MODEL/);
  await asUser(db, owner, `select set_cycle_model($1,null,null)`, [cyc]); // bỏ chọn
});

test('người làm không tài khoản lương tháng: không cần tổ; kiểu do tổ trưởng chấm vẫn bắt buộc có tổ', async () => {
  const { db, owner, org } = await setup();
  const w = (await asUser(db, owner, `select create_worker_without_account($1,'Chị Hoa','0912345678','monthly_salary',null) id`, [org])).rows[0].id;
  assert.deepEqual((await db.query(`select work_mode, user_id from worker_profiles where id=$1`, [w])).rows[0], { work_mode: 'monthly_salary', user_id: null });
  assert.equal((await db.query(`select count(*)::int n from worker_team_memberships where worker_id=$1`, [w])).rows[0].n, 0);
  assert.match(await expectError(asUser(db, owner, `select create_worker_without_account($1,'Anh Ba',null,'leader_hourly',null)`, [org])), /TEAM_REQUIRED/);
  assert.match(await expectError(asUser(db, owner, `select create_worker_without_account($1,'Anh Ba',null,'self_hourly',null)`, [org])), /INVALID_MODE/);
  // đơn giá lương tháng đặt được cho người này (dùng chung bảng đơn giá)
  await asUser(db, owner, `insert into work_rates (organization_id, worker_id, rate_type, amount, valid_from) values ($1,$2,'month',7000000,current_date)`, [org, w]);
});
