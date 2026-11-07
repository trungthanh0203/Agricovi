import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0186: hạn mức đọc ảnh phiếu theo gói, quyền, tốc độ, và bí danh vật tư.
const sid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), stranger = await addUser(db, 2), worker = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  return { db, owner, stranger, worker, org };
}
const begin = (c, who, n, images = 1) => asUser(c.db, who, `select begin_invoice_scan($1,$2,$3) r`, [c.org, sid(n), images]).then((r) => r.rows[0].r);
const finish = (c, who, n, ok) => asUser(c.db, who, `select finish_invoice_scan($1,$2,2,1500,'m')`, [sid(n), ok]);

test('hạn mức dùng thử 2 lần/tháng; lần lỗi không tính; gọi lặp cùng mã không tính thêm', async () => {
  const c = await setup();
  let q = await begin(c, c.owner, 1);
  assert.deepEqual([q.limit, q.used, q.remaining, q.status], [2, 1, 1, 'trial']);
  await begin(c, c.owner, 1);                                       // lặp: không tính thêm
  assert.equal((await asUser(c.db, c.owner, `select get_invoice_scan_usage($1) r`, [c.org])).rows[0].r.used, 1);
  await finish(c, c.owner, 1, false);                               // lỗi: hoàn lượt
  assert.equal((await asUser(c.db, c.owner, `select get_invoice_scan_usage($1) r`, [c.org])).rows[0].r.used, 0);
  await begin(c, c.owner, 2); await finish(c, c.owner, 2, true);
  await begin(c, c.owner, 3); await finish(c, c.owner, 3, true);
  assert.match(await expectError(begin(c, c.owner, 4)), /SCAN_LIMIT/);
});

test('gói trả phí lấy hạn mức theo gói; hết hạn thì không đọc được', async () => {
  const c = await setup();
  const tier = (await c.db.query(`select id from plan_tiers where name = 'Hộ nâng cao'`)).rows[0].id;
  assert.equal((await c.db.query(`select scan_per_month from plan_tiers where id = $1`, [tier])).rows[0].scan_per_month, 30);
  await c.db.query(`update subscriptions set status = 'active', plan_tier_id = $2, period_end = now() + interval '30 days' where organization_id = $1`, [c.org, tier]);
  const q = await begin(c, c.owner, 1);
  assert.deepEqual([q.limit, q.status], [30, 'active']);
  await c.db.query(`update subscriptions set period_start = now() - interval '60 days', period_end = now() - interval '1 day' where organization_id = $1`, [c.org]);
  assert.match(await expectError(begin(c, c.owner, 2)), /SCAN_NOT_ALLOWED/);
});

test('quyền: người ngoài và nhân viên không có quyền Chi phí bị từ chối; chặn đọc quá nhanh', async () => {
  const c = await setup();
  assert.match(await expectError(begin(c, c.stranger, 1)), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.stranger, `select get_invoice_scan_usage($1)`, [c.org])), /FORBIDDEN/);
  assert.match(await expectError(begin(c, c.worker, 2)), /FORBIDDEN/);   // nhân viên không sửa Chi phí
  // người khác không kết thúc được lần đọc của mình
  await begin(c, c.owner, 3);
  await finish(c, c.stranger, 3, true);
  assert.equal((await c.db.query(`select status from invoice_scans where id = $1`, [sid(3)])).rows[0].status, 'pending');
  // tốc độ: từ lần thứ 7 trong 5 phút bị chặn (đặt hạn mức cao để thử riêng phần này)
  await c.db.query(`update platform_settings set value = '100'::jsonb where key = 'invoice_scan_trial_limit'`);
  for (let i = 10; i < 15; i++) await begin(c, c.owner, i);
  assert.match(await expectError(begin(c, c.owner, 20)), /SCAN_RATE/);
});

test('bí danh vật tư: lưu theo nhà cung cấp, gộp lần dùng, chỉ nhận vật tư của cơ sở', async () => {
  const c = await setup();
  const other = (await asUser(c.db, c.stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  const unit = (await c.db.query(`select id from units_of_measure limit 1`)).rows[0].id;
  const mat = (await c.db.query(`insert into materials (id, organization_id, name, base_unit_id) values (gen_random_uuid(),$1,'NPK 16-16-8',$2) returning id`, [c.org, unit])).rows[0].id;
  const alienMat = (await c.db.query(`insert into materials (id, organization_id, name, base_unit_id) values (gen_random_uuid(),$1,'Của hộ B',$2) returning id`, [other, unit])).rows[0].id;
  const partner = (await c.db.query(`insert into partners (id, organization_id, name, is_supplier) values (gen_random_uuid(),$1,'Đại lý X',true) returning id`, [c.org])).rows[0].id;
  const save = (items) => asUser(c.db, c.owner, `select save_material_aliases($1,$2,$3::jsonb) n`, [c.org, partner, JSON.stringify(items)]).then((r) => Number(r.rows[0].n));
  assert.equal(await save([{ alias: 'npk dau trau 16-16-8', material_id: mat }, { alias: 'x', material_id: mat }, { alias: 'hang la', material_id: alienMat }]), 1);
  assert.equal(await save([{ alias: 'npk dau trau 16-16-8', material_id: mat }]), 1);
  const rows = (await asUser(c.db, c.owner, `select get_material_aliases($1,$2) r`, [c.org, partner])).rows[0].r;
  assert.equal(rows.length, 1);
  assert.equal((await c.db.query(`select uses from material_aliases`)).rows[0].uses, 2);
  assert.match(await expectError(asUser(c.db, c.stranger, `select get_material_aliases($1,null)`, [c.org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.worker, `select save_material_aliases($1,null,'[]'::jsonb)`, [c.org])), /FORBIDDEN/);
  assert.equal(JSON.stringify(rows).includes('hang la'), false);
});
