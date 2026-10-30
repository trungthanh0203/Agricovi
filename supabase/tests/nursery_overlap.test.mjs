import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0135 (D124): ươm gối vụ — cấu hình Chỗ ươm, vụ nối tiếp, cờ nursery_overlap.

const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const A = '30000000-0000-4000-8000-0000000000a1';
const B = '30000000-0000-4000-8000-0000000000b1';

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [A, org, area, tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-10-01'::date,'preparing'::cycle_status,null)`, [B, org, area, tpl]);
  return { db, owner, wk, other, org, org2 };
}

test('cấu hình Chỗ ươm: chỉ nhận inside/separate/same; nhân viên không đổi được', async () => {
  const { db, owner, wk, org } = await setup();
  assert.match(await expectError(asUser(db, wk, `select set_org_config($1,'nursery_mode',array['inside'])`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'nursery_mode',array['xyz'])`, [org])), /INVALID_ITEMS/);
  await asUser(db, owner, `select set_org_config($1,'nursery_mode',array['inside'])`, [org]);
  assert.equal((await db.query(`select items[1] v from org_config where organization_id=$1 and key='nursery_mode'`, [org])).rows[0].v, 'inside');
});

test('ươm gối: chưa bật cấu hình thì từ chối; bật rồi đặt được; chỉ vụ Chuẩn bị', async () => {
  const { db, owner, wk, org } = await setup();
  assert.match(await expectError(asUser(db, owner, `select set_cycle_nursery($1,$2,true)`, [B, A])), /NURSERY_OFF/);
  await asUser(db, owner, `select set_org_config($1,'nursery_mode',array['separate'])`, [org]);
  assert.match(await expectError(asUser(db, wk, `select set_cycle_nursery($1,$2,true)`, [B, A])), /FORBIDDEN/);
  await asUser(db, owner, `select set_cycle_nursery($1,$2,true)`, [B, A]);
  const r = (await db.query(`select nursery_overlap, follows_cycle_id from production_cycles where id=$1`, [B])).rows[0];
  assert.deepEqual([r.nursery_overlap, r.follows_cycle_id], [true, A]);
  // vụ đang sản xuất không ươm gối được
  assert.match(await expectError(asUser(db, owner, `select set_cycle_nursery($1,null,true)`, [A])), /NOT_PREPARING/);
  // gỡ cờ và gỡ nối tiếp
  await asUser(db, owner, `select set_cycle_nursery($1,null,false)`, [B]);
  const r2 = (await db.query(`select nursery_overlap, follows_cycle_id from production_cycles where id=$1`, [B])).rows[0];
  assert.deepEqual([r2.nursery_overlap, r2.follows_cycle_id], [false, null]);
});

test('vụ nối tiếp: không tự nối, không nối vòng, không nối vụ của cơ sở khác', async () => {
  const { db, owner, org2, org } = await setup();
  assert.match(await expectError(asUser(db, owner, `select set_cycle_nursery($1,$1,false)`, [B])), /INVALID_FOLLOWS/);
  await asUser(db, owner, `select set_cycle_nursery($1,$2,false)`, [B, A]);
  assert.match(await expectError(asUser(db, owner, `select set_cycle_nursery($1,$2,false)`, [A, B])), /INVALID_FOLLOWS/);
  assert.match(await expectError(asUser(db, owner, `select set_cycle_nursery($1,'30000000-0000-4000-8000-0000000000ff',false)`, [B])), /INVALID_FOLLOWS/);
  assert.ok(org && org2);
});

test('hạn mức không đổi: vụ ươm gối (Chuẩn bị) không tính vào số vụ đang chạy', async () => {
  const { db, owner, org } = await setup();
  await asUser(db, owner, `select set_org_config($1,'nursery_mode',array['inside'])`, [org]);
  await asUser(db, owner, `select set_cycle_nursery($1,$2,true)`, [B, A]);
  const used = (await db.query(`select count(*)::int n from production_cycles where owner_org_id=$1 and status in ('active','paused')`, [org])).rows[0].n;
  assert.equal(used, 1);
});
