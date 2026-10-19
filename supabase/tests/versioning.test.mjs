import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

const AREA = '20000000-0000-4000-8000-0000000000dd';
const CYC = '30000000-0000-4000-8000-0000000000dd';
const LOG = '40000000-0000-4000-8000-0000000000dd';
const wt = `(select id from work_types where code='irrigation')`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const w1 = await addUser(db, 3);
  const w2 = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['worker']::member_role[])`, [org, mgr, w1, w2]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  await asUser(db, w1, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,note)
     values ($1,$2,$3,${wt},now(),$4,'ban đầu')`, [LOG, org, CYC, w1]);
  return { db, org, owner, mgr, w1, w2 };
}
const upd = (db, u, id, ver, op, changes) =>
  asUser(db, u, `select * from update_activity_log($1,$2,$3,$4::jsonb)`, [id, ver, op, JSON.stringify(changes)]);
const OP = (n) => uid(900 + n);

test('sửa đúng phiên bản: áp dụng, tăng phiên bản, có audit trước/sau', async () => {
  const { db, mgr } = await setup();
  const r = (await upd(db, mgr, LOG, 1, OP(1), { note: 'đã sửa', data: { duration_min: 20 } })).rows[0];
  assert.equal(r.version, 2);
  assert.equal(r.note, 'đã sửa');
  assert.deepEqual(r.data, { duration_min: 20 });
  const a = (await db.query(`select before->>'note' b, after->>'note' a from audit_events where entity='activity_logs' and action='UPDATE'`)).rows;
  assert.deepEqual(a, [{ b: 'ban đầu', a: 'đã sửa' }]);
});

test('xung đột: người sửa sau trên phiên bản cũ bị từ chối, dữ liệu người trước giữ nguyên', async () => {
  const { db, mgr, owner } = await setup();
  await upd(db, mgr, LOG, 1, OP(1), { note: 'của quản lý' });
  const msg = await expectError(upd(db, owner, LOG, 1, OP(2), { note: 'của chủ' }));
  assert.match(msg, /CONFLICT/);
  assert.equal((await db.query(`select note from activity_logs where id=$1`, [LOG])).rows[0].note, 'của quản lý');
  // giải quyết "giữ bản của tôi": gửi lại trên phiên bản mới nhất
  const r = (await upd(db, owner, LOG, 2, OP(2), { note: 'của chủ' })).rows[0];
  assert.equal(r.version, 3);
});

test('gửi lặp cùng op_id sau khi đã áp dụng: không coi là xung đột, không tăng phiên bản thêm', async () => {
  const { db, mgr } = await setup();
  await upd(db, mgr, LOG, 1, OP(1), { note: 'một lần' });
  const again = (await upd(db, mgr, LOG, 1, OP(1), { note: 'một lần' })).rows[0];
  assert.equal(again.version, 2);
  assert.equal((await db.query(`select version from activity_logs where id=$1`, [LOG])).rows[0].version, 2);
  // op khác trên phiên bản cũ thì vẫn là xung đột
  assert.match(await expectError(upd(db, mgr, LOG, 1, OP(3), { note: 'khác' })), /CONFLICT/);
});

test('quyền sửa: người ghi sửa/hủy bản ghi CỦA MÌNH trong 24 giờ; người khác thì không; quá 24 giờ thì không', async () => {
  const { db, w1, w2 } = await setup();
  assert.match(await expectError(upd(db, w2, LOG, 1, OP(1), { note: 'xen vào' })), /FORBIDDEN/);
  const r = (await upd(db, w1, LOG, 1, OP(2), { note: 'tôi sửa' })).rows[0];
  assert.equal(r.version, 2);
  // giả lập "đã quá 24 giờ": đổi received_at cần tạm tắt trigger bất biến (chỉ trong test)
  await db.exec(`alter table activity_logs disable trigger activity_logs_guard`);
  await db.query(`update activity_logs set received_at = now() - interval '25 hours' where id = $1`, [LOG]);
  await db.exec(`alter table activity_logs enable trigger activity_logs_guard`);
  const ver = (await db.query(`select version from activity_logs where id=$1`, [LOG])).rows[0].version; // việc đổi received_at ở trên cũng tăng phiên bản
  assert.match(await expectError(upd(db, w1, LOG, ver, OP(3), { note: 'quá muộn' })), /FORBIDDEN/);
});

test('hủy bản ghi: cần lý do, không khôi phục, không sửa nội dung sau khi hủy', async () => {
  const { db, w1, mgr } = await setup();
  assert.match(await expectError(upd(db, w1, LOG, 1, OP(1), { voided_at: new Date().toISOString() })), /check/);
  const r = (await upd(db, w1, LOG, 1, OP(2), { voided_at: new Date().toISOString(), void_reason: 'ghi nhầm vụ' })).rows[0];
  assert.ok(r.voided_at);
  assert.match(await expectError(upd(db, mgr, LOG, 2, OP(3), { voided_at: null, void_reason: null })), /VOIDED/);
  assert.match(await expectError(upd(db, mgr, LOG, 2, OP(4), { note: 'sửa sau khi hủy' })), /VOIDED/);
});

test('không đổi được vụ, người ghi, nguồn của nhật ký (kể cả chủ cơ sở gọi trực tiếp)', async () => {
  const { db, owner, w2 } = await setup();
  assert.match(await expectError(asUser(db, owner, `update activity_logs set cycle_id = null, area_id = $2 where id = $1`, [LOG, AREA])), /IMMUTABLE_FIELD/);
  assert.match(await expectError(asUser(db, owner, `update activity_logs set created_by = $2 where id = $1`, [LOG, w2])), /IMMUTABLE_FIELD/);
});

test('sửa vụ có kiểm tra phiên bản; người ghi không đổi được trạng thái vụ; hạn mức vẫn được ép', async () => {
  const { db, owner, w1, org } = await setup();
  const call = (u, ver, op, ch) => asUser(db, u, `select * from update_cycle($1,$2,$3,$4::jsonb)`, [CYC, ver, op, JSON.stringify(ch)]);
  assert.match(await expectError(call(w1, 1, OP(1), { status: 'paused' })), /FORBIDDEN/);
  const r = (await call(owner, 1, OP(2), { status: 'paused' })).rows[0];
  assert.equal(r.status, 'paused');
  assert.equal(r.version, 2);
  assert.match(await expectError(call(owner, 1, OP(3), { status: 'ended' })), /CONFLICT/);
  assert.equal((await call(owner, 1, OP(2), { status: 'paused' })).rows[0].version, 2); // gửi lặp
  // hạn mức: 2 vụ tối đa; vụ thứ 3 đang chuẩn bị không kích hoạt được
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values
    ('30000000-0000-4000-8000-0000000000e1',$1,$2,(select id from crop_types limit 1),'active'),
    ('30000000-0000-4000-8000-0000000000e2',$1,$2,(select id from crop_types limit 1),'preparing')`, [org, AREA]);
  const msg = await expectError(asUser(db, owner, `select * from update_cycle('30000000-0000-4000-8000-0000000000e2',1,$1,'{"status":"active"}'::jsonb)`, [OP(9)]));
  assert.match(msg, /QUOTA_EXCEEDED/);
});
