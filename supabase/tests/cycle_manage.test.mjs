import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0025 (D35): sửa/xóa vụ, sửa giai đoạn của vụ, ghi chú theo ngày.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000b1';
const CYC2 = '30000000-0000-4000-8000-0000000000b2';

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(
    `insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`,
    [org, mgr, worker]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3),($1,${wt('fertilizing')},10)`, [tpl]);
  const mk = (id, status = 'active') => asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,$5::cycle_status,null)`, [id, org, area, tpl, status]);
  return { db, owner, mgr, worker, other, org, area, tpl, mk };
}
const stagesOf = async (db, cyc) => (await db.query(`select id, seq, name, planned_start::text ps, planned_end::text pe, duration_days, status from production_stages where cycle_id=$1 order by seq`, [cyc])).rows;

test('sửa vụ: đổi tên, ngày bắt đầu, ghi chú có kiểm tra phiên bản', async () => {
  const { db, owner, worker, mk } = await setup();
  await mk(CYC);
  const upd = (u, v, ch) => asUser(db, u, `select * from update_cycle($1,$2,$3,$4::jsonb)`, [CYC, v, crypto.randomUUID(), JSON.stringify(ch)]);
  const r = (await upd(owner, 1, { name: 'Vụ xuân', note: 'ghi chú', start_date: '2026-11-05' })).rows[0];
  assert.equal(r.name, 'Vụ xuân');
  assert.equal(r.version, 2);
  assert.match(await expectError(upd(owner, 1, { name: 'x' })), /CONFLICT/);
  assert.match(await expectError(upd(worker, 2, { name: 'y' })), /FORBIDDEN|NOT_FOUND/);
});

test('xóa vụ: được khi chưa có dữ liệu; có nhật ký thì từ chối; nhân viên không xóa được', async () => {
  const { db, owner, worker, org, mk } = await setup();
  await mk(CYC);
  await mk(CYC2);
  assert.match(await expectError(asUser(db, worker, `select delete_cycle($1)`, [CYC])), /FORBIDDEN/);
  await asUser(db, owner, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,source)
    values ('40000000-0000-4000-8000-0000000000b1',$1,$2,${wt('irrigation')},now(),$3,'online')`, [org, CYC2, owner]);
  assert.match(await expectError(asUser(db, owner, `select delete_cycle($1)`, [CYC2])), /HAS_DATA/);
  await asUser(db, owner, `select delete_cycle($1)`, [CYC]);
  assert.equal((await db.query(`select count(*)::int n from production_cycles where id=$1`, [CYC])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from production_stages where cycle_id=$1`, [CYC])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from production_cycles where id=$1`, [CYC2])).rows[0].n, 1);
});

test('sửa giai đoạn của vụ: đổi tên/ngày/ghi chú, thêm, xóa; cập nhật ngày dự kiến xong của vụ', async () => {
  const { db, owner, mgr, worker, mk } = await setup();
  await mk(CYC);
  const [s1, s2] = await stagesOf(db, CYC);
  const upd = (u, id, ch) => asUser(db, u, `select * from update_cycle_stage($1,$2::jsonb)`, [id, JSON.stringify(ch)]);

  const r = (await upd(mgr, s1.id, { name: 'Gieo hạt kỹ', planned_end: '2026-11-05', note: 'Ngâm hạt trước' })).rows[0];
  assert.equal(r.name, 'Gieo hạt kỹ');
  assert.equal(r.duration_days, 5);
  assert.equal(r.note, 'Ngâm hạt trước');
  assert.match(await expectError(upd(owner, s1.id, { planned_end: '2026-10-01' })), /INVALID_DATE/);
  assert.match(await expectError(upd(owner, s1.id, { name: '  ' })), /INVALID_NAME/);
  assert.match(await expectError(upd(worker, s1.id, { name: 'x' })), /FORBIDDEN/);

  await upd(owner, s2.id, { planned_end: '2026-11-20' });
  assert.equal((await db.query(`select expected_end_date::text d from production_cycles where id=$1`, [CYC])).rows[0].d, '2026-11-20');

  const add = (await asUser(db, owner, `select * from add_cycle_stage($1,${wt('spraying')},null,'2026-11-21','2026-11-25',null)`, [CYC])).rows[0];
  assert.equal(add.seq, 3);
  assert.equal(add.name, 'Phun thuốc');
  assert.equal((await db.query(`select expected_end_date::text d from production_cycles where id=$1`, [CYC])).rows[0].d, '2026-11-25');
  assert.match(await expectError(asUser(db, owner, `select * from add_cycle_stage($1,null,null,'2026-11-21','2026-11-25',null)`, [CYC])), /INVALID_NAME/);

  await asUser(db, owner, `select delete_cycle_stage($1)`, [add.id]);
  assert.equal((await stagesOf(db, CYC)).length, 2);
  await asUser(db, owner, `select advance_stage($1,'start',null)`, [s1.id]);
  assert.match(await expectError(asUser(db, owner, `select delete_cycle_stage($1)`, [s1.id])), /không xóa được/);

  await asUser(db, owner, `update production_cycles set status='ended' where id=$1`, [CYC]);
  assert.match(await expectError(upd(owner, s2.id, { name: 'z' })), /CYCLE_CLOSED/);
});

test('ghi chú theo ngày: nhân viên thêm được, chỉ tác giả/quản lý sửa-xóa; cơ sở khác không thấy', async () => {
  const { db, owner, mgr, worker, other, org, mk } = await setup();
  await mk(CYC);
  const N1 = '50000000-0000-4000-8000-0000000000b1';
  const ins = (u, id, content, uidv) => asUser(db, u,
    `insert into cycle_notes (id,cycle_id,note_date,content,created_by) values ($1,$2,'2026-11-10',$3,$4)`, [id, CYC, content, uidv]);
  await ins(worker, N1, 'Nhớ mua phân NPK', worker);
  const row = (await db.query(`select organization_id, author_name from cycle_notes where id=$1`, [N1])).rows[0];
  assert.equal(row.organization_id, org);
  assert.ok(row.author_name);
  assert.match(await expectError(ins(worker, '50000000-0000-4000-8000-0000000000b2', '   ', worker)), /check|content/i);
  assert.match(await expectError(ins(worker, '50000000-0000-4000-8000-0000000000b3', 'giả mạo', owner)), /row-level security/);
  assert.match(await expectError(ins(other, '50000000-0000-4000-8000-0000000000b4', 'người ngoài', other)), /row-level security/);
  assert.equal((await asUser(db, other, `select count(*)::int n from cycle_notes`)).rows[0].n, 0);

  await asUser(db, worker, `update cycle_notes set done=true where id=$1`, [N1]);
  await asUser(db, mgr, `update cycle_notes set content='Đã sửa' where id=$1`, [N1]);
  await ins(owner, '50000000-0000-4000-8000-0000000000b5', 'Việc của chủ', owner);
  // nhân viên không xóa được ghi chú của người khác
  const del = await asUser(db, worker, `delete from cycle_notes where id='50000000-0000-4000-8000-0000000000b5' returning id`);
  assert.equal(del.rows.length, 0);
  await asUser(db, worker, `delete from cycle_notes where id=$1`, [N1]);
  assert.equal((await db.query(`select count(*)::int n from cycle_notes`)).rows[0].n, 1);
});
