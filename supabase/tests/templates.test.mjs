import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { describeSchedule, stageRanges, taskDays, totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0020 (P1): cây trồng riêng, loại việc riêng, quy trình mùa vụ mẫu theo từng cơ sở.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const owner2 = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, owner2, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, worker]);
  return { db, org, org2, owner, mgr, worker, owner2 };
}
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const addCrop = (db, u, org, name) => asUser(db, u, `insert into crop_types (organization_id, name) values ($1,$2) returning id, code`, [org, name]);
const addTemplate = (db, u, org, cropSql, name) =>
  asUser(db, u, `insert into cycle_templates (organization_id, crop_type_id, name) values ($1, ${cropSql}, $2) returning id`, [org, name]);
const addStage = (db, u, tpl, name, days) =>
  asUser(db, u, `insert into template_stages (template_id, name, duration_days) values ($1,$2,$3) returning id, seq`, [tpl, name, days]);
const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;

test('cây trồng riêng: chủ/quản lý thêm, mã tự sinh; nhân viên không thêm được; cơ sở khác không thấy; cây dùng chung ai cũng thấy', async () => {
  const { db, org, org2, owner, mgr, worker, owner2 } = await setup();
  const r = (await addCrop(db, owner, org, 'Ớt chuông')).rows[0];
  assert.match(r.code, /^c[0-9a-f]{10}$/);
  await addCrop(db, mgr, org, 'Cà chua bi');
  assert.match(await expectError(addCrop(db, worker, org, 'Hành lá')), /row-level security/);
  assert.match(await expectError(addCrop(db, owner, org, 'ớt chuông')), /duplicate|unique/); // trùng tên không phân biệt hoa thường
  await addCrop(db, owner2, org2, 'Ớt chuông');                                               // cơ sở khác dùng lại tên được
  // đọc
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
  assert.equal(await count(worker), 2);   // nhân viên chỉ đọc
  assert.equal(await count(owner2), 0);   // cơ sở khác không thấy mẫu của Hộ A
  await addTemplate(db, owner2, org2, melon, 'Dưa lưới mùa khô');  // mẫu riêng của Hộ B, cùng tên được
  // giai đoạn: organization_id bị ghi đè theo mẫu dù client gửi giá trị khác
  await asUser(db, owner, `insert into template_stages (template_id, organization_id, name, duration_days) values ($1,$2,'Gieo',7)`, [t, org2]);
  assert.equal((await db.query(`select organization_id from template_stages where template_id=$1`, [t])).rows[0].organization_id, org);
  // người cơ sở khác không thêm giai đoạn vào mẫu của Hộ A
  assert.match(await expectError(addStage(db, owner2, t, 'Chen vào', 3)), /row-level security/);
});

test('mẫu chỉ dùng cây dùng chung hoặc cây của chính cơ sở; không đổi cây sau khi tạo', async () => {
  const { db, org, org2, owner, owner2 } = await setup();
  const cropB = (await addCrop(db, owner2, org2, 'Cây Hộ B')).rows[0].id;
  assert.match(await expectError(addTemplate(db, owner, org, `'${cropB}'`, 'Dùng cây của người khác')), /INVALID_CROP|row-level|violates/);
  const own = (await addCrop(db, owner, org, 'Cây Hộ A')).rows[0].id;
  const t = (await addTemplate(db, owner, org, `'${own}'`, 'Mẫu cây riêng')).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `update cycle_templates set crop_type_id = ${melon} where id=$1`, [t])), /IMMUTABLE_FIELD/);
});

test('giai đoạn: số thứ tự tự tăng, dời lên/xuống đổi chỗ, tổng số ngày; việc phải nằm trong giai đoạn', async () => {
  const { db, org, owner } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu 1')).rows[0].id;
  const s1 = (await addStage(db, owner, t, 'Gieo ươm', 10)).rows[0];
  const s2 = (await addStage(db, owner, t, 'Ra hoa', 14)).rows[0];
  const s3 = (await addStage(db, owner, t, 'Thu hoạch', 20)).rows[0];
  assert.deepEqual([s1.seq, s2.seq, s3.seq], [1, 2, 3]);
  await asUser(db, owner, `select move_template_stage($1, -1)`, [s3.id]);  // Thu hoạch lên trước Ra hoa
  await asUser(db, owner, `select move_template_stage($1, -1)`, [s3.id]);  // lên đầu
  await asUser(db, owner, `select move_template_stage($1, -1)`, [s3.id]);  // đã ở đầu: không đổi
  const order = (await db.query(`select name from template_stages where template_id=$1 order by seq`, [t])).rows.map((r) => r.name);
  assert.deepEqual(order, ['Thu hoạch', 'Gieo ươm', 'Ra hoa']);
  assert.equal((await db.query(`select sum(duration_days)::int n from template_stages where template_id=$1`, [t])).rows[0].n, 44);

  // việc: bắt đầu ngày 2, lặp mỗi 1 ngày; ngày bắt đầu vượt độ dài giai đoạn bị từ chối
  const task = (stage, start, extra = '') => asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title, start_day ${extra ? ',' + extra.split('=')[0] : ''}) values ($1, ${wt('pollination')}, 'Thụ phấn', $2 ${extra ? ',' + extra.split('=')[1] : ''}) returning id`, [stage, start]);
  await task(s2.id, 2, 'repeat_every_days=1');
  assert.match(await expectError(task(s2.id, 15)), /INVALID_DAY/);
  assert.match(await expectError(task(s2.id, 0)), /check/);
  assert.match(await expectError(asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days) values ($1, ${wt('irrigation')}, 'Tưới', 1, 0)`, [s2.id])), /check/);
  // rút ngắn giai đoạn xuống dưới ngày bắt đầu của việc: từ chối; rút vừa đủ thì được
  assert.match(await expectError(asUser(db, owner, `update template_stages set duration_days = 1 where id=$1`, [s2.id])), /INVALID_DURATION/);
  await asUser(db, owner, `update template_stages set duration_days = 2 where id=$1`, [s2.id]);
});

test('loại việc của cơ sở khác không dùng được trong mẫu; phiên bản mẫu tăng khi giai đoạn/việc đổi', async () => {
  const { db, org, org2, owner, owner2 } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu 2')).rows[0].id;
  const st = (await addStage(db, owner, t, 'Gieo', 5)).rows[0].id;
  const other = (await asUser(db, owner2, `insert into work_types (organization_id, name) values ($1,'Việc của Hộ B') returning id`, [org2])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title) values ($1,$2,'X')`, [st, other])), /INVALID_WORK_TYPE|row-level|violates/);
  const v0 = (await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version;
  await asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title) values ($1, ${wt('irrigation')}, 'Tưới')`, [st]);
  await asUser(db, owner, `update template_stages set name = 'Gieo hạt' where id=$1`, [st]);
  assert.ok((await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version >= v0 + 2);
});

test('nhân bản mẫu: sao chép giai đoạn và việc sang mẫu mới; người không có quyền thì không nhân bản được', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  const t = (await addTemplate(db, owner, org, melon, 'Mẫu gốc')).rows[0].id;
  const a = (await addStage(db, owner, t, 'Gieo', 5)).rows[0].id;
  const b = (await addStage(db, owner, t, 'Ra hoa', 9)).rows[0].id;
  await asUser(db, owner, `insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days) values ($1, ${wt('irrigation')}, 'Tưới', 1, 2), ($2, ${wt('pollination')}, 'Thụ phấn', 3, 1)`, [a, b]);
  const copy = (await asUser(db, mgr, `select duplicate_cycle_template($1, 'Mẫu bản sao') id`, [t])).rows[0].id;
  assert.notEqual(copy, t);
  const stages = (await db.query(`select name, seq, duration_days from template_stages where template_id=$1 order by seq`, [copy])).rows;
  assert.deepEqual(stages.map((s) => [s.name, s.seq, s.duration_days]), [['Gieo', 1, 5], ['Ra hoa', 2, 9]]);
  assert.equal((await db.query(`select count(*)::int n from template_tasks tt join template_stages s on s.id=tt.stage_id where s.template_id=$1`, [copy])).rows[0].n, 2);
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [t])).rows[0].n, 2); // mẫu gốc nguyên vẹn
  assert.match(await expectError(asUser(db, worker, `select duplicate_cycle_template($1, 'Của nhân viên')`, [t])), /row-level security/);
  assert.match(await expectError(asUser(db, mgr, `select duplicate_cycle_template($1, 'Mẫu bản sao')`, [t])), /duplicate|unique/);
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
  assert.deepEqual({ ...(await seen(owner)) }, { t: 0, c: 0 });             // chưa tham gia HTX
  await db.query(`insert into cooperative_memberships (household_org_id,cooperative_org_id,status,joined_at) values ($1,$2,'active',now())`, [org, coop]);
  assert.deepEqual({ ...(await seen(owner)) }, { t: 1, c: 1 });             // đã tham gia: đọc được
  assert.deepEqual({ ...(await seen(outsider)) }, { t: 0, c: 0 });          // hộ ngoài HTX: không
  assert.match(await expectError(addTemplate(db, owner, coop, melon, 'Hộ chen vào mẫu HTX')), /row-level security/);
});

test('tính ngày ở trình soạn: khoảng ngày từng giai đoạn, lịch lặp của việc, mô tả bằng chữ', () => {
  const stages = [{ id: 'a', duration_days: 10 }, { id: 'b', duration_days: 14 }, { id: 'c', duration_days: 5 }];
  assert.equal(totalDays(stages), 29);
  const r = stageRanges(stages);
  assert.deepEqual(r.get('a'), { from: 1, to: 10 });
  assert.deepEqual(r.get('b'), { from: 11, to: 24 });
  assert.deepEqual(r.get('c'), { from: 25, to: 29 });
  assert.deepEqual(taskDays({ start_day: 3, repeat_every_days: null }, 10), [3]);
  assert.deepEqual(taskDays({ start_day: 2, repeat_every_days: 3 }, 10), [2, 5, 8]);
  assert.deepEqual(taskDays({ start_day: 11, repeat_every_days: 1 }, 10), []);
  assert.equal(describeSchedule({ start_day: 3, repeat_every_days: null }, 10), 'ngày 3');
  assert.equal(describeSchedule({ start_day: 2, repeat_every_days: 3 }, 10), 'từ ngày 2, lặp mỗi 3 ngày (3 lần)');
});
