import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0039 (D53): trang quản trị nền tảng + công khai vụ lên website.
const id = (n) => `85000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2), wk = await addUser(db, 3), owner2 = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  const org2 = (await asUser(db, owner2, `select create_organization('cooperative','HTX Xanh') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  return { db, admin, owner, wk, owner2, org, org2 };
}
const call = (db, u, sql, p = []) => asUser(db, u, sql, p);

test('chỉ quản trị viên gọi được các hàm quản trị', async () => {
  const { db, owner, wk, org } = await setup();
  for (const [sql, p] of [[`select admin_overview()`, []], [`select admin_list_orgs(null,null,10,0)`, []], [`select admin_org_detail($1)`, [org]],
    [`select admin_list_audit(10)`, []], [`select admin_list_public_cycles()`, []]]) {
    assert.match(await expectError(call(db, owner, sql, p)), /FORBIDDEN/);
    assert.match(await expectError(call(db, wk, sql, p)), /FORBIDDEN/);
  }
});

test('tổng quan và danh sách cơ sở: đếm đúng, tìm theo tên/email chủ, lọc trạng thái; không lộ dữ liệu vận hành', async () => {
  const { db, admin, org } = await setup();
  const ov = (await call(db, admin, `select admin_overview() o`)).rows[0].o;
  assert.equal(Number(ov.orgs_total), 2);
  assert.equal(Number(ov.by_status.trial), 2);
  assert.equal(Number(ov.users_total), 3);
  let l = (await call(db, admin, `select admin_list_orgs('thành công',null,10,0) l`)).rows[0].l;
  assert.deepEqual([Number(l.total), l.rows[0].name, l.rows[0].status, l.rows[0].owner_email], [1, 'Vườn Thành Công', 'trial', 'u2@test.local']);
  l = (await call(db, admin, `select admin_list_orgs('u4@test',null,10,0) l`)).rows[0].l;
  assert.equal(l.rows[0].name, 'HTX Xanh');
  l = (await call(db, admin, `select admin_list_orgs(null,'expired',10,0) l`)).rows[0].l;
  assert.equal(Number(l.total), 0);
  const d = (await call(db, admin, `select admin_org_detail($1) d`, [org])).rows[0].d;
  assert.equal(Number(d.members), 2);
  assert.equal(d.subscriptions.length, 1);
  assert.equal(JSON.stringify(d).includes('activity_logs'), false);
  // admin không đọc trực tiếp nhật ký/chi phí của nhà vườn
  assert.equal((await asUser(db, admin, `select count(*)::int n from production_areas`)).rows[0].n, 0);
});

test('ghi nhận thanh toán gia hạn nối tiếp; đổi gói; tạm khóa/mở khóa; đều có nhật ký kiểm toán và cần lý do', async () => {
  const { db, admin, org } = await setup();
  const plan = (await db.query(`select id from plan_tiers where org_type='household' and not is_trial_default and is_active limit 1`)).rows[0].id;
  assert.match(await expectError(call(db, admin, `select admin_record_payment($1,500000,current_date + 1,'ck','x',1)`, [org])), /INVALID_DATE/);
  const s1 = (await call(db, admin, `select admin_record_payment($1,500000,current_date,'chuyển khoản','Quý 4',1,$2) s`, [org, plan])).rows[0].s;
  let st = (await call(db, admin, `select admin_list_orgs(null,null,10,0) l`)).rows[0].l.rows.find((r) => r.name === 'Vườn Thành Công');
  assert.equal(st.status, 'active');
  assert.equal(Number(st.max_cycles), 5);
  // gia hạn tiếp cùng gói: nối tiếp hạn
  const before = new Date((await db.query(`select period_end from subscriptions where id=$1`, [s1])).rows[0].period_end).getTime();
  const s2 = (await call(db, admin, `select admin_record_payment($1,500000,current_date,'ck',null,2,$2) s`, [org, plan])).rows[0].s;
  const row2 = (await db.query(`select period_start, period_end from subscriptions where id=$1`, [s2])).rows[0];
  assert.equal(new Date(row2.period_start).getTime(), before);
  assert.ok(new Date(row2.period_end).getTime() > before);
  assert.equal((await db.query(`select count(*)::int n from payment_records`)).rows[0].n, 2);

  assert.match(await expectError(call(db, admin, `select admin_set_org_suspended($1,true,'x')`, [org])), /REASON_REQUIRED/);
  await call(db, admin, `select admin_set_org_suspended($1,true,'Vi phạm điều khoản')`, [org]);
  st = (await call(db, admin, `select admin_list_orgs(null,null,10,0) l`)).rows[0].l.rows.find((r) => r.name === 'Vườn Thành Công');
  assert.equal(st.status, 'suspended');
  await call(db, admin, `select admin_set_org_suspended($1,false,'Đã khắc phục')`, [org]);
  assert.equal((await call(db, admin, `select org_sub_status($1) s`, [org]).catch(() => ({ rows: [{ s: 'active' }] }))).rows[0].s, 'active');
  const far = (await db.query(`select (now() + interval '200 days') d`)).rows[0].d;
  await call(db, admin, `select admin_set_org_plan($1,$2,$3,'Tặng thêm hạn')`, [org, plan, far]);
  const audit = (await call(db, admin, `select admin_list_audit(100) a`)).rows[0].a.filter((x) => !['INSERT', 'UPDATE', 'DELETE'].includes(x.action));
  assert.deepEqual(audit.map((x) => x.action).sort(), ['record_payment', 'record_payment', 'set_plan', 'suspend_org', 'unsuspend_org']);
  assert.ok(audit.every((x) => x.actor === 'u1@test.local'));
});

test('gói và cấu hình: lưu gói, gói dùng thử mặc định duy nhất theo loại; chỉ sửa cấu hình trong danh sách cho phép', async () => {
  const { db, admin } = await setup();
  const id1 = (await call(db, admin, `select admin_save_plan(null,'household','Hộ cao cấp',10,900000,5,false,true) i`)).rows[0].i;
  assert.equal((await db.query(`select max_cycles from plan_tiers where id=$1`, [id1])).rows[0].max_cycles, 10);
  await call(db, admin, `select admin_save_plan($1,'household','Hộ cao cấp',12,900000,5,true,true)`, [id1]);
  assert.equal((await db.query(`select count(*)::int n from plan_tiers where org_type='household' and is_trial_default`)).rows[0].n, 1);
  assert.match(await expectError(call(db, admin, `select admin_save_plan(null,'household','X',0,1,1,false,true)`)), /INVALID/);
  await call(db, admin, `select admin_set_setting('trial_days','45'::jsonb)`);
  assert.equal((await db.query(`select value from platform_settings where key='trial_days'`)).rows[0].value, 45);
  assert.match(await expectError(call(db, admin, `select admin_set_setting('bậy','1'::jsonb)`)), /INVALID_KEY/);
});

test('công khai vụ: chỉ chủ bấm; website (anon) chỉ đọc khi đang công khai; ngừng, công khai lại, quản trị viên tạm ẩn', async () => {
  const { db, admin, owner, wk, org } = await setup();
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,location) values (gen_random_uuid(),$1,'Nhà màng 1','Xã A') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name,created_by,start_date) values ($1,$2,$3,(select id from crop_types where code='melon'),'active','Dưa vụ 1',$4,'2026-10-01')`, [cyc, org, area, owner]);
  await db.query(`insert into org_licenses (organization_id,name,expires_date) values ($1,'VietGAP','2030-01-01'),($1,'Hết hạn','2020-01-01')`, [org]);

  assert.match(await expectError(call(db, wk, `select publish_cycle($1)`, [cyc])), /FORBIDDEN/);
  assert.equal((await asAnon(db, `select count(*)::int n from public_cycles`)).rows[0].n, 0); // chưa công khai: không ai thấy
  const r = (await call(db, owner, `select publish_cycle($1) r`, [cyc])).rows[0].r;
  assert.match(r.code, /^VU-[0-9A-F]{8}$/);
  const pub = (await asAnon(db, `select code, snapshot from public_cycles`)).rows;
  assert.equal(pub.length, 1);
  assert.equal(pub[0].snapshot.name, 'Dưa vụ 1');
  assert.deepEqual(pub[0].snapshot.licenses.map((l) => l.name), ['VietGAP']); // giấy hết hạn không đưa lên
  assert.equal(JSON.stringify(pub[0].snapshot).includes('cost'), false);

  await call(db, owner, `select unpublish_cycle($1)`, [cyc]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_cycles`)).rows[0].n, 0);
  assert.equal((await call(db, owner, `select count(*)::int n from public_cycles`)).rows[0].n, 1); // chủ vẫn thấy trạng thái
  await call(db, owner, `select publish_cycle($1)`, [cyc]); // công khai lại
  assert.equal((await asAnon(db, `select version from public_cycles`)).rows[0].version, 2);

  assert.match(await expectError(call(db, admin, `select admin_hide_public_cycle($1,true,'x')`, [cyc])), /REASON_REQUIRED/);
  await call(db, admin, `select admin_hide_public_cycle($1,true,'Thông tin sai sự thật')`, [cyc]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_cycles`)).rows[0].n, 0);
  assert.match(await expectError(call(db, owner, `select publish_cycle($1)`, [cyc])), /ADMIN_HIDDEN/);
  const lst = (await call(db, admin, `select admin_list_public_cycles() l`)).rows[0].l;
  assert.deepEqual([lst[0].code, lst[0].hidden_by_admin, lst[0].visible], [r.code, true, false]);
  await call(db, admin, `select admin_hide_public_cycle($1,false,'Đã xác minh lại')`, [cyc]);
  await call(db, owner, `select publish_cycle($1)`, [cyc]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_cycles`)).rows[0].n, 1);
});

test('trạng thái gói ưu tiên gói đang hiệu lực: dòng hết hạn có hạn muộn hơn không làm cơ sở hiện "Hết hạn" (migration 0116)', async () => {
  const { db, admin, org } = await setup();
  const plan = (await db.query(`select id, max_cycles, price_per_quarter, ranking_weight from plan_tiers where org_type='household' and not is_trial_default and is_active limit 1`)).rows[0];
  await db.query(`update subscriptions set period_end = now() where organization_id=$1`, [org]); // gói dùng thử cũ đã hết
  const ins = (status, from, to) => db.query(`insert into subscriptions (organization_id, plan_tier_id, status, max_cycles, price_per_quarter, ranking_weight, period_start, period_end) values ($1,$2,$3,$4,$5,$6, now() + $7::interval, now() + $8::interval)`,
    [org, plan.id, status, plan.max_cycles, plan.price_per_quarter, plan.ranking_weight, from, to]);
  await ins('active', '-1 day', '1500 days');   // gói đang chạy
  await ins('expired', '1 day', '1900 days');   // dòng đã đánh dấu hết hạn nhưng hạn muộn hơn
  assert.equal((await db.query(`select org_sub_status($1) s`, [org])).rows[0].s, 'active');
  const row = (await call(db, admin, `select admin_list_orgs(null,null,10,0) l`)).rows[0].l.rows.find((r) => r.name === 'Vườn Thành Công');
  assert.equal(row.status, 'active');
});
