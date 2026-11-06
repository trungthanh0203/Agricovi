import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0179: nhiều vụ song song trong một ô theo diện tích; trường bắt buộc khi tạo vụ.
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const cid = (n) => `88000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  await db.query(`update subscriptions set max_cycles = 20 where organization_id = $1`, [org]); // gói dùng thử chỉ 2 vụ
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,area_size,area_unit) values (gen_random_uuid(),$1,'Nhà màng 1',1000,'m2') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},60)`, [tpl]);
  return { db, owner, mgr, stranger, org, area, tpl };
}
const mk = (c, who, id, o = {}) => asUser(c.db, who, `select create_cycle_checked($1,$2,$3,$4,'2026-11-01'::date,'active'::cycle_status,$5,$6,$7,$8,$9,$10) r`,
  [id, c.org, c.area, c.tpl, o.name ?? 'Dưa lưới A', o.variety ?? 'Kim Cô Nương', o.area ?? 400, o.count ?? 800, o.intercrop ?? false, o.over ?? false]);

test('trường bắt buộc khi tạo vụ; gọi lặp không tạo trùng', async () => {
  const c = await setup();
  assert.match(await expectError(mk(c, c.owner, cid(1), { name: ' ' })), /INVALID_CYCLE_NAME/);
  assert.match(await expectError(mk(c, c.owner, cid(1), { variety: '' })), /INVALID_VARIETY/);
  assert.match(await expectError(mk(c, c.owner, cid(1), { area: 0 })), /INVALID_AMOUNT/);
  assert.match(await expectError(mk(c, c.owner, cid(1), { count: 0 })), /INVALID_AMOUNT/);
  await mk(c, c.owner, cid(1));
  await mk(c, c.owner, cid(1));
  const r = (await c.db.query(`select name, variety_name v, planted_area_m2::float a, plant_count n, intercrop, over_capacity o from production_cycles where id=$1`, [cid(1)])).rows[0];
  assert.deepEqual([r.name, r.v, r.a, r.n, r.intercrop, r.o], ['Dưa lưới A', 'Kim Cô Nương', 400, 800, false, false]);
  assert.equal((await c.db.query(`select count(*)::int n from production_cycles`)).rows[0].n, 1);
});

test('chỗ trống của ô: nhiều vụ song song, vượt thì cảnh báo, chỉ chủ xác nhận, trồng xen bỏ qua, vụ kết thúc không tính', async () => {
  const c = await setup();
  await mk(c, c.owner, cid(1), { name: 'Dưa A', area: 400 });
  await mk(c, c.owner, cid(2), { name: 'Dưa B', area: 300 });
  const f = (await asUser(c.db, c.owner, `select area_free_m2($1,'2026-11-01'::date,'2026-12-31'::date,null) r`, [c.area])).rows[0].r;
  assert.deepEqual([Number(f.capacity_m2), Number(f.peak_used_m2), Number(f.free_m2), f.cycles.length], [1000, 700, 300, 2]);
  // vượt chỗ trống
  assert.match(await expectError(mk(c, c.owner, cid(3), { name: 'Dưa C', area: 400 })), /OVER_CAPACITY/);
  assert.match(await expectError(mk(c, c.mgr, cid(3), { name: 'Dưa C', area: 400, over: true })), /FORBIDDEN/);
  await mk(c, c.owner, cid(3), { name: 'Dưa C', area: 400, over: true });
  assert.equal((await c.db.query(`select over_capacity o from production_cycles where id=$1`, [cid(3)])).rows[0].o, true);
  // trồng xen không bị chặn và không tính vào chỗ đã dùng
  await mk(c, c.owner, cid(4), { name: 'Ớt xen', area: 900, intercrop: true });
  const f2 = (await asUser(c.db, c.owner, `select area_free_m2($1,'2026-11-01'::date,'2026-12-31'::date,null) r`, [c.area])).rows[0].r;
  assert.equal(Number(f2.peak_used_m2), 1100);   // A + B + C, không tính vụ trồng xen
  // vụ kết thúc thì trả lại chỗ
  await c.db.query(`update production_cycles set status='ended' where id=$1`, [cid(3)]);
  const f3 = (await asUser(c.db, c.owner, `select area_free_m2($1,'2026-11-01'::date,'2026-12-31'::date,null) r`, [c.area])).rows[0].r;
  assert.equal(Number(f3.free_m2), 300);
  // người ngoài không xem được chỗ trống của ô
  assert.match(await expectError(asUser(c.db, c.stranger, `select area_free_m2($1,null,null,null)`, [c.area])), /FORBIDDEN/);
  // ô chưa khai diện tích: không kiểm tra
  const a2 = (await asUser(c.db, c.owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Ô chưa khai') returning id`, [c.org])).rows[0].id;
  const f4 = (await asUser(c.db, c.owner, `select area_free_m2($1,null,null,null) r`, [a2])).rows[0].r;
  assert.equal(f4.capacity_m2, null);
});

test('bắt đầu giữa chừng qua create_cycle_checked vẫn kiểm tra chỗ trống và bắt buộc', async () => {
  const c = await setup();
  const ts = (await c.db.query(`select id from template_stages where template_id=$1`, [c.tpl])).rows[0].id;
  await asUser(c.db, c.owner, `select create_cycle_checked($1,$2,$3,$4,'2026-10-20'::date,'active'::cycle_status,'Dưa giữa chừng','Kim Cô Nương',500,900,false,false,$5,'{}'::uuid[],'2026-11-01'::date,'resume','Nhận cây con')`, [cid(9), c.org, c.area, c.tpl, ts]);
  const r = (await c.db.query(`select status, origin, planted_area_m2::float a from production_cycles where id=$1`, [cid(9)])).rows[0];
  assert.deepEqual([r.status, r.origin, r.a], ['active', 'resume', 500]);
});
