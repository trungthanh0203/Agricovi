import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0233 (D219): gói Khởi đầu, đợt B: nâng cấp thử một lần, hết hạn chỉ xem, khóa tính năng, danh sách khách tiềm năng.

const AREA = '20000000-0000-4000-8000-0000000000b1';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;
const C = (n) => `30000000-0000-4000-8000-0000000000b${n}`;

async function free() {
  const db = await createDb();
  await db.exec("update platform_settings set value = 'true'::jsonb where key = 'trial_scope_enabled'");
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại B') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  const mk = (id, status = 'preparing') => asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,$5::cycle_status,null)`, [id, org, AREA, tpl, status]);
  return { db, owner, org, mk };
}

test('không còn nâng cấp thử đầy đủ; chấm công khóa, đọc ảnh AI cho 2 lần mỗi tháng', async () => {
  const { db, owner, org, mk } = await free();
  await assert.rejects(asUser(db, owner, `select start_full_trial($1)`, [org]), /start_full_trial/);
  await mk(C(1));
  await assert.rejects(mk(C(2)), /TRIAL_CYCLE_LIMIT/);
  assert.equal((await db.query(`select org_feature_locked($1,'attendance') v`, [org])).rows[0].v, true);
  assert.equal((await db.query(`select (invoice_scan_quota($1)->>'limit')::int l`, [org])).rows[0].l, 2);
  await db.exec(`update platform_settings set value='["attendance","invoice_scan"]'::jsonb where key='free_locked_features'`);
  assert.equal((await db.query(`select (invoice_scan_quota($1)->>'limit')::int l`, [org])).rows[0].l, 0);   // quản trị khóa hẳn được
});

test('hết hạn: không thêm bản ghi mới, vẫn đọc được; cơ sở trả phí hết hạn không bị chặn kiểu này', async () => {
  const { db, owner, org } = await free();
  await db.query(`update subscriptions set period_start = now() - interval '400 days', period_end = now() - interval '1 day' where organization_id=$1`, [org]);
  const st = (await asUser(db, owner, `select my_free_plan_state($1) s`, [org])).rows[0].s;
  assert.equal(st.expired, true);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu mới')`, [org]), /FREE_EXPIRED/);
  assert.equal((await asUser(db, owner, `select count(*)::int n from production_areas where organization_id=$1`, [org])).rows[0].n, 1);   // vẫn xem được
  await db.query(`update subscriptions set is_scoped_trial=false where organization_id=$1`, [org]);   // như gói trả phí hết hạn
  await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu mới')`, [org]);
});

test('quản trị: danh sách khách tiềm năng và sửa cấu hình mới', async () => {
  const { db, owner, org, mk } = await free();
  const admin = await addUser(db, 9);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await assert.rejects(asUser(db, owner, `select admin_free_plan_leads(null)`), /FORBIDDEN/);
  assert.equal((await asUser(db, admin, `select jsonb_array_length(admin_free_plan_leads('used')) n`)).rows[0].n, 0);
  await mk(C(1));
  const used = (await asUser(db, admin, `select admin_free_plan_leads('used') r`)).rows[0].r;
  assert.equal(used.length, 1);
  assert.equal(used[0].id, org);
  assert.equal((await asUser(db, admin, `select jsonb_array_length(admin_free_plan_leads('expired')) n`)).rows[0].n, 0);
  await asUser(db, admin, `select admin_set_setting('free_max_staff','3'::jsonb)`);
  await assert.rejects(asUser(db, admin, `select admin_set_setting('free_max_staff','"x"'::jsonb)`), /INVALID_VALUE/);
  await assert.rejects(asUser(db, admin, `select admin_set_setting('free_locked_features','["abc"]'::jsonb)`), /INVALID_VALUE/);
  await asUser(db, admin, `select admin_set_setting('signup_auto_approve','0'::jsonb)`);
});

test('HTX Khởi đầu: 1 hộ thành viên, hộ đó có 1 phân khu, 1 ô và 1 vụ riêng (không tính vào vụ của HTX)', async () => {
  const db = await createDb();
  await db.exec("update platform_settings set value = 'true'::jsonb where key = 'trial_scope_enabled'");
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const coop = (await asUser(db, owner, `select create_organization('cooperative','HTX Z') id`)).rows[0].id;
  const hh = (await asUser(db, owner, `select create_member_household($1,'Hộ 1') id`, [coop])).rows[0].id;
  await assert.rejects(asUser(db, owner, `select create_member_household($1,'Hộ 2')`, [coop]), /TRIAL_HOUSEHOLD_LIMIT/);
  const A1 = '20000000-0000-4000-8000-0000000000c1', A2 = '20000000-0000-4000-8000-0000000000c2';
  const K1 = '20000000-0000-4000-8000-0000000000c3', K2 = '20000000-0000-4000-8000-0000000000c4';
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu hộ')`, [A1, hh]);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Khu hộ 2')`, [A2, hh]), /FREE_AREA_LIMIT/);
  await db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Ô hộ',$3)`, [K1, hh, A1]);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Ô hộ 2',$3)`, [K2, hh, A1]), /FREE_CELL_LIMIT/);
  // hộ thuộc HTX Khởi đầu được tạo vụ RIÊNG (luật "chỉ vụ theo HTX" không áp dụng), tối đa 1
  const tpl = (await db.query(`insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [hh])).rows[0].id;
  await db.query(`insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  const mk = (id) => asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,'preparing'::cycle_status,null)`, [id, hh, K1, tpl]);
  await mk(C(5));
  await assert.rejects(mk(C(6)), /TRIAL_CYCLE_LIMIT/);
  // HTX vẫn còn 1 vụ của riêng mình
  assert.equal((await db.query(`select org_has_paid_plan($1) v`, [hh])).rows[0].v, true);
});
