import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migrations 0023–0024 (P2): mô tả cho mọi đối tượng khai báo; tạo vụ BẮT BUỘC theo quy trình mẫu; giám sát từng giai đoạn.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000a1';
const CYC2 = '30000000-0000-4000-8000-0000000000a2';

async function setup({ legacy = false } = {}) {
  const db = await createDb();
  if (!legacy) await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(
    `insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`,
    [org, mgr, worker]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Dưa lưới mùa khô') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3),($1,${wt('fertilizing')},10),($1,${wt('harvesting')},7)`, [tpl]);
  return { db, owner, mgr, worker, other, org, org2, area, tpl };
}
const create = (db, u, p) =>
  asUser(db, u, `select create_cycle_from_template($1,$2,$3,$4,$5::date,$6::cycle_status,$7) id`,
    [p.id ?? CYC, p.org, p.area, p.tpl, p.start ?? '2026-11-01', p.status ?? 'active', p.name ?? null]);

test('mô tả: lưu được ở khu trồng, vật tư, kho, bản chỉnh; quá 500 ký tự bị chặn', async () => {
  const { db, owner, org, area } = await setup();
  await asUser(db, owner, `update production_areas set description='Diện tích 500 m2, gần mương' where id=$1`, [area]);
  assert.equal((await db.query(`select description from production_areas where id=$1`, [area])).rows[0].description, 'Diện tích 500 m2, gần mương');
  await asUser(db, owner, `insert into inventory_locations (organization_id,name,description) values ($1,'Kho chính','Sau nhà')`, [org]);
  await asUser(db, owner, `insert into crop_types (organization_id,name,description) values ($1,'Ớt','Giống chịu nóng')`, [org]);
  await asUser(db, owner, `insert into org_catalog_overrides (organization_id,item_kind,item_id,description) values ($1,'work_type',${wt('irrigation')},'Gieo theo khay')`, [org]);
  const msg = await expectError(asUser(db, owner, `update production_areas set description=$2 where id=$1`, [area, 'x'.repeat(501)]));
  assert.match(msg, /check|description/i);
});

test('tạo vụ trực tiếp không có quy trình bị từ chối; qua hàm thì ngày kế hoạch tính dồn từ ngày bắt đầu', async () => {
  const { db, owner, org, area, tpl } = await setup();
  const msg = await expectError(asUser(db, owner,
    `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${melon},'active')`, [CYC, org, area]));
  assert.match(msg, /TEMPLATE_REQUIRED/);

  await create(db, owner, { org, area, tpl, name: 'Vụ 1 nhà màng' });
  const c = (await db.query(`select * from production_cycles where id=$1`, [CYC])).rows[0];
  assert.equal(c.template_id, tpl);
  assert.equal(c.template_name, 'Dưa lưới mùa khô');
  assert.equal(c.name, 'Vụ 1 nhà màng');
  assert.equal(String(c.created_by), owner);
  assert.equal(new Date(c.expected_end_date).toISOString().slice(0, 10), '2026-11-20'); // 3+10+7 = 20 ngày từ 01/11
  const st = (await db.query(`select name, seq, status, duration_days, to_char(planned_start,'YYYY-MM-DD') ps, to_char(planned_end,'YYYY-MM-DD') pe, work_type_id from production_stages where cycle_id=$1 order by seq`, [CYC])).rows;
  assert.equal(st.length, 3);
  assert.deepEqual(st.map((s) => [s.ps, s.pe, s.status]), [['2026-11-01', '2026-11-03', 'pending'], ['2026-11-04', '2026-11-13', 'pending'], ['2026-11-14', '2026-11-20', 'pending']]);
  assert.ok(st.every((s) => s.work_type_id));

  // gọi lặp cùng mã (mất phản hồi) không tạo trùng
  await create(db, owner, { org, area, tpl });
  assert.equal((await db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [CYC])).rows[0].n, 3);
});

test('sửa mẫu sau đó không đổi vụ đã tạo; mẫu đã có vụ dùng không xóa được, mẫu chưa dùng xóa được', async () => {
  const { db, owner, org, area, tpl } = await setup();
  await create(db, owner, { org, area, tpl });
  await asUser(db, owner, `update template_stages set duration_days=30 where template_id=$1 and seq=(select min(seq) from template_stages where template_id=$1)`, [tpl]);
  assert.equal((await db.query(`select duration_days from production_stages where cycle_id=$1 order by seq limit 1`, [CYC])).rows[0].duration_days, 3);

  assert.match(await expectError(asUser(db, owner, `delete from cycle_templates where id=$1`, [tpl])), /foreign key|violates/i);
  const t2 = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu thử') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `delete from cycle_templates where id=$1`, [t2]);
  assert.equal((await db.query(`select count(*)::int n from cycle_templates where id=$1`, [t2])).rows[0].n, 0);
});

test('kiểm tra khi tạo: mẫu cơ sở khác, mẫu ngừng dùng, mẫu rỗng, nhân viên, trạng thái, khu trồng đã dừng', async () => {
  const { db, owner, worker, org, org2, area, tpl, other } = await setup();
  const tplB = (await asUser(db, other, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu B') returning id`, [org2])).rows[0].id;
  await asUser(db, other, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},5)`, [tplB]);
  assert.match(await expectError(create(db, owner, { org, area, tpl: tplB })), /INVALID_TEMPLATE/);

  const empty = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Rỗng') returning id`, [org])).rows[0].id;
  assert.match(await expectError(create(db, owner, { org, area, tpl: empty })), /chưa có việc nào/);

  await asUser(db, owner, `update cycle_templates set is_active=false where id=$1`, [tpl]);
  assert.match(await expectError(create(db, owner, { org, area, tpl })), /ngừng dùng/);
  await asUser(db, owner, `update cycle_templates set is_active=true where id=$1`, [tpl]);

  assert.match(await expectError(create(db, worker, { org, area, tpl })), /FORBIDDEN|quyền/);
  assert.match(await expectError(create(db, owner, { org, area, tpl, status: 'ended' })), /INVALID_STATUS/);

  await asUser(db, owner, `update production_areas set is_active=false where id=$1`, [area]);
  assert.match(await expectError(create(db, owner, { org, area, tpl })), /INVALID_AREA/);
});

test('hạn mức vụ vẫn được ép khi tạo qua quy trình', async () => {
  const { db, owner, org, area, tpl } = await setup();
  await create(db, owner, { id: CYC, org, area, tpl });
  await create(db, owner, { id: CYC2, org, area, tpl });
  const msg = await expectError(create(db, owner, { id: '30000000-0000-4000-8000-0000000000a3', org, area, tpl }));
  assert.match(msg, /QUOTA_EXCEEDED/); // gói dùng thử 2 vụ
});

test('bắt đầu / hoàn thành / mở lại giai đoạn: đúng thứ tự, đúng quyền, chỉ khi vụ đang sản xuất', async () => {
  const { db, owner, mgr, worker, org, area, tpl } = await setup();
  await create(db, owner, { org, area, tpl });
  const [s1, s2] = (await db.query(`select id from production_stages where cycle_id=$1 order by seq`, [CYC])).rows.map((r) => r.id);
  const adv = (u, id, action, d) => asUser(db, u, `select * from advance_stage($1,$2,$3::date)`, [id, action, d ?? null]);

  assert.match(await expectError(adv(worker, s1, 'start')), /quyền/);
  assert.match(await expectError(adv(mgr, s1, 'complete')), /bắt đầu giai đoạn trước/);
  const r = (await adv(mgr, s1, 'start', '2026-11-01')).rows[0];
  assert.equal(r.status, 'in_progress');
  assert.match(await expectError(adv(mgr, s1, 'start')), /đã bắt đầu/);
  assert.match(await expectError(adv(mgr, s1, 'complete', '2026-10-30')), /không thể trước/);
  const done = (await adv(owner, s1, 'complete', '2026-11-04')).rows[0];
  assert.equal(done.status, 'done');
  assert.equal(String(done.actual_end).slice(0, 10) >= '2026-11-04', true);
  assert.equal((await adv(owner, s1, 'reopen')).rows[0].status, 'in_progress');
  assert.match(await expectError(adv(owner, s2, 'reopen')), /đã xong/);
  assert.match(await expectError(adv(owner, s2, 'bogus')), /không hợp lệ/);

  // trực tiếp sửa giai đoạn bị chặn (chỉ đi qua hàm)
  assert.equal((await asUser(db, owner, `update production_stages set status='done' where id=$1 returning id`, [s2])).rows.length, 0);

  // vụ đã kết thúc: không đổi giai đoạn
  await asUser(db, owner, `update production_cycles set status='ended' where id=$1`, [CYC]);
  assert.match(await expectError(adv(owner, s2, 'start')), /đang sản xuất/);
});

test('nhật ký gắn giai đoạn: phải cùng vụ', async () => {
  const { db, owner, worker, org, area, tpl } = await setup();
  await create(db, owner, { id: CYC, org, area, tpl });
  await create(db, owner, { id: CYC2, org, area, tpl });
  const s1 = (await db.query(`select id from production_stages where cycle_id=$1 order by seq limit 1`, [CYC])).rows[0].id;
  const sOther = (await db.query(`select id from production_stages where cycle_id=$1 order by seq limit 1`, [CYC2])).rows[0].id;
  const ins = (stage, id) => asUser(db, worker,
    `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,source,stage_id) values ($1,$2,$3,${wt('irrigation')},now(),$4,'online',$5)`,
    [id, org, CYC, worker, stage]);
  await ins(s1, '40000000-0000-4000-8000-0000000000a1');
  assert.match(await expectError(ins(sOther, '40000000-0000-4000-8000-0000000000a2')), /INVALID_STAGE/);
});
