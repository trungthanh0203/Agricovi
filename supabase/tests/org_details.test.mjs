import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0221 (D187): thông tin bổ sung của cơ sở; chủ ghi (có phiên bản), chủ/quản lý đọc.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]), ($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  return { db, owner, mgr, wk, org };
}
const save = (db, u, org, data, v = null) => asUser(db, u, `select set_org_details($1,$2::jsonb,$3) v`, [org, JSON.stringify(data), v]);

test('chủ lưu lần đầu rồi sửa theo phiên bản; sai phiên bản thì CONFLICT', async () => {
  const { db, owner, org } = await setup();
  assert.equal((await save(db, owner, org, { rep_name: 'Lan', phone: '0912345678', total_area_m2: '5000', started_year: '2020' })).rows[0].v, 1);
  assert.equal((await save(db, owner, org, { rep_name: 'Lan', province: 'Lâm Đồng' }, 1)).rows[0].v, 2);
  await assert.rejects(save(db, owner, org, { rep_name: 'Lan' }, 1), /CONFLICT/);
  await assert.rejects(save(db, owner, org, { rep_name: 'Lan' }, null), /CONFLICT/);
  const r = (await asUser(db, owner, `select rep_name, province, phone, total_area_m2 from org_details where organization_id=$1`, [org])).rows[0];
  assert.equal(r.province, 'Lâm Đồng');
  assert.equal(r.phone, null);                    // lưu là thay cả bộ: ô bỏ trống thì xóa
});

test('chỉ chủ được ghi; chủ và quản lý đọc, nhân viên không đọc', async () => {
  const { db, owner, mgr, wk, org } = await setup();
  await assert.rejects(save(db, mgr, org, { rep_name: 'X' }), /FORBIDDEN/);
  await assert.rejects(save(db, wk, org, { rep_name: 'X' }), /FORBIDDEN/);
  await save(db, owner, org, { rep_name: 'Lan' });
  assert.equal((await asUser(db, mgr, `select 1 from org_details where organization_id=$1`, [org])).rows.length, 1);
  assert.equal((await asUser(db, wk, `select 1 from org_details where organization_id=$1`, [org])).rows.length, 0);
});

test('giá trị sai bị từ chối', async () => {
  const { db, owner, org } = await setup();
  await assert.rejects(save(db, owner, org, { started_year: '1800' }), /INVALID_ARGUMENT/);
  await assert.rejects(save(db, owner, org, { total_area_m2: '-5' }), /INVALID_ARGUMENT/);
});
