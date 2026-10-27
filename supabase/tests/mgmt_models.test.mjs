import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { nextSteps } from '../../apps/app/src/lib/nextSteps.ts';
import { MODELS, SECTION_FEATURE, modelDef, optionalOf, allFeaturesOn, effectiveModel, featuresOf, featureShown, mergeFeatures, modelName, orgFeatures, suggestModel } from '../../apps/app/src/lib/models.ts';
import { declareSections, productionSections, reportSections } from '../../apps/app/src/lib/tabs.ts';

// Phần A (lib/models.ts, thuần), tích hợp với menu (lib/tabs.ts) và phần B (migrations 0102-0103): mô hình quản lý theo vụ, người làm lương tháng không tài khoản.

test('mô hình: 5 mô hình, mô hình sau có đủ chức năng của mô hình trước; VietGAP là mô hình riêng', () => {
  const order = ['family', 'monthly', 'managed', 'staffed', 'vietgap'];
  assert.deepEqual(MODELS.map((m) => m.id), order);
  const rank = { off: 0, optional: 1, on: 2 };
  for (let i = 1; i < order.length; i++) {
    const a = featuresOf(order[i - 1]), b = featuresOf(order[i]);
    for (const k of Object.keys(a)) assert.ok(rank[b[k]] >= rank[a[k]], `${order[i]} phải có ${k} như ${order[i - 1]}`);
  }
  assert.equal(featuresOf('family').web, 'off'); // bán qua website từ mô hình 2 trở đi
  for (const m of order.slice(1)) assert.equal(featuresOf(m).web, 'on');
  for (const m of order) assert.equal(featuresOf(m).logs, 'on', `${m}: Ghi việc luôn hiện`); // quyết định chủ sản phẩm: không ẩn Ghi việc ở mô hình nào
  assert.equal(featuresOf('family', ['stock']).stock, 'off'); // chỉ bật được mục tùy chọn của chính mô hình
  assert.deepEqual(optionalOf('family'), []);
  assert.deepEqual(optionalOf('monthly'), ['stock', 'partners']);
  assert.deepEqual(optionalOf('staffed'), []);
  assert.equal(featuresOf('staffed').attendance, 'on');
  assert.equal(featuresOf('monthly').attendance, 'off');
  for (const k of ['logs', 'logbook', 'checklist', 'licenses', 'lots']) assert.equal(featuresOf('vietgap')[k], 'on', k);
  assert.equal(featuresOf('staffed').logbook, 'off'); // sổ nhật ký, bảng kiểm thuộc Chuẩn VietGAP
});

test('mô hình: chưa chọn = đầy đủ; vụ ưu tiên hơn cơ sở; cơ sở hợp các vụ còn chạy; mục menu đều có chức năng hợp lệ', () => {
  assert.equal(effectiveModel('managed', 'family'), 'managed');
  assert.equal(effectiveModel(null, 'family'), 'family');
  assert.equal(effectiveModel(null, null), null);
  assert.equal(effectiveModel('lạ', 'lạ'), null);
  assert.deepEqual(featuresOf(null), allFeaturesOn());
  const u = mergeFeatures([featuresOf('family'), featuresOf('managed')]);
  assert.equal(u.stock, 'on');
  assert.equal(u.teams, 'off');
  assert.ok(featureShown(u.logs) && !featureShown(u.custom_reports));

  const cy = (model, status = 'active', org = 'O') => ({ owner_org_id: org, status, mgmt_model: model });
  assert.deepEqual(orgFeatures([], 'O', null), allFeaturesOn()); // chưa có vụ, chưa chọn gì: đầy đủ
  assert.equal(orgFeatures([], 'O', 'family').stock, 'off'); // chưa có vụ: theo mặc định cơ sở
  assert.equal(orgFeatures([cy('family')], 'O', null).stock, 'off');
  assert.equal(orgFeatures([cy('family'), cy('managed')], 'O', null).stock, 'on'); // hợp các vụ đang chạy
  assert.equal(orgFeatures([cy('family'), cy('managed', 'ended')], 'O', null).stock, 'off'); // vụ đã kết thúc không tính
  assert.equal(orgFeatures([cy(null)], 'O', 'family').stock, 'off'); // vụ chưa chọn theo cơ sở
  assert.deepEqual(orgFeatures([cy(null)], 'O', null), allFeaturesOn()); // cả hai chưa chọn: đầy đủ
  assert.equal(orgFeatures([cy('family', 'active', 'KHAC')], 'O', null).stock, 'on'); // vụ của cơ sở khác bỏ qua
  const feats = new Set(Object.keys(allFeaturesOn()));
  for (const [sec, f] of Object.entries(SECTION_FEATURE)) assert.ok(f === null || feats.has(f), `${sec} -> ${f}`);
  assert.equal(modelName(null, null), 'Chưa chọn (hiện đầy đủ)');
  assert.equal(modelName('family', 'staffed'), 'Tự làm trong gia đình');
});

test('menu theo mô hình: Tự làm trong gia đình ẩn kho, nhân sự, bảng lương; Chuẩn VietGAP hiện sổ nhật ký; không chọn thì đủ', () => {
  const perms = { declare: 'edit', inventory: 'edit', expenses: 'edit', sales: 'edit', harvest: 'edit', summary: 'view', coop: 'none', website: 'edit', tasks: 'edit' };
  const org = (features) => ({ id: 'O', type: 'household', name: 'Hộ', roles: ['owner'], perms, features });
  const ids = (l) => l.map((s) => s.id);
  const full = org(undefined), family = org(featuresOf('family')), vietgap = org(featuresOf('vietgap')), staffed = org(featuresOf('staffed'));
  for (const k of ['members', 'places', 'teams', 'licenses']) assert.ok(ids(declareSections(full)).includes(k), `đủ: ${k}`);
  for (const k of ['members', 'places', 'materials', 'teams', 'positions', 'partners']) assert.ok(!ids(declareSections(family)).includes(k), `gia đình ẩn ${k}`);
  for (const k of ['areas', 'crops', 'templates']) assert.ok(ids(declareSections(family)).includes(k), `gia đình giữ ${k}`);
  assert.ok(!ids(productionSections(family)).includes('stock') && !ids(productionSections(family)).includes('attendance'));
  for (const k of ['cycles', 'harvest', 'expense', 'logs']) assert.ok(ids(productionSections(family)).includes(k), k); // Ghi việc và Nhật ký việc luôn có
  assert.ok(!ids(reportSections(family)).includes('paybook') && !ids(reportSections(family)).includes('commerce'));
  for (const k of ['summary', 'sales', 'payables']) assert.ok(ids(reportSections(family)).includes(k), k);
  assert.ok(ids(reportSections(vietgap)).includes('logbook') && ids(reportSections(vietgap)).includes('checklist'));
  assert.ok(!ids(reportSections(staffed)).includes('logbook'));
  assert.ok(ids(reportSections(full)).includes('logbook'));
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
  await asUser(db, owner, `select set_org_model($1,'vietgap')`, [org]);
  assert.equal((await db.query(`select mgmt_model from organizations where id=$1`, [org])).rows[0].mgmt_model, 'vietgap');
  assert.match(await expectError(asUser(db, mgr, `select set_org_model($1,'family')`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_org_model($1,'xxx')`, [org])), /INVALID_MODEL/);

  await asUser(db, mgr, `select set_cycle_model($1,'managed')`, [cyc]);
  assert.equal((await db.query(`select mgmt_model from production_cycles where id=$1`, [cyc])).rows[0].mgmt_model, 'managed');
  await asUser(db, owner, `select set_cycle_model($1,'family')`, [cyc]); // đổi sang mô hình khác được
  assert.equal((await db.query(`select mgmt_model from production_cycles where id=$1`, [cyc])).rows[0].mgmt_model, 'family');
  assert.match(await expectError(asUser(db, worker, `select set_cycle_model($1,'staffed')`, [cyc])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_cycle_model($1,'staffed')`, [cyc])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_cycle_model($1,'khac')`, [cyc])), /INVALID_MODEL/);
  await asUser(db, owner, `select set_cycle_model($1,'vietgap')`, [cyc]);
  await asUser(db, owner, `select set_cycle_model($1,null)`, [cyc]); // bỏ chọn: theo cơ sở
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

const base = { model: 'family', features: featuresOf('family'), kind: 'crop', status: 'active', expenses: 0, harvests: 0, sales: 0, logs: 0, plantCount: null, stagesTotal: 4, stagesDone: 0,
  can: { expense: true, harvest: true, sales: true, summary: true, logs: true } };

test('việc cần làm tiếp theo mô hình: đúng thứ tự, tối đa 3, tôn trọng quyền, vụ đã kết thúc thì rỗng', () => {
  const ids = (i) => nextSteps(i).map((s) => s.id);
  assert.deepEqual(ids(base), ['expense']); // mô hình gia đình: không nhắc ghi việc
  assert.deepEqual(ids({ ...base, model: null }), ['model', 'expense', 'log']);
  assert.deepEqual(ids({ ...base, kind: 'livestock' }), ['count', 'expense']);
  assert.deepEqual(ids({ ...base, kind: 'livestock', plantCount: 200 }), ['expense']);
  assert.deepEqual(ids({ ...base, expenses: 3, stagesDone: 4 }), ['harvest']);
  assert.deepEqual(ids({ ...base, expenses: 3, stagesDone: 4, harvests: 2 }), ['sales']);
  assert.deepEqual(ids({ ...base, expenses: 3, stagesDone: 4, harvests: 2, sales: 1 }), ['summary']);
  assert.deepEqual(ids({ ...base, can: { ...base.can, expense: false } }), []);
  assert.deepEqual(ids({ ...base, status: 'ended' }), []);
  // ghi việc chỉ gợi ý khi mô hình dùng ghi việc; VietGAP nhắc sổ nhật ký
  assert.deepEqual(ids({ ...base, model: 'staffed', features: featuresOf('staffed'), expenses: 1 }), ['log']);
  assert.ok(ids({ ...base, model: 'vietgap', features: featuresOf('vietgap'), expenses: 1, logs: 2 }).includes('logbook'));
  assert.ok(nextSteps({ ...base, model: null, kind: 'aquatic' }).length <= 3);
});

test('mục tùy chọn theo vụ: chỉ chủ/quản lý đặt; mã lạ bị từ chối; lưu danh sách không trùng', async () => {
  const { db, owner, worker, org, cyc } = await setup();
  await asUser(db, owner, `select set_cycle_options($1, array['logs','stock','logs'])`, [cyc]);
  assert.deepEqual((await db.query(`select mgmt_options from production_cycles where id=$1`, [cyc])).rows[0].mgmt_options.sort(), ['logs', 'stock']);
  assert.match(await expectError(asUser(db, owner, `select set_cycle_options($1, array['khac'])`, [cyc])), /INVALID_OPTION/);
  assert.match(await expectError(asUser(db, worker, `select set_cycle_options($1, array['logs'])`, [cyc])), /FORBIDDEN/);
  await asUser(db, owner, `select set_cycle_options($1, null)`, [cyc]);
  assert.deepEqual((await db.query(`select mgmt_options from production_cycles where id=$1`, [cyc])).rows[0].mgmt_options, []);
  void org;
});
