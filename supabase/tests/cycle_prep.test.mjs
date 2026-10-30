import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0137 (D126, thay 0135): công đoạn chuẩn bị của vụ theo nhà màng — toàn bộ / một phần / nhà chuẩn bị riêng; vụ nối tiếp.

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
  const prep = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Vườn ươm') returning id`, [org])).rows[0].id;
  const foreign = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu lạ') returning id`, [org2])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [A, org, area, tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-10-01'::date,'preparing'::cycle_status,null)`, [B, org, area, tpl]);
  return { db, owner, wk, org, area, prep, foreign };
}
const row = async (c, id) => (await c.db.query(`select prep_mode, prep_area_id, follows_cycle_id from production_cycles where id=$1`, [id])).rows[0];

test('mặc định chuẩn bị toàn bộ nhà màng; đặt một phần và nhà chuẩn bị riêng khi vụ còn Chuẩn bị', async () => {
  const c = await setup();
  assert.deepEqual(await row(c, B), { prep_mode: 'whole', prep_area_id: null, follows_cycle_id: null });
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'part',null,$2)`, [B, A]);
  assert.deepEqual(await row(c, B), { prep_mode: 'part', prep_area_id: null, follows_cycle_id: A });
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'separate',$2,$3)`, [B, c.prep, A]);
  assert.deepEqual(await row(c, B), { prep_mode: 'separate', prep_area_id: c.prep, follows_cycle_id: A });
  // quay về toàn bộ: xóa nơi chuẩn bị
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'whole',null,null)`, [B]);
  assert.deepEqual(await row(c, B), { prep_mode: 'whole', prep_area_id: null, follows_cycle_id: null });
});

test('kiểm tra: quyền, giá trị, vụ phải Chuẩn bị, nơi chuẩn bị hợp lệ', async () => {
  const c = await setup();
  assert.match(await expectError(asUser(c.db, c.wk, `select set_cycle_prep($1,'part',null,null)`, [B])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'xyz',null,null)`, [B])), /INVALID_MODE/);
  // vụ đang sản xuất không chọn 'part'/'separate'; vẫn đặt 'whole' được
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'part',null,null)`, [A])), /NOT_PREPARING/);
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'whole',null,null)`, [A]);
  // nhà chuẩn bị riêng: cần khu cùng cơ sở và khác nhà màng của vụ
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'separate',null,null)`, [B])), /INVALID_PREP_AREA/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'separate',$2,null)`, [B, c.foreign])), /INVALID_PREP_AREA/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'separate',$2,null)`, [B, c.area])), /INVALID_PREP_AREA/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'part',$2,null)`, [B, c.prep])), /INVALID_PREP_AREA/);
});

test('vụ nối tiếp: không tự nối, không nối vòng', async () => {
  const c = await setup();
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'part',null,$1)`, [B])), /INVALID_FOLLOWS/);
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'part',null,$2)`, [B, A]);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_prep($1,'whole',null,$2)`, [A, B])), /INVALID_FOLLOWS/);
});

test('hạn mức gói không đổi: vụ chuẩn bị trước không tính vào số vụ đang chạy; cấu hình nursery_mode không còn', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select set_cycle_prep($1,'part',null,$2)`, [B, A]);
  const used = (await c.db.query(`select count(*)::int n from production_cycles where owner_org_id=$1 and status in ('active','paused')`, [c.org])).rows[0].n;
  assert.equal(used, 1);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_org_config($1,'nursery_mode',array['inside'])`, [c.org])), /INVALID_KEY/);
});
