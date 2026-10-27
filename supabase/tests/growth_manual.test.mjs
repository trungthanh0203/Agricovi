import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0105: cân mẫu và cám nhập riêng cho vụ, gộp vào get_cycle_growth

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), worker = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng 1')`, [id('2', 1), org]);
  const cyc = id('3', 1);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [cyc, org, id('2', 1)]);
  return { db, owner, worker, other, org, cyc };
}

test('cân mẫu và cám nhập riêng: ghi, gộp vào get_cycle_growth, hủy kèm lý do', async () => {
  const { db, owner, worker, cyc } = await setup();
  const g = async (who = owner) => (await asUser(db, who, `select get_cycle_growth($1) g`, [cyc])).rows[0].g;

  const w1 = (await asUser(db, worker, `select add_cycle_weighing($1,'2026-09-01',100,12.5,'Lần đầu') id`, [cyc])).rows[0].id; // nhân viên ghi được
  await asUser(db, owner, `select add_cycle_weighing($1,'2026-10-01',98,40,null)`, [cyc]);
  const f1 = (await asUser(db, owner, `select add_cycle_feed($1,'2026-09-10',500,'Cám 566',null) id`, [cyc])).rows[0].id;
  await asUser(db, owner, `select add_cycle_feed($1,'2026-09-10',250,null,null)`, [cyc]);

  let r = await g();
  assert.deepEqual(r.weighings.map((w) => [w.date, Number(w.avg_kg), w.manual]), [['2026-09-01', 12.5, true], ['2026-10-01', 40, true]]);
  assert.equal(r.feed.logs_by_date.length, 1);
  assert.equal(Number(r.feed.logs_by_date[0].kg), 750); // cùng ngày cộng gộp
  assert.equal(r.feed.manual_entries.length, 2);

  // hủy: cần lý do; người ghi hủy được bản của mình, người khác (nhân viên) không hủy bản của chủ
  assert.match(await expectError(asUser(db, owner, `select void_cycle_measure('weighing',$1,'x')`, [w1])), /REASON_REQUIRED/);
  assert.match(await expectError(asUser(db, worker, `select void_cycle_measure('feed',$1,'Nhập nhầm số')`, [f1])), /FORBIDDEN/);
  await asUser(db, worker, `select void_cycle_measure('weighing',$1,'Nhập nhầm số')`, [w1]);
  await asUser(db, owner, `select void_cycle_measure('feed',$1,'Nhập nhầm số')`, [f1]);
  r = await g();
  assert.equal(r.weighings.length, 1);
  assert.equal(Number(r.feed.logs_by_date[0].kg), 250);
  assert.match(await expectError(asUser(db, owner, `select void_cycle_measure('feed',$1,'Hủy lần hai')`, [f1])), /NOT_FOUND/);
});

test('cân mẫu và cám: kiểm tra đầu vào và quyền; người ngoài cơ sở không ghi, không đọc', async () => {
  const { db, owner, other, cyc } = await setup();
  assert.match(await expectError(asUser(db, owner, `select add_cycle_weighing($1,'2026-09-01',10,0,null)`, [cyc])), /INVALID_QTY/);
  assert.match(await expectError(asUser(db, owner, `select add_cycle_feed($1,'2026-09-01',-5,null,null)`, [cyc])), /INVALID_QTY/);
  assert.match(await expectError(asUser(db, owner, `select add_cycle_feed($1,'2999-01-01',5,null,null)`, [cyc])), /INVALID_DATE/);
  assert.match(await expectError(asUser(db, other, `select add_cycle_weighing($1,'2026-09-01',10,5,null)`, [cyc])), /FORBIDDEN/);
  await asUser(db, owner, `select add_cycle_weighing($1,'2026-09-01',10,5,null)`, [cyc]);
  assert.equal((await asUser(db, other, `select count(*)::int n from cycle_weighings`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, other, `insert into cycle_feed_entries (cycle_id,organization_id,feed_date,kg) values ($1,$1,current_date,1)`, [cyc])), /permission denied|row-level security/);
});
