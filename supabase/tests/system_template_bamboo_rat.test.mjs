import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0166: mẫu hệ thống Dúi nuôi thương phẩm, ô riêng (bản tham khảo).

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Trại dúi A') id`)).rows[0].id;
  const sys = (await db.query(`select id from system_templates where code='bamboo_rat_fattening'`)).rows[0];
  return { db, owner, org, sys };
}

test('mẫu dúi: 5 công đoạn, 31 việc đều là việc vật nuôi, tổng 255 ngày, cân mẫu mỗi 30 ngày', async () => {
  const { db, sys } = await setup();
  assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [sys.id])).rows[0].n, 5);
  const rows = (await db.query(
    `select s.seq, s.duration_days, s.start_day, s.repeat_every_days, w.code, w.applies_to
       from system_template_stages s join work_types w on w.id = s.work_type_id where s.system_template_id=$1 order by s.seq`, [sys.id])).rows;
  assert.equal(rows.length, 31);
  assert.ok(rows.every((r) => r.applies_to.length === 1 && r.applies_to[0] === 'livestock'), 'mọi việc phải thuộc vật nuôi');
  assert.equal(totalDays(rows), 255);
  assert.ok(rows.some((r) => r.code === 'weighing' && r.repeat_every_days === 30));
  assert.ok(rows.some((r) => r.code === 'feeding' && r.repeat_every_days === 1));
});

test('áp dụng mẫu dúi cho sản phẩm vật nuôi: sao đủ; không áp cho cây trồng; tạo vụ ra đúng lịch', async () => {
  const { db, owner, org, sys } = await setup();
  const rat = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Dúi','livestock') returning id`, [org])).rows[0].id;
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /INVALID_CROP/);
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, rat])).rows[0].id;
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1`, [tpl])).rows[0].n, 31);
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Chuồng 1') returning id`, [org])).rows[0].id;
  const cyc = 'cccccccc-0000-4000-8000-0000000000e4';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  assert.equal((await db.query(`select (expected_end_date - date '2026-11-01')::int d from production_cycles where id=$1`, [cyc])).rows[0].d, 254);
});
