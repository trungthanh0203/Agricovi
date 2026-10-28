import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { dueToday, stageLogProgress } from '../../apps/app/src/lib/dueTasks.ts';

// Migration 0125: bấm Xong một việc chỉ được khi đã Ghi việc đủ (kể cả việc lặp mỗi N ngày); khôi phục dời lịch và sao mốc.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const sys = (await db.query(`select id from system_templates where code='melon_greenhouse'`)).rows[0].id;
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys, melon])).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng') returning id`, [org])).rows[0].id;
  const cyc = 'dddddddd-0000-4000-8000-0000000000f1';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01','active')`, [cyc, org, area, tpl]);
  const stage = async (seq) => (await db.query(`select id, name, planned_start::text a, planned_end::text b, repeat_every_days r from production_stages where cycle_id=$1 and seq=$2`, [cyc, seq])).rows[0];
  const logOn = (st, day, withStage = true) => db.query(`insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at)
     select gen_random_uuid(), s.organization_id, s.cycle_id, s.work_type_id, ${withStage ? 's.id' : 'null'}, ($2 || 'T03:00:00Z')::timestamptz from production_stages s where s.id=$1`, [st.id, day]);
  const progress = async (st, d) => (await asUser(db, owner, `select * from stage_log_progress($1,$2)`, [st.id, d])).rows[0];
  const adv = (st, action, d) => asUser(db, owner, `select advance_stage($1,$2,$3::date)`, [st.id, action, d]);
  return { db, owner, cyc, stage, logOn, progress, adv };
}

test('việc không lặp: cần ghi ít nhất 1 lần mới Xong được', async () => {
  const { db, stage, logOn, progress, adv } = await setup();
  const s1 = await stage(1); // Chuẩn bị giá thể, 5 ngày, không lặp
  assert.equal(s1.r, null);
  await adv(s1, 'start', s1.a);
  assert.deepEqual(await progress(s1, s1.b), { expected: 1, logged: 0 });
  assert.match(await expectError(adv(s1, 'complete', s1.b)), /LOG_INCOMPLETE.*cần Ghi việc đủ 1 lần.*đã ghi 0 lần/);
  await logOn(s1, s1.b);
  await adv(s1, 'complete', s1.b);
  assert.equal((await db.query(`select status from production_stages where id=$1`, [s1.id])).rows[0].status, 'done');
});

test('việc lặp mỗi N ngày: phải đủ số ngày đến hạn; ghi trùng trong ngày chỉ tính một lần; ghi không gắn việc nhưng cùng loại việc vẫn được tính', async () => {
  const { db, stage, logOn, progress, adv } = await setup();
  const s5 = await stage(5); // Tưới cây con: ngày 10–21 của quy trình, lặp mỗi 1 ngày => 12 lần
  assert.equal(s5.r, 1);
  await adv(await stage(1), 'start', (await stage(1)).a); // không cần xong việc 1 để bắt đầu việc 5
  await adv(s5, 'start', s5.a);
  const days = Array.from({ length: 12 }, (_, i) => `2026-09-${String(10 + i).padStart(2, '0')}`);
  for (const d of days.slice(0, 11)) await logOn(s5, d);
  await logOn(s5, days[0]); // ghi trùng ngày đầu: không tính thêm
  assert.deepEqual(await progress(s5, s5.b), { expected: 12, logged: 11 });
  assert.match(await expectError(adv(s5, 'complete', s5.b)), /LOG_INCOMPLETE.*đủ 12 lần.*đã ghi 11 lần/);
  await logOn(s5, days[11], false); // ghi ngày cuối nhưng không gắn việc: cùng loại việc của vụ, trong khoảng việc => tính
  assert.deepEqual(await progress(s5, s5.b), { expected: 12, logged: 12 });
  await adv(s5, 'complete', s5.b);
  assert.equal((await db.query(`select status from production_stages where id=$1`, [s5.id])).rows[0].status, 'done');
});

test('hoàn thành sớm chỉ cần các ngày đến hạn tính tới ngày hoàn thành; việc lặp mỗi 5 ngày', async () => {
  const { stage, logOn, progress } = await setup();
  const s9 = await stage(9); // Bón phân: ngày 32, lặp mỗi 5 ngày, 10 ngày (32–41)
  assert.equal(s9.r, 5);
  assert.deepEqual(await progress(s9, s9.a), { expected: 1, logged: 0 });                       // ngày 0
  assert.deepEqual(await progress(s9, '2026-10-07'), { expected: 2, logged: 0 });              // a=2026-10-02: ngày thứ 5 sau đó là 07/10
  assert.deepEqual(await progress(s9, s9.b), { expected: 2, logged: 0 });                       // tới ngày kết thúc: ngày 0 và 5
  await logOn(s9, '2026-10-02');
  assert.deepEqual(await progress(s9, '2026-10-07'), { expected: 2, logged: 1 });
  assert.deepEqual(await progress(s9, '2026-10-06'), { expected: 1, logged: 1 });                // chưa tới ngày đến hạn thứ hai
});

test('dời lịch khi hoàn thành trễ vẫn hoạt động (khôi phục bản vá 0073) và vụ tạo từ mẫu vẫn có mốc an toàn', async () => {
  const { db, stage, logOn, adv } = await setup();
  const s1 = await stage(1);
  await adv(s1, 'start', '2026-09-01');
  await logOn(s1, '2026-09-06');
  const before = (await stage(2)).a;
  await adv(s1, 'complete', '2026-09-06'); // trễ 1 ngày so với kế hoạch (ngày 5)
  const after = (await stage(2)).a;
  assert.notEqual(before, after);
});

test('bản máy khớp máy chủ: số lần cần ghi theo chu kỳ lặp, mỗi ngày một lần, việc Thu hoạch tính cả phiếu thu; việc không lặp thôi nhắc khi đã có bản ghi', () => {
  const st = (o) => ({ id: 'S', cycle_id: 'C', seq: 1, name: 'Tưới', work_type_id: 'W', planned_start: '2026-09-10', planned_end: '2026-09-21', repeat_every_days: 1, status: 'in_progress', actual_start: '2026-09-10', ...o });
  const day = (iso) => iso.slice(0, 10);
  const L = (d, o = {}) => ({ stage_id: 'S', work_type_id: 'W', performed_at: `${d}T03:00:00`, ...o });
  assert.deepEqual(stageLogProgress(st({}), [], 0, false, '2026-09-21', day), { expected: 12, logged: 0 });
  assert.deepEqual(stageLogProgress(st({}), [], 0, false, '2026-12-01', day), { expected: 12, logged: 0 }); // quá hạn: tối đa tới ngày kết thúc kế hoạch
  assert.deepEqual(stageLogProgress(st({ repeat_every_days: 5 }), [], 0, false, '2026-09-21', day), { expected: 3, logged: 0 });
  const logs = [L('2026-09-10'), L('2026-09-10'), L('2026-09-11', { stage_id: null }), L('2026-09-01', { stage_id: null }), L('2026-09-12', { voided_at: 'x' })];
  assert.deepEqual(stageLogProgress(st({}), logs, 0, false, '2026-09-21', day), { expected: 12, logged: 2 }); // trùng ngày một lần, bản trước ngày bắt đầu và bản đã hủy không tính
  assert.deepEqual(stageLogProgress(st({ repeat_every_days: null }), [], 2, true, '2026-09-21', day), { expected: 1, logged: 2 }); // thu hoạch: phiếu thu hoạch
  assert.deepEqual(stageLogProgress(st({ work_type_id: null }), [], 0, false, '2026-09-21', day), { expected: 0, logged: 0 });
  // việc không lặp: đã có bản ghi gắn việc ở ngày nào cũng thôi nhắc "chưa ghi"
  const stage = st({ repeat_every_days: null });
  assert.equal(dueToday([stage], [], '2026-09-15', [])[0].doneToday, false);
  assert.equal(dueToday([stage], [], '2026-09-15', [{ stage_id: 'S' }])[0].doneToday, true);
});

test('lối thoát (migration 0126): chỉ chủ cơ sở bấm Xong khi chưa ghi đủ kèm lý do; lý do được lưu; mở lại thì xóa dấu; người khác vẫn bị chặn', async () => {
  const { db, owner, cyc, stage } = await setup();
  const mgr = await addUser(db, 2);
  const org = (await db.query(`select owner_org_id o from production_cycles where id=$1`, [cyc])).rows[0].o;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const s1 = await stage(1);
  await asUser(db, owner, `select advance_stage($1,'start',$2::date)`, [s1.id, s1.a]);
  const done = (who, reason) => asUser(db, who, `select advance_stage($1,'complete',$2::date,$3)`, [s1.id, s1.b, reason]);
  assert.match(await expectError(done(owner, null)), /LOG_INCOMPLETE/);
  assert.match(await expectError(done(owner, 'ab')), /LOG_INCOMPLETE/);          // lý do quá ngắn
  assert.match(await expectError(done(mgr, 'Quên ghi, đã làm xong')), /FORBIDDEN/); // người quản lý không được bỏ qua
  await done(owner, 'Quên ghi, đã làm xong');
  const r = (await db.query(`select status, log_waived_reason r, log_waived_by b, log_waived_at is not null t from production_stages where id=$1`, [s1.id])).rows[0];
  assert.equal(r.status, 'done'); assert.equal(r.r, 'Quên ghi, đã làm xong'); assert.equal(r.b, owner); assert.equal(r.t, true);
  await asUser(db, owner, `select advance_stage($1,'reopen',null)`, [s1.id]);
  assert.equal((await db.query(`select log_waived_reason r from production_stages where id=$1`, [s1.id])).rows[0].r, null);
});
