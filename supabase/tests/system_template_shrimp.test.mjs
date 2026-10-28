import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0121: mẫu hệ thống Tôm thẻ chân trắng, ao lót bạt (bản tham khảo).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại tôm A') id`)).rows[0].id;
  const sys = (await db.query(`select id from system_templates where code='shrimp_lined_pond'`)).rows[0];
  return { db, owner, org, sys };
}

test('mẫu tôm ao lót bạt: 6 công đoạn, 35 việc đều là việc thủy sản, tổng 115 ngày, đo môi trường nước lặp hằng ngày', async () => {
  const { db, sys } = await setup();
  assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [sys.id])).rows[0].n, 6);
  const rows = (await db.query(
    `select s.seq, s.duration_days, s.start_day, s.repeat_every_days, w.code, w.applies_to
       from system_template_stages s join work_types w on w.id = s.work_type_id where s.system_template_id=$1 order by s.seq`, [sys.id])).rows;
  assert.equal(rows.length, 35);
  assert.ok(rows.every((r) => r.applies_to.length === 1 && r.applies_to[0] === 'aquatic'), 'mọi việc phải thuộc thủy sản');
  assert.equal(totalDays(rows), 115);
  assert.ok(rows.filter((r) => r.code === 'water_measuring' && r.repeat_every_days === 1).length >= 4);
  assert.ok(rows.some((r) => r.code === 'weighing_aq' && r.repeat_every_days === 10));
  assert.equal(rows.filter((r) => r.code === 'stocking').length, 1);
});

test('áp dụng mẫu tôm cho sản phẩm thủy sản: sao đủ; không áp cho cây trồng; tạo vụ ra đúng lịch (ngày 115)', async () => {
  const { db, owner, org, sys } = await setup();
  const shrimp = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Tôm thẻ','aquatic') returning id`, [org])).rows[0].id;
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /INVALID_CROP/);
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, shrimp])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [tpl])).rows[0].n, 35);
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Ao 1') returning id`, [org])).rows[0].id;
  const cyc = 'cccccccc-0000-4000-8000-0000000000e1';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  assert.equal((await db.query(`select (expected_end_date - date '2026-11-01')::int d from production_cycles where id=$1`, [cyc])).rows[0].d, 114);
  assert.equal((await db.query(`select count(*)::int n from production_stages where cycle_id=$1 and phase_name='Thu hoạch'`, [cyc])).rows[0].n, 4);
});
