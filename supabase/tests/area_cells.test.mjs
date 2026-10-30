import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0136 (D125): nhà màng (cấp 2) dưới phân khu (cấp 1).

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = id('2', 1), P2 = id('2', 2), C1 = id('2', 11), C2 = id('2', 12), CYC = id('3', 1), CYC2 = id('3', 2), FAC = id('2', 9);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Cơ sở B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name,kind) values ($1,$2,'Vườn Đông','crop'),($3,$2,'Vườn Tây','crop'),($4,$2,'Cổng','facility')`, [P, org, P2, FAC]);
  const out = { db, owner, wk, other, org, org2 };
  out.cycle = (cid, area) => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types where organization_id is null limit 1),'active')`, [cid, org, area]);
  return out;
}

test('nhà màng: cùng cơ sở, chỉ 2 cấp, không dưới cơ sở vật chất; kế thừa loại của phân khu cha', async () => {
  const c = await setup();
  await c.db.query(`insert into production_areas (id,organization_id,name,kind,parent_id) values ($1,$2,'Nhà màng 1','livestock',$3)`, [C1, c.org, P]);
  assert.equal((await c.db.query(`select kind from production_areas where id=$1`, [C1])).rows[0].kind, 'crop'); // theo cha, không theo giá trị nhập
  assert.match(await expectError(c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values (gen_random_uuid(),$1,'Con của con',$2)`, [c.org, C1])), /INVALID_PARENT/);
  const otherArea = (await c.db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu lạ') returning id`, [c.org2])).rows[0].id;
  assert.match(await expectError(c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values (gen_random_uuid(),$1,'X',$2)`, [c.org, otherArea])), /INVALID_PARENT/);
  assert.match(await expectError(c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values (gen_random_uuid(),$1,'X',$2)`, [c.org, FAC])), /INVALID_PARENT/);
  // đổi loại cha thì con đổi theo
  await c.db.query(`update production_areas set kind='livestock' where id=$1`, [P]);
  assert.equal((await c.db.query(`select kind from production_areas where id=$1`, [C1])).rows[0].kind, 'livestock');
});

test('vụ gắn nhà màng; phân khu đã chia thì không gắn vụ thẳng; phân khu đã có vụ không thêm con trực tiếp', async () => {
  const c = await setup();
  await c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Nhà màng 1',$3)`, [C1, c.org, P]);
  await c.cycle(CYC, C1); // gắn nhà màng: được
  assert.match(await expectError(c.cycle(CYC2, P)), /AREA_HAS_CELLS/);
  await c.cycle(CYC2, P2); // phân khu chưa chia: gắn thẳng như cũ
  assert.match(await expectError(c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values (gen_random_uuid(),$1,'Con',$2)`, [c.org, P2])), /AREA_HAS_CYCLES/);
});

test('chia phân khu đang có vụ thành nhà màng: chuyển vụ sang nhà màng đầu tiên; chỉ người có quyền khai báo', async () => {
  const c = await setup();
  await c.cycle(CYC, P2);
  assert.match(await expectError(asUser(c.db, c.wk, `select split_area_into_cells($1,'Nhà màng 1')`, [P2])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select split_area_into_cells($1,'Nhà màng 1')`, [P])), /NO_CYCLES/);
  const cell = (await asUser(c.db, c.owner, `select split_area_into_cells($1,'  Nhà màng 1 ') id`, [P2])).rows[0].id;
  const r = (await c.db.query(`select a.name, a.parent_id, (select area_id from production_cycles where id=$2) cyc_area from production_areas a where a.id=$1`, [cell, CYC])).rows[0];
  assert.deepEqual([r.name, r.parent_id, r.cyc_area], ['Nhà màng 1', P2, cell]);
  assert.match(await expectError(asUser(c.db, c.owner, `select split_area_into_cells($1,'Thêm')`, [P2])), /ALREADY_SPLIT/);
  // sau khi chia, thêm nhà màng bình thường
  await c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Nhà màng 2',$3)`, [C2, c.org, P2]);
});

test('phạm vi: giao phân khu cha gồm nhà màng con; giao một nhà màng thì không thấy nhà màng khác nhưng đọc được phân khu cha', async () => {
  const c = await setup();
  await c.db.query(`insert into production_areas (id,organization_id,name,parent_id) values ($1,$2,'Nhà màng 1',$3),($4,$2,'Nhà màng 2',$3)`, [C1, c.org, P, C2]);
  await c.cycle(CYC, C1); await c.cycle(CYC2, C2);
  const canRead = async (cyc) => (await asUser(c.db, c.wk, `select can_read_cycle($1) v`, [cyc])).rows[0].v;
  const canArea = async (a) => (await asUser(c.db, c.wk, `select can_read_area($1) v`, [a])).rows[0].v;
  await asUser(c.db, c.owner, `select set_member_areas($1,$2,array[$3]::uuid[])`, [c.org, c.wk, P]);
  assert.deepEqual([await canRead(CYC), await canRead(CYC2)], [true, true]);
  await asUser(c.db, c.owner, `select set_member_areas($1,$2,array[$3]::uuid[])`, [c.org, c.wk, C1]);
  assert.deepEqual([await canRead(CYC), await canRead(CYC2)], [true, false]);
  assert.equal(await canArea(P), true); // đọc được phân khu cha để hiện tên
  assert.equal(await canArea(P2), false);
});
