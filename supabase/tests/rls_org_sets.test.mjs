import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0231 (D204): các hàm TẬP (perm_orgs, admin_org_ids, owner_org_ids, member_org_ids, my_worker_ids, led_worker_ids) phải cho kết quả
// GIỐNG HỆT hàm kiểm quyền cũ (has_perm, is_workforce_admin, has_org_role, is_org_member, is_worker_self, is_team_leader_of) với từng người × từng tổ chức,
// và các chính sách đọc đã đổi vẫn cho đúng người thấy đúng dòng.

const MODULES = ['inventory', 'harvest', 'expenses', 'sales', 'summary', 'declare', 'website', 'coop', 'payroll'];

async function universe() {
  const db = await createDb();
  const u = {};
  for (const [i, n] of ['ownerA', 'mgrA', 'workerA', 'overrideA', 'leaderA', 'ownerB', 'outsider', 'blocked', 'suspended'].entries()) u[n] = await addUser(db, i + 1);
  const A = (await asUser(db, u.ownerA, `select create_organization('household','Trại A') id`)).rows[0].id;
  const B = (await asUser(db, u.ownerB, `select create_organization('household','Trại B') id`)).rows[0].id;
  const ins = (uid, org, roles, perms = '{}', status = 'active') => db.query(
    `insert into organization_memberships (organization_id,user_id,roles,permissions,status) values ($1,$2,$3::member_role[],$4::jsonb,$5::member_status)`, [org, uid, roles, perms, status]);
  await ins(u.mgrA, A, '{manager}');
  await ins(u.workerA, A, '{worker}');
  await ins(u.overrideA, A, '{worker}', '{"expenses":"view","payroll":"edit","inventory":"edit"}');
  await ins(u.leaderA, A, '{worker}');
  await ins(u.ownerB, A, '{worker}');                      // chủ của B nhưng chỉ là nhân viên ở A
  await ins(u.blocked, A, '{manager}');                    // tài khoản chưa đổi mật khẩu tạm
  await ins(u.suspended, A, '{manager}', '{}', 'revoked');
  await db.query(`insert into staff_accounts (user_id, organization_id, phone, auth_email, full_name, must_change_password) values ($1,$2,'0900000001','blocked@sdt.test','Bị khóa',true)`, [u.blocked, A]);
  const w = {};
  for (const [name, uid] of Object.entries({ workerA: u.workerA, leaderA: u.leaderA, overrideA: u.overrideA, mgrA: u.mgrA, blocked: u.blocked })) {
    w[name] = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,$3) returning id`, [A, uid, name])).rows[0].id;
  }
  w.nobody = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Không tài khoản') returning id`, [A])).rows[0].id;
  w.inB = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Ở B') returning id`, [B])).rows[0].id;
  const team = '81000000-0000-4000-8000-0000000000f1';
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ($1,$2,'Tổ 1',$3)`, [team, A, w.leaderA]);
  await db.query(`insert into worker_team_memberships (team_id,worker_id) values ($1,$2),($1,$3),($1,$4)`, [team, w.leaderA, w.workerA, w.nobody]);
  return { db, u, A, B, w };
}

test('hàm tập cho kết quả giống hệt hàm kiểm quyền cũ: từng người × từng tổ chức × từng mục × mức xem/sửa', async () => {
  const { db, u, A, B } = await universe();
  for (const [name, uid] of Object.entries(u)) {
    for (const org of [A, B]) {
      for (const m of MODULES) for (const need of ['view', 'edit']) {
        const r = (await asUser(db, uid, `select has_perm($1,$2,$3) a, $1 in (select perm_orgs($2,$3)) b`, [org, m, need])).rows[0];
        assert.equal(r.b, r.a, `has_perm khác perm_orgs: ${name} org=${org === A ? 'A' : 'B'} ${m}/${need}`);
      }
      const r = (await asUser(db, uid, `select is_workforce_admin($1) a1, $1 in (select admin_org_ids()) b1, has_org_role($1, array['owner']::member_role[]) a2, $1 in (select owner_org_ids()) b2,
                                               is_org_member($1) a3, $1 in (select member_org_ids()) b3`, [org])).rows[0];
      assert.deepEqual([r.b1, r.b2, r.b3], [r.a1, r.a2, r.a3], `vai trò khác tập: ${name} org=${org === A ? 'A' : 'B'}`);
    }
  }
});

test('hàm tập người làm: is_worker_self và is_team_leader_of giống my_worker_ids và led_worker_ids cho từng người × từng hồ sơ lao động', async () => {
  const { db, u, w } = await universe();
  for (const [name, uid] of Object.entries(u)) {
    for (const [wn, wid] of Object.entries(w)) {
      const r = (await asUser(db, uid, `select is_worker_self($1) a1, $1 in (select my_worker_ids()) b1, is_team_leader_of($1) a2, $1 in (select led_worker_ids()) b2`, [wid])).rows[0];
      assert.deepEqual([r.b1, r.b2], [r.a1, r.a2], `người làm khác tập: ${name} hồ sơ ${wn}`);
    }
  }
  // ý nghĩa: tổ trưởng thấy người trong tổ, nhân viên thấy chính mình, chủ ở tổ chức khác không thấy ai
  assert.equal((await asUser(db, u.leaderA, `select count(*)::int n from led_worker_ids()`)).rows[0].n, 3);
  assert.equal((await asUser(db, u.workerA, `select count(*)::int n from my_worker_ids()`)).rows[0].n, 1);
  assert.equal((await asUser(db, u.blocked, `select count(*)::int n from my_worker_ids()`)).rows[0].n, 0);       // tài khoản đang bị khóa
});

test('chính sách đọc đã đổi vẫn đúng: chi phí theo quyền mục, công theo chủ/quản lý/tổ trưởng/chính mình, nhật ký kiểm toán chỉ chủ', async () => {
  const { db, u, A, B, w } = await universe();
  const seeOrg = (name, table) => asUser(db, u[name], `select count(*)::int n from ${table}`).then((r) => r.rows[0].n);
  // bảng đọc theo quyền mục (assets: expenses/view): người thấy dòng phải đúng là người has_perm cho tổ chức đó
  await asUser(db, u.ownerA, `select * from create_asset('83000000-0000-4000-8000-000000000001',$1,'Máy bơm A','pump',null,'2026-01-01'::date,6000000,3,0,null,null)`, [A]);
  await asUser(db, u.ownerB, `select * from create_asset('83000000-0000-4000-8000-000000000002',$1,'Máy bơm B','pump',null,'2026-01-01'::date,6000000,3,0,null,null)`, [B]);
  for (const name of Object.keys(u)) {
    const seen = (await asUser(db, u[name], `select array_agg(organization_id order by name) o from assets`)).rows[0].o ?? [];
    const expected = [];
    for (const org of [A, B]) if ((await asUser(db, u[name], `select has_perm($1,'expenses','view') ok`, [org])).rows[0].ok) expected.push(org);
    assert.deepEqual([...seen].sort(), expected.sort(), `assets: ${name}`);
  }
  assert.equal((await asUser(db, u.overrideA, `select count(*)::int n from assets`)).rows[0].n, 1);   // quyền cấp riêng đè lên mặc định theo vai trò
  assert.equal((await asUser(db, u.workerA, `select count(*)::int n from assets`)).rows[0].n, 0);
  // công: bốn người khác nhau
  const rec = async (wid, n) => db.query(`insert into attendance_records (id, worker_id, work_date, started_at, ended_at, source) values ($1,$2,vn_today(),now() - interval '9 hours', now() - interval '1 hour','admin')`, [`82000000-0000-4000-8000-00000000000${n}`, wid]);
  await rec(w.workerA, 1); await rec(w.nobody, 2); await rec(w.leaderA, 3); await rec(w.inB, 4);
  assert.equal(await seeOrg('ownerA', 'attendance_records'), 3);       // chủ A thấy công của A, không thấy của B
  assert.equal(await seeOrg('mgrA', 'attendance_records'), 3);
  assert.equal(await seeOrg('workerA', 'attendance_records'), 1);      // nhân viên chỉ thấy công của mình
  assert.equal(await seeOrg('leaderA', 'attendance_records'), 3);      // tổ trưởng: mình + người trong tổ (workerA, nobody) = 3
  assert.equal(await seeOrg('outsider', 'attendance_records'), 0);
  assert.equal(await seeOrg('blocked', 'attendance_records'), 0);      // chưa đổi mật khẩu tạm: không thấy gì
  assert.equal(await seeOrg('ownerB', 'attendance_records'), 1);       // chủ B thấy công ở B; ở A chỉ là nhân viên nên không thấy công người khác
  // nhật ký kiểm toán: chủ thấy của tổ chức mình; quản lý không
  await db.query(`insert into audit_events (organization_id, actor_id, action, entity) values ($1,$2,'t','t'), ($3,$2,'t','t')`, [A, u.ownerA, B]);
  assert.ok((await seeOrg('ownerA', 'audit_events')) >= 1);
  const mgrSees = (await asUser(db, u.mgrA, `select count(*)::int n from audit_events where action = 't'`)).rows[0].n;
  assert.equal(mgrSees, 0);
  const ownerSees = (await asUser(db, u.ownerA, `select count(*)::int n from audit_events where action = 't'`)).rows[0].n;
  assert.equal(ownerSees, 1);
});
