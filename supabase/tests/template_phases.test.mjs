import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0109: quy trình mẫu 2 cấp (công đoạn → việc), mức độ quan trọng, vật tư gợi ý của việc.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const tpl = (name) => asUser(db, owner, `insert into cycle_templates (organization_id, crop_type_id, name) values ($1,(select id from crop_types where organization_id is null and code='melon'),$2) returning id`, [org, name]).then((r) => r.rows[0].id);
  return { db, owner, worker, other, org, org2, tpl };
}

test('công đoạn: chủ thêm, số thứ tự tự điền, nhân viên và cơ sở khác không ghi/đọc được; việc xếp đúng công đoạn của quy trình', async () => {
  const { db, owner, worker, other, org, tpl } = await setup();
  const t = await tpl('Dưa A');
  const t2 = await tpl('Dưa B');
  const p1 = (await asUser(db, owner, `insert into template_phases (template_id, code, name, description) values ($1,'1','Chuẩn bị','Làm đất') returning id, seq, organization_id`, [t])).rows[0];
  const p2 = (await asUser(db, owner, `insert into template_phases (template_id, name) values ($1,'Ươm cây') returning id, seq`, [t])).rows[0];
  assert.equal(p1.seq, 1); assert.equal(p2.seq, 2); assert.equal(p1.organization_id, org);
  assert.match(await expectError(asUser(db, worker, `insert into template_phases (template_id, name) values ($1,'X')`, [t])), /row-level security/);
  assert.equal((await asUser(db, worker, `select count(*)::int n from template_phases`)).rows[0].n, 2); // nhân viên cùng cơ sở xem được
  assert.equal((await asUser(db, other, `select count(*)::int n from template_phases`)).rows[0].n, 0);

  // việc: mức độ quan trọng, gắn công đoạn; công đoạn của quy trình khác thì bị từ chối
  const s = (await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days, phase_id, importance) values ($1, ${wt('irrigation')}, 3, $2, 'high') returning importance, phase_id`, [t, p1.id])).rows[0];
  assert.equal(s.importance, 'high'); assert.equal(s.phase_id, p1.id);
  assert.match(await expectError(asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days, phase_id) values ($1, ${wt('irrigation')}, 3, $2)`, [t2, p1.id])), /INVALID_PHASE/);
  assert.match(await expectError(asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days, importance) values ($1, ${wt('irrigation')}, 3, 'x')`, [t])), /check|importance/i);
  const def = (await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days) values ($1, ${wt('spraying')}, 2) returning importance, phase_id`, [t])).rows[0];
  assert.equal(def.importance, 'normal'); assert.equal(def.phase_id, null);

  // phiên bản quy trình tăng khi sửa công đoạn
  const v0 = (await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version;
  await asUser(db, owner, `update template_phases set name='Chuẩn bị đất' where id=$1`, [p1.id]);
  assert.ok((await db.query(`select version from cycle_templates where id=$1`, [t])).rows[0].version > v0);

  // xóa công đoạn: việc còn lại, chỉ mất nhóm
  await asUser(db, owner, `delete from template_phases where id=$1`, [p1.id]);
  assert.equal((await db.query(`select count(*)::int n from template_stages where template_id=$1 and phase_id is null`, [t])).rows[0].n, 2);
});

test('nhân bản quy trình giữ công đoạn; tạo vụ chụp công đoạn và mức độ quan trọng vào từng việc của vụ', async () => {
  const { db, owner, org, tpl } = await setup();
  const t = await tpl('Dưa C');
  const p = (await asUser(db, owner, `insert into template_phases (template_id, code, name) values ($1,'2','Ươm cây') returning id`, [t])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days, phase_id, importance) values ($1, ${wt('irrigation')}, 3, $2, 'high')`, [t, p]);
  await asUser(db, owner, `insert into template_stages (template_id, work_type_id, duration_days) values ($1, ${wt('pruning')}, 2)`, [t]);

  const copy = (await asUser(db, owner, `select duplicate_cycle_template($1,'Dưa C (bản sao)') id`, [t])).rows[0].id;
  const ph = (await db.query(`select code, name from template_phases where template_id=$1`, [copy])).rows;
  assert.deepEqual(ph, [{ code: '2', name: 'Ươm cây' }]);
  const st = (await db.query(`select s.importance, p.name from template_stages s left join template_phases p on p.id = s.phase_id where s.template_id=$1 order by s.seq`, [copy])).rows;
  assert.deepEqual(st, [{ importance: 'high', name: 'Ươm cây' }, { importance: 'normal', name: null }]);

  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng') returning id`, [org])).rows[0].id;
  const cyc = '5aaaaaaa-0000-4000-8000-000000000001';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, t]);
  const vs = (await db.query(`select phase_code, phase_name, importance from production_stages where cycle_id=$1 order by seq`, [cyc])).rows;
  assert.deepEqual(vs, [{ phase_code: '2', phase_name: 'Ươm cây', importance: 'high' }, { phase_code: null, phase_name: null, importance: 'normal' }]);
});

test('việc có vật tư gợi ý; bản chỉnh của cơ sở cho việc dùng chung có vật tư riêng', async () => {
  const { db, owner, org } = await setup();
  const id1 = '6aaaaaaa-0000-4000-8000-000000000001';
  const w = (await asUser(db, owner, `insert into work_types (organization_id, name, material_ids) values ($1,'Bón thúc',array[$2]::uuid[]) returning material_ids`, [org, id1])).rows[0];
  assert.deepEqual(w.material_ids, [id1]);
  assert.deepEqual((await db.query(`select material_ids from work_types where organization_id is null limit 1`)).rows[0].material_ids, []);
  await asUser(db, owner, `insert into org_catalog_overrides (organization_id,item_kind,item_id,material_ids) values ($1,'work_type',${wt('fertilizing')},array[$2]::uuid[])`, [org, id1]);
  assert.deepEqual((await db.query(`select material_ids from org_catalog_overrides where organization_id=$1`, [org])).rows[0].material_ids, [id1]);
});

import { flatOrder } from '../../apps/app/src/lib/templates.ts';

test('thứ tự việc của quy trình: theo công đoạn, việc chưa xếp công đoạn ở cuối', () => {
  const phases = [{ id: 'P2', seq: 2 }, { id: 'P1', seq: 1 }];
  const stages = [
    { id: 'a', seq: 1, phase_id: 'P2' }, { id: 'b', seq: 2, phase_id: null }, { id: 'c', seq: 3, phase_id: 'P1' },
    { id: 'd', seq: 4, phase_id: 'P2' }, { id: 'e', seq: 5, phase_id: 'GONE' },
  ];
  assert.deepEqual(flatOrder(phases, stages), ['c', 'a', 'd', 'b', 'e']);
});

test('tùy chọn dùng công đoạn (migration 0110): chủ đặt yes/no, giá trị khác bị từ chối, nhân viên không đặt được', async () => {
  const { db, owner, worker, org } = await setup();
  await asUser(db, owner, `select set_org_config($1,'use_phases',array['no'])`, [org]);
  assert.deepEqual((await asUser(db, worker, `select items from org_config where organization_id=$1 and key='use_phases'`, [org])).rows[0].items, ['no']);
  await asUser(db, owner, `select set_org_config($1,'use_phases',array['yes'])`, [org]);
  assert.match(await expectError(asUser(db, owner, `select set_org_config($1,'use_phases',array['có'])`, [org])), /INVALID_ITEMS/);
  assert.match(await expectError(asUser(db, worker, `select set_org_config($1,'use_phases',array['no'])`, [org])), /FORBIDDEN/);
});

import { stageRanges, totalDays } from '../../apps/app/src/lib/templates.ts';
import { dueToday } from '../../apps/app/src/lib/dueTasks.ts';

test('lịch quy trình có việc song song: nối tiếp xếp liền, việc có ngày bắt đầu không làm việc sau dời; tổng ngày là ngày kết thúc muộn nhất', () => {
  const st = [
    { id: 'a', seq: 1, duration_days: 5 }, { id: 'b', seq: 2, duration_days: 3 },
    { id: 'c', seq: 3, duration_days: 10, start_day: 4 }, // song song từ ngày 4
    { id: 'd', seq: 4, duration_days: 2 }, // nối tiếp sau b: ngày 9–10
  ];
  const r = stageRanges(st);
  assert.deepEqual(r.get('b'), { from: 6, to: 8 });
  assert.deepEqual(r.get('c'), { from: 4, to: 13 });
  assert.deepEqual(r.get('d'), { from: 9, to: 10 });
  assert.equal(totalDays(st), 13);
  assert.equal(totalDays([]), 0);
});

test('việc đến hạn hôm nay: trong khoảng, đúng chu kỳ lặp, chưa xong; đã ghi hôm nay thì đánh dấu', () => {
  const s = (id, a, b, rep, status = 'pending', wt = 'W') => ({ id, seq: Number(id), planned_start: a, planned_end: b, repeat_every_days: rep, status, work_type_id: wt, name: id, cycle_id: 'C' });
  const stages = [s('1', '2026-12-02', '2026-12-11', 5), s('2', '2026-12-02', '2026-12-11', 1, 'pending', 'T'), s('3', '2026-12-02', '2026-12-11', 7, 'pending', 'P'), s('4', '2026-12-12', '2026-12-20', 1), s('5', '2026-12-01', '2026-12-30', null, 'done')];
  const ids = (today) => dueToday(stages, [], today).map((d) => d.stage.id);
  assert.deepEqual(ids('2026-12-02'), ['1', '2', '3']);  // ngày 0 của mọi chu kỳ
  assert.deepEqual(ids('2026-12-03'), ['2']);            // chỉ việc hằng ngày
  assert.deepEqual(ids('2026-12-07'), ['1', '2']);       // ngày 5: chu kỳ 5 đến hạn
  assert.deepEqual(ids('2026-12-09'), ['2', '3']);       // ngày 7: chu kỳ 7 đến hạn
  assert.deepEqual(ids('2026-12-15'), ['4']);            // ngoài khoảng của việc 1–3; việc xong bị bỏ
  const done = dueToday(stages, [{ stage_id: '2', work_type_id: 'T' }], '2026-12-03');
  assert.deepEqual(done.map((d) => [d.stage.id, d.doneToday]), [['2', true]]);
});
