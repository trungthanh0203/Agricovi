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
