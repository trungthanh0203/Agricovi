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

test('nâng cấp thử đầy đủ: một lần, tăng hạn mức vụ, hết lượt thì về lại 1 vụ', async () => {
  const { db, owner, org, mk } = await free();
  await mk(C(1));
  await assert.rejects(mk(C(2)), /TRIAL_CYCLE_LIMIT/);
  const r = (await asUser(db, owner, `select start_full_trial($1) r`, [org])).rows[0].r;
  assert.equal(r.max_cycles, 2);
  await mk(C(2));                                                     // trong lượt thử: hạn mức của gói cơ bản
  await assert.rejects(asUser(db, owner, `select start_full_trial($1)`, [org]), /ALREADY_USED/);
  const st = (await asUser(db, owner, `select my_free_plan_state($1) s`, [org])).rows[0].s;
  assert.equal(st.scoped, false);
  assert.equal(st.full_trial_used, true);
  await db.query(`update subscriptions set full_trial_until = now() - interval '1 day' where organization_id=$1`, [org]);
  await assert.rejects(mk(C(3)), /TRIAL_CYCLE_LIMIT|QUOTA_EXCEEDED/);        // hết lượt thử: giới hạn lại
  assert.equal((await asUser(db, owner, `select my_free_plan_state($1) s`, [org])).rows[0].s.scoped, true);
});

test('khóa tính năng: chấm công và đọc hóa đơn bị khóa ở Khởi đầu, mở trong lượt thử', async () => {
  const { db, owner, org } = await free();
  assert.equal((await db.query(`select org_feature_locked($1,'attendance') v`, [org])).rows[0].v, true);
  assert.equal((await db.query(`select (invoice_scan_quota($1)->>'limit')::int l`, [org])).rows[0].l, 0);
  await asUser(db, owner, `select start_full_trial($1)`, [org]);
  assert.equal((await db.query(`select org_feature_locked($1,'attendance') v`, [org])).rows[0].v, false);
  assert.ok((await db.query(`select (invoice_scan_quota($1)->>'limit')::int l`, [org])).rows[0].l > 0);
});

test('hết hạn: không thêm bản ghi mới, vẫn đọc được; cơ sở trả phí hết hạn không bị chặn kiểu này', async () => {
  const { db, owner, org } = await free();
  await db.query(`update subscriptions set period_start = now() - interval '400 days', period_end = now() - interval '1 day' where organization_id=$1`, [org]);
  const st = (await asUser(db, owner, `select my_free_plan_state($1) s`, [org])).rows[0].s;
  assert.equal(st.expired, true);
  await assert.rejects(db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu mới')`, [org]), /FREE_EXPIRED/);
  assert.equal((await asUser(db, owner, `select count(*)::int n from production_areas where organization_id=$1`, [org])).rows[0].n, 1);   // vẫn xem được
  await assert.rejects(asUser(db, owner, `select start_full_trial($1)`, [org]), /EXPIRED/);
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
