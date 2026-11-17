import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0216 (H9, D180): sổ tài sản, khấu hao đường thẳng theo tháng chia vào vụ, bảo dưỡng.

const AREA = '20000000-0000-4000-8000-0000000000c1';
const EMPTY_AREA = '20000000-0000-4000-8000-0000000000c2';
const CYC = '30000000-0000-4000-8000-0000000000c1';
const A1 = '40000000-0000-4000-8000-0000000000c1';
const A2 = '40000000-0000-4000-8000-0000000000c2';
const A3 = '40000000-0000-4000-8000-0000000000c3';
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = `(select id from work_types where organization_id is null and code='irrigation')`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Trại B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1'),($3,$2,'Ô trống')`, [AREA, org, EMPTY_AREA]);
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt},300)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-08-01'::date,'active'::cycle_status,null)`, [CYC, org, AREA, tpl]);
  await db.query(`update production_cycles set planted_area_m2 = 1000 where id = $1`, [CYC]);
  return { db, owner, wk, other, org };
}
const mk = (db, who, id, org, area, date, cost, life, salvage = 0, every = null) =>
  asUser(db, who, `select * from create_asset($1,$2,'Nhà màng số 1','greenhouse',$3,$4::date,$5::bigint,$6::numeric,$7::bigint,$8::integer,null)`, [id, org, area, date, cost, life, salvage, every]);

test('tạo tài sản, bấm lặp không nhân đôi; khấu hao bắt đầu từ tháng SAU tháng mua', async () => {
  const { db, owner, org } = await setup();
  await mk(db, owner, A1, org, AREA, '2026-08-15', 12000000, 1);
  await mk(db, owner, A1, org, AREA, '2026-08-15', 12000000, 1);
  assert.equal((await db.query(`select count(*)::int n from assets`)).rows[0].n, 1);
  const aug = (await asUser(db, owner, `select preview_asset_depreciation($1,'2026-08-01') p`, [org])).rows[0].p;
  assert.equal(aug.items.length, 0);
  const sep = (await asUser(db, owner, `select preview_asset_depreciation($1,'2026-09-10') p`, [org])).rows[0].p;
  assert.equal(sep.items.length, 1);
  assert.equal(Number(sep.items[0].amount), 1000000);
});

test('tháng cuối gánh phần dư, sau đó bằng 0; chỉ ghi tháng đã qua hết', async () => {
  const { db, owner, org } = await setup();
  await mk(db, owner, A1, org, AREA, '2026-08-15', 1000001, 1);
  const m = async (d) => Number((await db.query(`select asset_month_amount(a, $1::date) v from assets a where id = $2`, [d, A1])).rows[0].v);
  assert.equal(await m('2026-09-01'), 83333);
  assert.equal(await m('2027-08-01'), 83338);
  assert.equal(await m('2027-09-01'), 0);
  assert.match(await expectError(asUser(db, owner, `select preview_asset_depreciation($1, date_trunc('month', now())::date)`, [org])), /INVALID_DATE/);
});

test('ghi khấu hao chia vào vụ; ghi lại không nhân đôi; sửa giá mua và xóa bị khóa sau khi ghi', async () => {
  const { db, owner, org } = await setup();
  await mk(db, owner, A1, org, AREA, '2026-08-15', 12000000, 1);
  const op = '50000000-0000-4000-8000-0000000000c1';
  const r = (await asUser(db, owner, `select post_asset_depreciation($1,'2026-09-01',$2) r`, [org, op])).rows[0].r;
  assert.equal(r.assets, 1);
  assert.equal(r.created, 1);
  const e = (await db.query(`select category::text c, kind::text k, amount::int a from expense_records where cycle_id = $1`, [CYC])).rows;
  assert.deepEqual(e, [{ c: 'depreciation', k: 'allocated', a: 1000000 }]);
  const again = (await asUser(db, owner, `select post_asset_depreciation($1,'2026-09-01',$2) r`, [org, '50000000-0000-4000-8000-0000000000c2'])).rows[0].r;
  assert.equal(again.assets, 0);
  assert.equal((await db.query(`select count(*)::int n from expense_records where cycle_id = $1`, [CYC])).rows[0].n, 1);
  // sửa
  assert.match(await expectError(asUser(db, owner, `select * from update_asset($1,1,'X','barn',$2,'2026-08-15'::date,9000000,1,0,null,null)`, [A1, AREA])), /LOCKED/);
  const ok = (await asUser(db, owner, `select * from update_asset($1,1,'Tên mới','greenhouse',$2,'2026-08-15'::date,12000000,1,0,6,'ghi chú')`, [A1, AREA])).rows[0];
  assert.equal(ok.version, 2);
  assert.match(await expectError(asUser(db, owner, `select * from update_asset($1,1,'Tên khác','greenhouse',$2,'2026-08-15'::date,12000000,1,0,null,null)`, [A1, AREA])), /CONFLICT/);
  assert.match(await expectError(asUser(db, owner, `select delete_asset($1)`, [A1])), /LOCKED/);
});

test('thanh lý dừng khấu hao từ tháng thanh lý; xóa được khi chưa ghi', async () => {
  const { db, owner, org } = await setup();
  await mk(db, owner, A1, org, AREA, '2026-08-15', 12000000, 1);
  await asUser(db, owner, `select * from dispose_asset($1,1,'2026-10-10'::date)`, [A1]);
  const m = async (d) => Number((await db.query(`select asset_month_amount(a, $1::date) v from assets a where id = $2`, [d, A1])).rows[0].v);
  assert.equal(await m('2026-09-01'), 1000000);
  assert.equal(await m('2026-10-01'), 0);
  await mk(db, owner, A2, org, AREA, '2026-08-15', 5000000, 2);
  await asUser(db, owner, `select delete_asset($1)`, [A2]);
  assert.equal((await db.query(`select count(*)::int n from assets where id = $1`, [A2])).rows[0].n, 0);
});

test('nơi đặt không có vụ nào: chưa ghi, báo riêng, ghi lại sau được', async () => {
  const { db, owner, org } = await setup();
  await mk(db, owner, A3, org, EMPTY_AREA, '2026-08-15', 12000000, 1);
  const r = (await asUser(db, owner, `select post_asset_depreciation($1,'2026-09-01','50000000-0000-4000-8000-0000000000c3') r`, [org])).rows[0].r;
  assert.equal(r.assets, 0);
  assert.equal(r.skipped_groups, 1);
  assert.equal((await db.query(`select count(*)::int n from asset_depreciation_posts`)).rows[0].n, 0);
});

test('quyền: nhân viên không ghi được; người ngoài cơ sở không đọc được; ghi bảo dưỡng và bấm lặp', async () => {
  const { db, owner, wk, other, org } = await setup();
  assert.match(await expectError(mk(db, wk, A1, org, AREA, '2026-08-15', 12000000, 1)), /FORBIDDEN/);
  await mk(db, owner, A1, org, AREA, '2026-08-15', 12000000, 1, 6);
  assert.equal((await asUser(db, other, `select * from assets`)).rows.length, 0);
  assert.match(await expectError(asUser(db, wk, `select post_asset_depreciation($1,'2026-09-01','50000000-0000-4000-8000-0000000000c4')`, [org])), /FORBIDDEN/);
  const M = '60000000-0000-4000-8000-0000000000c1';
  await asUser(db, owner, `select * from record_asset_maintenance($1,$2,'2026-09-20'::date,'Thay dầu')`, [M, A1]);
  const a = (await asUser(db, owner, `select * from record_asset_maintenance($1,$2,'2026-09-20'::date,'Thay dầu')`, [M, A1])).rows[0];
  assert.equal((await db.query(`select last_maintained_on::text d from assets where id = $1`, [A1])).rows[0].d, '2026-09-20');
  assert.ok(a.id);
  assert.equal((await db.query(`select count(*)::int n from asset_maintenance`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, owner, `select * from record_asset_maintenance($1,$2,'2999-01-01'::date,null)`, ['60000000-0000-4000-8000-0000000000c2', A1])), /INVALID_DATE/);
});
