import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Hoàn thành việc cần đã Ghi việc đủ (migration 0125): ghi một bản nhật ký gắn việc vào ngày cho trước
const logOf = (db, stageId, ts) => db.query(`insert into activity_logs (id, organization_id, cycle_id, work_type_id, stage_id, performed_at) select gen_random_uuid(), s.organization_id, s.cycle_id, s.work_type_id, s.id, $2::timestamptz from production_stages s where s.id = $1 and s.work_type_id is not null`, [stageId, ts]);

// Migration 0073 (D91): lịch giai đoạn của vụ tự đổi theo thực tế (bắt đầu chạy muộn, bắt đầu/hoàn thành lệch kế hoạch, sửa lịch một giai đoạn).

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000c1';

async function setup(status = 'preparing') {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  // 3 giai đoạn liền nhau: 3 ngày, 4 ngày, 5 ngày
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3),($1,${wt('fertilizing')},4),($1,${wt('spraying')},5)`, [tpl]);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01'::date,$5::cycle_status,null)`, [CYC, org, area, tpl, status]);
  return { db, owner, org };
}
const stages = async (db) => (await db.query(`select id, seq, planned_start::text s, planned_end::text e, status::text st from production_stages where cycle_id=$1 order by seq`, [CYC])).rows;
const cyc = async (db) => (await db.query(`select start_date::text s, expected_end_date::text e, status::text st from production_cycles where id=$1`, [CYC])).rows[0];
const plan = (rows) => rows.map((r) => `${r.s}→${r.e}`);

test('lịch ban đầu liền nhau; bắt đầu chạy muộn thì ngày bắt đầu vụ và cả lịch dời theo ngày thực tế', async () => {
  const c = await setup();
  assert.deepEqual(plan(await stages(c.db)), ['2026-11-01→2026-11-03', '2026-11-04→2026-11-07', '2026-11-08→2026-11-12']);
  await asUser(c.db, c.owner, `update production_cycles set status='active' where id=$1`, [CYC]);
  const today = (await c.db.query(`select vn_today()::text d`)).rows[0].d;
  const v = await cyc(c.db);
  assert.equal(v.s, today);
  const st = await stages(c.db);
  const addDays = async (n) => (await c.db.query(`select ($1::date + $2::int)::text d`, [today, n])).rows[0].d;
  assert.deepEqual(plan(st), [`${today}→${await addDays(2)}`, `${await addDays(3)}→${await addDays(6)}`, `${await addDays(7)}→${await addDays(11)}`]); // giữ số ngày từng giai đoạn
  assert.equal(v.e, await addDays(11)); // ngày dự kiến xong cũng đổi
});

test('đổi ngày bắt đầu vụ khi chưa giai đoạn nào chạy thì dời cả lịch; khi đã chạy thì không dời', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `update production_cycles set start_date='2026-12-01' where id=$1`, [CYC]);
  assert.deepEqual(plan(await stages(c.db)), ['2026-12-01→2026-12-03', '2026-12-04→2026-12-07', '2026-12-08→2026-12-12']);
  assert.equal((await cyc(c.db)).e, '2026-12-12');
  // chọn ngày bắt đầu riêng cùng lúc bắt đầu chạy thì giữ ngày đó
  await asUser(c.db, c.owner, `update production_cycles set status='active', start_date='2026-12-05' where id=$1`, [CYC]);
  assert.equal((await cyc(c.db)).s, '2026-12-05');
  assert.equal((await stages(c.db))[0].s, '2026-12-05');
  // đã có giai đoạn chạy: đổi ngày bắt đầu vụ không đụng lịch giai đoạn
  const first = (await stages(c.db))[0].id;
  await asUser(c.db, c.owner, `select advance_stage($1,'start','2026-12-05')`, [first]);
  await asUser(c.db, c.owner, `update production_cycles set start_date='2026-12-20' where id=$1`, [CYC]);
  assert.equal((await stages(c.db))[1].s, '2026-12-08');
});

test('bắt đầu giai đoạn lệch ngày: giai đoạn đó đúng ngày thực tế, các giai đoạn sau dời theo; hoàn thành trễ hoặc sớm thì giai đoạn sau dời theo', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `update production_cycles set status='active' where id=$1`, [CYC]);
  await asUser(c.db, c.owner, `update production_cycles set start_date='2026-11-01' where id=$1`, [CYC]); // đặt lại ngày bắt đầu (chưa giai đoạn nào chạy: lịch dời theo)
  const [s1, s2, s3] = await stages(c.db);
  // bắt đầu giai đoạn 1 trễ 2 ngày (3/11 thay vì 1/11)
  await asUser(c.db, c.owner, `select advance_stage($1,'start','2026-11-03')`, [s1.id]);
  assert.deepEqual(plan(await stages(c.db)), ['2026-11-03→2026-11-05', '2026-11-06→2026-11-09', '2026-11-10→2026-11-14']);
  // hoàn thành giai đoạn 1 trễ thêm 2 ngày (7/11 thay vì 5/11): giai đoạn sau dời +2
  await logOf(c.db, s1.id, '2026-11-07T03:00:00Z');
  await asUser(c.db, c.owner, `select advance_stage($1,'complete','2026-11-07')`, [s1.id]);
  assert.deepEqual(plan(await stages(c.db)).slice(1), ['2026-11-08→2026-11-11', '2026-11-12→2026-11-16']);
  // bắt đầu giai đoạn 2 đúng ngày kế hoạch (8/11): không đổi; hoàn thành sớm 1 ngày (10/11 thay vì 11/11): giai đoạn 3 dời -1
  await asUser(c.db, c.owner, `select advance_stage($1,'start','2026-11-08')`, [s2.id]);
  await logOf(c.db, s2.id, '2026-11-10T03:00:00Z');
  await asUser(c.db, c.owner, `select advance_stage($1,'complete','2026-11-10')`, [s2.id]);
  assert.equal((await stages(c.db))[2].s, '2026-11-11');
  assert.equal((await cyc(c.db)).e, '2026-11-15');
  void s3;
});

test('sửa ngày kết thúc kế hoạch của một giai đoạn: các giai đoạn sau dời theo; giai đoạn đang chạy hoặc đã xong không bị dời', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `update production_cycles set status='active' where id=$1`, [CYC]);
  await asUser(c.db, c.owner, `update production_cycles set start_date='2026-11-01' where id=$1`, [CYC]); // đặt lại ngày bắt đầu (chưa giai đoạn nào chạy: lịch dời theo)
  const [s1, s2, s3] = await stages(c.db);
  // kéo dài giai đoạn 1 thêm 2 ngày
  await asUser(c.db, c.owner, `select update_cycle_stage($1,'{"planned_end":"2026-11-05"}'::jsonb)`, [s1.id]);
  assert.deepEqual(plan(await stages(c.db)), ['2026-11-01→2026-11-05', '2026-11-06→2026-11-09', '2026-11-10→2026-11-14']);
  // đổi ngày bắt đầu mà giữ ngày kết thúc: các giai đoạn sau không đổi
  await asUser(c.db, c.owner, `select update_cycle_stage($1,'{"planned_start":"2026-11-02"}'::jsonb)`, [s1.id]);
  assert.equal((await stages(c.db))[1].s, '2026-11-06');
  // giai đoạn 2 đã chạy: sửa giai đoạn 1 không dời giai đoạn 2 (đang chạy), vẫn dời giai đoạn 3
  await asUser(c.db, c.owner, `select advance_stage($1,'start','2026-11-06')`, [s2.id]);
  await asUser(c.db, c.owner, `select update_cycle_stage($1,'{"planned_end":"2026-11-07"}'::jsonb)`, [s1.id]);
  const st = await stages(c.db);
  assert.equal(st[1].s, '2026-11-06');
  assert.equal(st[2].s, '2026-11-12');
  void s3;
});
