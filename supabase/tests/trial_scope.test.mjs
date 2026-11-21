import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0220 (D186): gói dùng thử có phạm vi: hộ 1 vụ; HTX 1 hộ + 1 vụ; không công khai website.

const AREA = '20000000-0000-4000-8000-0000000000e1';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;

const scoped = async () => {
  const db = await createDb();
  await db.exec("update platform_settings set value = 'true'::jsonb where key = 'trial_scope_enabled'");
  return db;
};

async function household() {
  const db = await scoped();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},10)`, [tpl]);
  const mk = (id, status = 'active') => asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,$5::cycle_status,null)`, [id, org, AREA, tpl, status]);
  return { db, owner, org, mk };
}
const C = (n) => `30000000-0000-4000-8000-0000000000e${n}`;

test('đăng ký mới: gói dùng thử có phạm vi, hộ chỉ 1 vụ (kể cả vụ đã kết thúc hay chưa bắt đầu)', async () => {
  const { db, org, mk } = await household();
  const s = (await db.query(`select is_scoped_trial, max_cycles, max_households from subscriptions where organization_id=$1`, [org])).rows[0];
  assert.deepEqual(s, { is_scoped_trial: true, max_cycles: 1, max_households: null });
  await mk(C(1), 'preparing');
  await assert.rejects(mk(C(2), 'preparing'), /TRIAL_CYCLE_LIMIT/);
  await db.query(`update production_cycles set status='cancelled' where id=$1`, [C(1)]);      // vụ đã hủy không tính
  await mk(C(2));
  await db.query(`update production_cycles set status='ended' where id=$1`, [C(2)]);
  await assert.rejects(mk(C(3)), /TRIAL_CYCLE_LIMIT/);                                         // vụ đã kết thúc vẫn tính
});

test('cơ sở đang dùng thử từ trước (không có cờ) giữ nguyên cách tính cũ', async () => {
  const { db, org, mk } = await household();
  await db.query(`update subscriptions set is_scoped_trial=false, max_cycles=2 where organization_id=$1`, [org]);
  await mk(C(1)); await mk(C(2));
  await assert.rejects(mk(C(3)), /QUOTA_EXCEEDED/);
});

test('gói Khởi đầu được công khai vụ (D221 bỏ chặn công khai)', async () => {
  const { db, owner, mk } = await household();
  await mk(C(1));
  assert.match((await asUser(db, owner, `select publish_cycle($1) r`, [C(1)])).rows[0].r.code, /^VU-/);
});

test('HTX dùng thử chỉ thêm 1 hộ (mời hoặc tạo hộ)', async () => {
  const db = await scoped();
  const owner = await addUser(db, 1);
  const coop = (await asUser(db, owner, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  assert.equal((await db.query(`select max_households from subscriptions where organization_id=$1`, [coop])).rows[0].max_households, 1);
  await asUser(db, owner, `select invite_household($1,'a@x.vn')`, [coop]);
  await assert.rejects(asUser(db, owner, `select invite_household($1,'b@x.vn')`, [coop]), /TRIAL_HOUSEHOLD_LIMIT/);
  await assert.rejects(asUser(db, owner, `select create_member_household($1,'Hộ B')`, [coop]), /TRIAL_HOUSEHOLD_LIMIT/);
  await db.query(`update subscriptions set is_scoped_trial=false where organization_id=$1`, [coop]);
  await asUser(db, owner, `select create_member_household($1,'Hộ B')`, [coop]);                // gói thường: không giới hạn kiểu này
});
