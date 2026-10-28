import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0119: mẫu hệ thống Heo thịt VietGAP (bản tham khảo).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại heo A') id`)).rows[0].id;
  const sys = (await db.query(`select id, version from system_templates where code='pig_fattening_vietgap'`)).rows[0];
  return { db, owner, org, sys };
}

test('mẫu heo thịt: 5 công đoạn, 25 việc đều là việc của vật nuôi, tổng 129 ngày; lịch vaccine không cài cứng', async () => {
  const { db, sys } = await setup();
  assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [sys.id])).rows[0].n, 5);
  const rows = (await db.query(
    `select s.seq, s.duration_days, s.start_day, s.repeat_every_days, w.code, w.applies_to
       from system_template_stages s join work_types w on w.id = s.work_type_id where s.system_template_id=$1 order by s.seq`, [sys.id])).rows;
  assert.equal(rows.length, 25);
  assert.ok(rows.every((r) => r.applies_to.length === 1 && r.applies_to[0] === 'livestock'), 'mọi việc phải thuộc vật nuôi');
  assert.equal(totalDays(rows), 129);
  // cho ăn lặp mỗi ngày ở cả hai giai đoạn nuôi; cân mẫu mỗi 15 ngày
  assert.ok(rows.some((r) => r.code === 'feeding' && r.start_day === 24 && r.repeat_every_days === 1));
  assert.ok(rows.some((r) => r.code === 'weighing' && r.start_day === 73 && r.repeat_every_days === 15));
  // vaccine và tẩy giun chỉ là việc có thời lượng, không lặp theo chu kỳ cài sẵn
  assert.ok(rows.filter((r) => ['vaccinating', 'deworming'].includes(r.code)).every((r) => r.repeat_every_days === null));
  // mọi việc có biểu mẫu chuẩn cho vật nuôi (để Ghi việc có đủ ô cần ghi)
  const std = ['house_cleaning', 'disinfecting', 'water_checking', 'weighing', 'feeding', 'vaccinating', 'deworming', 'waste_handling', 'pest_control', 'treating'];
  assert.ok(rows.every((r) => std.includes(r.code) || ['bedding_prep', 'harvesting_lv'].includes(r.code)));
});

test('áp dụng mẫu heo cho sản phẩm vật nuôi của cơ sở: sao đủ; không áp được cho sản phẩm cây trồng; tạo vụ ra đúng lịch', async () => {
  const { db, owner, org, sys } = await setup();
  const pig = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Heo thịt','livestock') returning id`, [org])).rows[0].id;
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /INVALID_CROP/);
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, pig])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [tpl])).rows[0].n, 25);
  assert.equal((await db.query(`select count(*)::int n from template_phases where template_id=$1`, [tpl])).rows[0].n, 5);
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Chuồng 1') returning id`, [org])).rows[0].id;
  const cyc = 'bbbbbbbb-0000-4000-8000-0000000000d1';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  assert.equal((await db.query(`select (expected_end_date - date '2026-11-01')::int d from production_cycles where id=$1`, [cyc])).rows[0].d, 128); // ngày 129 của quy trình
  const hv = (await db.query(`select phase_name, planned_start::text a, planned_end::text b from production_stages where cycle_id=$1 and name ilike '%xuất chuồng%'`, [cyc])).rows;
  assert.equal(hv.length, 1); assert.equal(hv[0].phase_name, 'Xuất chuồng');
});
