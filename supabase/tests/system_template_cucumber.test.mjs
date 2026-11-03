import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0168: mẫu hệ thống Dưa chuột (dưa leo) nhà màng, giàn dây (bản tham khảo).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn dưa A') id`)).rows[0].id;
  const sys = (await db.query(`select id from system_templates where code='cucumber_greenhouse'`)).rows[0];
  return { db, owner, org, sys };
}

test('mẫu dưa chuột: 7 công đoạn, 31 việc đều là việc cây trồng, tổng 104 ngày, thu hoạch lặp 2 ngày một lần', async () => {
  const { db, sys } = await setup();
  assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [sys.id])).rows[0].n, 7);
  const rows = (await db.query(
    `select s.seq, s.duration_days, s.start_day, s.repeat_every_days, w.code, w.applies_to
       from system_template_stages s join work_types w on w.id = s.work_type_id where s.system_template_id=$1 order by s.seq`, [sys.id])).rows;
  assert.equal(rows.length, 31);
  assert.ok(rows.every((r) => r.applies_to.length === 1 && r.applies_to[0] === 'crop'), 'mọi việc phải thuộc cây trồng');
  assert.equal(totalDays(rows), 104);
  assert.ok(rows.some((r) => r.code === 'harvesting' && r.repeat_every_days === 2 && r.start_day === 53));
  assert.equal(rows.filter((r) => r.code === 'transplanting').length, 1);
});

test('áp dụng mẫu dưa chuột cho sản phẩm Dưa chuột: sao đủ; không áp cho thủy sản; tạo vụ ra đúng lịch', async () => {
  const { db, owner, org, sys } = await setup();
  const straw = (await db.query(`select id from crop_types where organization_id is null and code='cucumber'`)).rows[0].id;
  const fish = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Cá','aquatic') returning id`, [org])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, fish])), /INVALID_CROP/);
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, straw])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [tpl])).rows[0].n, 31);
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const cyc = 'cccccccc-0000-4000-8000-0000000000e6';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  assert.equal((await db.query(`select (expected_end_date - date '2026-11-01')::int d from production_cycles where id=$1`, [cyc])).rows[0].d, 103);
});
