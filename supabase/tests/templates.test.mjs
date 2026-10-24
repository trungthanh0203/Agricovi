import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { stageRanges, totalDays } from '../../apps/app/src/lib/templates.ts';

// Migrations 0020–0021 (P1): cây trồng riêng, loại việc riêng, quy trình mùa vụ mẫu theo từng cơ sở.
// Giai đoạn của mẫu được chọn từ danh mục việc (D31).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const owner2 = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, owner2, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, worker]);
  await db.query(`update organization_memberships set permissions = '{"declare":"edit"}'::jsonb where user_id=$1`, [mgr]); // D83: quản lý cần được chủ cấp quyền Khai báo
  return { db, org, org2, owner, mgr, worker, owner2 };
}
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const addCrop = (db, u, org, name) => asUser(db, u, `insert into crop_types (organization_id, name) values ($1,$2) returning id, code`, [org, name]);
const addTemplate = (db, u, org, cropSql, name) =>
  asUser(db, u, `insert into cycle_templates (organization_id, crop_type_id, name) values ($1, ${cropSql}, $2) returning id`, [org, name]);
/** Thêm giai đoạn bằng cách chọn một việc từ danh mục (mã việc dùng chung); tên giai đoạn do máy chủ lấy theo việc */
const addStage = (db, u, tpl, code, days) =>
  asUser(db, u, `insert into template_stages (template_id, work_type_id, duration_days) values ($1, ${wt(code)}, $2) returning id, seq, name`, [tpl, days]);

test('cây trồng riêng: chủ/quản lý thêm, mã tự sinh; nhân viên không thêm được; cơ sở khác không thấy; cây dùng chung ai cũng thấy', async () => {
  const { db, org, org2, owner, mgr, worker, owner2 } = await setup();
  const r = (await addCrop(db, owner, org, 'Ớt chuông')).rows[0];
  assert.match(r.code, /^c[0-9a-f]{10}$/);
  await addCrop(db, mgr, org, 'Cà chua bi');
  assert.match(await expectError(addCrop(db, worker, org, 'Hành lá')), /row-level security/);
  assert.match(await expectError(addCrop(db, owner, org, 'ớt chuông')), /duplicate|unique/); // trùng tên không phân biệt hoa thường
  await addCrop(db, owner2, org2, 'Ớt chuông');                                               // cơ sở khác dùng lại tên được
  const names = async (u) => (await asUser(db, u, `select name from crop_types where is_active order by name`)).rows.map((x) => x.name);
  assert.deepEqual(await names(worker), ['Cà chua bi', 'Dưa lưới', 'Ớt chuông']);
  assert.deepEqual(await names(owner2), ['Dưa lưới', 'Ớt chuông']);
  assert.match(await expectError(asUser(db, owner, `insert into crop_types (organization_id, name) values (null,'Cây chung')`)), /row-level security/);
});

test('loại việc riêng: chủ/quản lý định nghĩa, mã tự sinh, nhân viên cùng cơ sở thấy, cơ sở khác không thấy', async () => {
  const { db, org, owner, mgr, worker, owner2 } = await setup();
  await asUser(db, mgr, `insert into work_types (organization_id, name, field_schema) values ($1,'Kiểm tra độ ngọt','[{"key":"brix","label":"Độ Brix","type":"number"}]'::jsonb)`, [org]);
  assert.match(await expectError(asUser(db, worker, `insert into work_types (organization_id, name) values ($1,'Việc lạ')`, [org])), /row-level security/);
  const seen = async (u) => (await asUser(db, u, `select name from work_types where name = 'Kiểm tra độ ngọt'`)).rows.length;
  assert.equal(await seen(owner), 1);
  assert.equal(await seen(worker), 1);
  assert.equal(await seen(owner2), 0);
  assert.equal((await asUser(db, owner2, `select count(*)::int n from work_types where organization_id is null`)).rows[0].n, 7); // việc dùng chung còn nguyên
});

test('quy trình mẫu: quyền ghi/đọc theo cơ sở; cơ sở khác không thấy; organization_id không giả mạo được', async () => {
  const { db, org, org2, owner, mgr, worker, owner2 } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Dưa lưới mùa khô')).rows[0].id;
  assert.match(await expectError(addTemplate(db, worker, org, melon, 'Mẫu của nhân viên')), /row-level security/);
  await addTemplate(db, mgr, org, melon, 'Dưa lưới mùa mưa');
  assert.match(await expectError(addTemplate(db, owner, org, melon, 'Dưa lưới mùa khô')), /duplicate|unique/);
  const count = async (u) => (await asUser(db, u, `select count(*)::int n from cycle_templates`)).rows[0].n;
  assert.equal(await count(worker), 2);
  assert.equal(await count(owner2), 0);
  await addTemplate(db, owner2, org2, melon, 'Dưa lưới mùa khô');
  await asUser(db, owner, `insert into template_stages (template_id, organization_id, work_type_id, duration_days) values ($1,$2,${wt('irrigation')},7)`, [t, org2]);
  assert.equal((await db.query(`select organization_id from template_stages where template_id=$1`, [t])).rows[0].organization_id, org);
  assert.match(await expectError(addStage(db, owner2, t, 'pollination', 3)), /row-level security/);
});

test('mẫu chỉ dùng cây dùng chung hoặc cây của chính cơ sở; không đổi cây sau khi tạo', async () => {
  const { db, org, org2, owner, owner2 } = await setup();
  const cropB = (await addCrop(db, owner2, org2, 'Cây Hộ B')).rows[0].id;
  assert.match(await expectError(addTemplate(db, owner, org, `'${cropB}'`, 'Dùng cây của người khác')), /INVALID_CROP|row-level|violates/);
  const own = (await addCrop(db, owner, org, 'Cây Hộ A')).rows[0].id;
  const t = (await addTemplate(db, owner, org, `'${own}'`, 'Mẫu cây riêng')).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `update cycle_templates set crop_type_id = ${melon} where id=$1`, [t])), /IMMUTABLE_FIELD/);
});

test('giai đoạn chọn từ danh mục việc: tên lấy theo việc, bắt buộc có việc, số thứ tự tự tăng', async () => {
  const { db, org, owner, org2, owner2 } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu 1')).rows[0].id;
  const a = (await addStage(db, owner, t, 'fertilizing', 10)).rows[0];
  const b = (await addStage(db, owner, t, 'pollination', 14)).rows[0];
  assert.deepEqual([a.seq, b.seq, a.name, b.name], [1, 2, 'Bón phân', 'Thụ phấn']);
  // gõ tên tự do không được: phải chọn từ danh mục
  assert.match(await expectError(asUser(db, owner, `insert into template_stages (template_id, name, duration_days) values ($1,'Tự gõ',5)`, [t])), /INVALID_WORK_TYPE/);
  // dù client gửi tên khác, máy chủ vẫn lấy tên theo việc đã chọn
  const c = (await asUser(db, owner, `insert into template_stages (template_id, work_type_id, name, duration_days) values ($1, ${wt('irrigation')}, 'Tên giả', 3) returning name`, [t])).rows[0];
  assert.equal(c.name, 'Tưới nước');
  // việc của cơ sở khác không chọn được; việc của chính cơ sở chọn được
  const other = (await asUser(db, owner2, `insert into work_types (organization_id, name) values ($1,'Việc của Hộ B') returning id`, [org2])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days) values ($1,$2,4)`, [t, other])), /INVALID_WORK_TYPE|row-level|violates/);
  const mine = (await asUser(db, owner, `insert into work_types (organization_id, name) values ($1,'Kiểm tra độ ngọt') returning id`, [org])).rows[0].id;
  const d = (await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days) values ($1,$2,2) returning name`, [t, mine])).rows[0];
  assert.equal(d.name, 'Kiểm tra độ ngọt');
  // đổi việc của giai đoạn thì tên đổi theo
  await asUser(db, owner, `update template_stages set work_type_id = ${wt('spraying')} where id=$1`, [a.id]);
  assert.equal((await db.query(`select name from template_stages where id=$1`, [a.id])).rows[0].name, 'Phun thuốc');
});

test('sắp xếp giai đoạn: dời lên/xuống và sắp lại cả danh sách (kéo thả); danh sách sai bị từ chối; người chỉ đọc không sắp được', async () => {
  const { db, org, owner, worker } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu 2')).rows[0].id;
  const s1 = (await addStage(db, owner, t, 'irrigation', 10)).rows[0].id;
  const s2 = (await addStage(db, owner, t, 'fertilizing', 14)).rows[0].id;
  const s3 = (await addStage(db, owner, t, 'harvesting', 20)).rows[0].id;
  const order = async () => (await db.query(`select name from template_stages where template_id=$1 order by seq`, [t])).rows.map((r) => r.name);

  await asUser(db, owner, `select move_template_stage($1, -1)`, [s3]);
  assert.deepEqual(await order(), ['Tưới nước', 'Thu hoạch', 'Bón phân']);
  await asUser(db, owner, `select reorder_template_stages($1, $2::uuid[])`, [t, [s3, s2, s1]]);
  assert.deepEqual(await order(), ['Thu hoạch', 'Bón phân', 'Tưới nước']);
  assert.equal((await db.query(`select sum(duration_days)::int n from template_stages where template_id=$1`, [t])).rows[0].n, 44);

  assert.match(await expectError(asUser(db, owner, `select reorder_template_stages($1, $2::uuid[])`, [t, [s1, s2]])), /INVALID_ARGUMENT/);        // thiếu một giai đoạn
  assert.match(await expectError(asUser(db, owner, `select reorder_template_stages($1, $2::uuid[])`, [t, [s1, s1, s2]])), /INVALID_ARGUMENT/);    // lặp mã
  assert.match(await expectError(asUser(db, worker, `select reorder_template_stages($1, $2::uuid[])`, [t, [s1, s2, s3]])), /FORBIDDEN|INVALID_ARGUMENT/);
  assert.deepEqual(await order(), ['Thu hoạch', 'Bón phân', 'Tưới nước']);
});

test('việc chi tiết (bảng cũ, giao diện không dùng): vẫn ràng buộc ngày trong giai đoạn; phiên bản mẫu tăng khi giai đoạn đổi', async () => {
  const { db, org, owner } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu 3')).rows[0].id;
  const st = (await addStage(db, owner, t, 'pollination', 5)).rows[0].id;
  const task = (start) => asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title, start_day) values ($1, ${wt('pollination')}, 'Thụ phấn', $2)`, [st, start]);
  await task(2);
  assert.match(await expectError(task(6)), /INVALID_DAY/);
  assert.match(await expectError(asUser(db, owner, `update template_stages set duration_days = 1 where id=$1`, [st])), /INVALID_DURATION/);
  const v0 = (await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version;
  await asUser(db, owner, `update template_stages set duration_days = 6 where id=$1`, [st]);
  assert.ok((await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version > v0);
});

test('nhân bản mẫu: sao chép giai đoạn (kèm việc đã chọn) sang mẫu mới; người không có quyền thì không nhân bản được', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu gốc')).rows[0].id;
  await addStage(db, owner, t, 'irrigation', 5);
  await addStage(db, owner, t, 'pollination', 9);
  const copy = (await asUser(db, mgr, `select duplicate_cycle_template($1, 'Mẫu bản sao') id`, [t])).rows[0].id;
  assert.notEqual(copy, t);
  const stages = (await db.query(`select name, seq, duration_days, work_type_id is not null has_wt from template_stages where template_id=$1 order by seq`, [copy])).rows;
  assert.deepEqual(stages.map((s) => [s.name, s.seq, s.duration_days, s.has_wt]), [['Tưới nước', 1, 5, true], ['Thụ phấn', 2, 9, true]]);
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [t])).rows[0].n, 2);
  assert.match(await expectError(asUser(db, worker, `select duplicate_cycle_template($1, 'Của nhân viên')`, [t])), /row-level security/);
  assert.match(await expectError(asUser(db, mgr, `select duplicate_cycle_template($1, 'Mẫu bản sao')`, [t])), /duplicate|unique/);
});

test('nhân bản mẫu cũ có giai đoạn chưa gắn việc (tạo từ trước): vẫn nhân bản được, tạo mới thì bắt buộc chọn việc', async () => {
  const { db, org, owner } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu cũ')).rows[0].id;
  await db.query(`insert into template_stages (template_id, name, duration_days) values ($1,'Giai đoạn tự gõ',6)`, [t]).catch(() => undefined);
  // giả lập dữ liệu cũ: tắt trigger để chèn hàng không có việc
  await db.exec(`alter table template_stages disable trigger template_stages_prepare`);
  await db.query(`insert into template_stages (template_id, organization_id, seq, name, duration_days) values ($1,$2,1,'Giai đoạn tự gõ',6)`, [t, org]);
  await db.exec(`alter table template_stages enable trigger template_stages_prepare`);
  const copy = (await asUser(db, owner, `select duplicate_cycle_template($1, 'Bản sao mẫu cũ') id`, [t])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [copy])).rows[0].n, 1);
  assert.match(await expectError(asUser(db, owner, `insert into template_stages (template_id, name, duration_days) values ($1,'Gõ tay',3)`, [copy])), /INVALID_WORK_TYPE/);
});

test('HTX: hộ thành viên đọc được mẫu và cây của HTX nhưng không ghi; hộ ngoài HTX không đọc được', async () => {
  const { db, org, owner } = await setup();
  const coopOwner = await addUser(db, 20);
  const outsider = await addUser(db, 21);
  const coop = (await asUser(db, coopOwner, `select create_organization('cooperative','HTX X') id`)).rows[0].id;
  await asUser(db, outsider, `select create_organization('household','Hộ lạ')`);
  await addTemplate(db, coopOwner, coop, melon, 'Mẫu của HTX');
  await addCrop(db, coopOwner, coop, 'Cây của HTX');
  const seen = async (u) => (await asUser(db, u, `select (select count(*)::int from cycle_templates) t, (select count(*)::int from crop_types where organization_id is not null) c`)).rows[0];
  assert.deepEqual({ ...(await seen(owner)) }, { t: 0, c: 0 });
  await db.query(`insert into cooperative_memberships (household_org_id,cooperative_org_id,status,joined_at) values ($1,$2,'active',now())`, [org, coop]);
  assert.deepEqual({ ...(await seen(owner)) }, { t: 1, c: 1 });
  assert.deepEqual({ ...(await seen(outsider)) }, { t: 0, c: 0 });
  assert.match(await expectError(addTemplate(db, owner, coop, melon, 'Hộ chen vào mẫu HTX')), /row-level security/);
});

test('tính ngày ở trình soạn: khoảng ngày từng giai đoạn và tổng số ngày', () => {
  const stages = [{ id: 'a', duration_days: 10 }, { id: 'b', duration_days: 14 }, { id: 'c', duration_days: 5 }];
  assert.equal(totalDays(stages), 29);
  const r = stageRanges(stages);
  assert.deepEqual(r.get('a'), { from: 1, to: 10 });
  assert.deepEqual(r.get('b'), { from: 11, to: 24 });
  assert.deepEqual(r.get('c'), { from: 25, to: 29 });
});

test('chỉnh/dừng mục có sẵn theo từng cơ sở: chủ/quản lý chỉnh được; cơ sở khác không bị ảnh hưởng; mục riêng thì sửa trực tiếp', async () => {
  const { db, org, org2, owner, mgr, worker, owner2 } = await setup();
  const irrigation = `(select id from work_types where organization_id is null and code='irrigation')`;
  const up = (u, orgId, kind, itemSql, extra = '') =>
    asUser(db, u, `insert into org_catalog_overrides (organization_id, item_kind, item_id, display_name, is_active ${extra ? ',' + extra.split('=')[0] : ''})
       values ($1,$2,${itemSql},$3,$4 ${extra ? ',' + extra.split('=')[1] : ''})
       on conflict (organization_id, item_kind, item_id) do update set display_name = excluded.display_name, is_active = excluded.is_active`, [orgId, kind, 'Tưới nhỏ giọt', false]);
  await up(mgr, org, 'work_type', irrigation);
  assert.match(await expectError(up(worker, org, 'work_type', irrigation)), /row-level security/);
  assert.match(await expectError(up(owner2, org, 'work_type', irrigation)), /row-level security/);       // cơ sở khác không chỉnh hộ A
  const seen = async (u) => (await asUser(db, u, `select display_name, is_active from org_catalog_overrides`)).rows;
  assert.deepEqual(await seen(worker), [{ display_name: 'Tưới nhỏ giọt', is_active: false }]);           // nhân viên đọc được (để hiển thị đúng)
  assert.deepEqual(await seen(owner2), []);                                                              // hộ B không thấy bản chỉnh của hộ A
  // chỉnh cho riêng hộ B không ảnh hưởng hộ A
  await up(owner2, org2, 'work_type', irrigation);
  assert.equal((await db.query(`select count(*)::int n from org_catalog_overrides`)).rows[0].n, 2);

  // chỉ chỉnh được mục dùng chung; mục của cơ sở thì không (sửa trực tiếp); cây trồng không có trường dữ liệu
  const mine = (await asUser(db, owner, `insert into work_types (organization_id, name) values ($1,'Việc riêng') returning id`, [org])).rows[0].id;
  assert.match(await expectError(up(owner, org, 'work_type', `'${mine}'`)), /INVALID_ITEM/);
  assert.match(await expectError(up(owner, org, 'work_type', `'00000000-0000-4000-8000-00000000abcd'`)), /INVALID_ITEM/);
  assert.match(await expectError(up(owner, org, 'crop_type', melon, `field_schema='[]'::jsonb`)), /INVALID_ITEM/);
  await up(owner, org, 'crop_type', melon);   // đổi tên/dừng cây có sẵn cho riêng hộ A

  // tên giai đoạn theo bản chỉnh của cơ sở; hộ B (cũng đổi tên) có tên của hộ B
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu bản chỉnh')).rows[0].id;
  const stage = (await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days) values ($1, ${irrigation}, 3) returning name`, [t])).rows[0];
  assert.equal(stage.name, 'Tưới nhỏ giọt');
});

test('khu trồng dừng được: có cột is_active, mặc định đang dùng', async () => {
  const { db, org, owner } = await setup();
  await db.query(`insert into production_areas (id,organization_id,name) values ('20000000-0000-4000-8000-0000000000e1',$1,'N1')`, [org]);
  assert.equal((await db.query(`select is_active from production_areas`)).rows[0].is_active, true);
  await asUser(db, owner, `update production_areas set is_active = false where id='20000000-0000-4000-8000-0000000000e1'`);
  assert.equal((await db.query(`select is_active from production_areas`)).rows[0].is_active, false);
});
