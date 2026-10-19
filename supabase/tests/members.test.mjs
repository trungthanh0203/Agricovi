import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

const org = async (db, u, type, name) => (await asUser(db, u, `select create_organization($1::org_type, $2) id`, [type, name])).rows[0].id;
const R = (...r) => `array[${r.map((x) => `'${x}'`).join(',')}]::member_role[]`;
const rolesOf = async (db, who, o, user) =>
  (await asUser(db, who, `select roles::text[] roles from organization_memberships where organization_id=$1 and user_id=$2`, [o, user])).rows[0]?.roles;

test('tài khoản đã có cơ sở không tự tạo thêm cơ sở (Hộ chỉ 1 cơ sở)', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  await org(db, u, 'household', 'Hộ của tôi');
  assert.match(await expectError(asUser(db, u, `select create_organization('household','Hộ thứ hai')`)), /ORG_LIMIT/);
  assert.match(await expectError(asUser(db, u, `select create_organization('cooperative','HTX')`)), /ORG_LIMIT/);
});

test('mời thành viên: chỉ chủ mời; chấp nhận bằng đúng email; nhiều vai trò; vai trò hợp lệ', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2); // u2@test.local
  const other = await addUser(db, 3);
  const O = await org(db, owner, 'household', 'Hộ A');

  assert.match(await expectError(asUser(db, other, `select invite_member($1,'x@y.vn',${R('worker')})`, [O])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select invite_member($1,'x@y.vn',${R('owner')})`, [O])), /INVALID_ROLE/);
  assert.match(await expectError(asUser(db, owner, `select invite_member($1,'x@y.vn',${R('cooperative_manager')})`, [O])), /INVALID_ROLE/);
  assert.match(await expectError(asUser(db, owner, `select invite_member($1,'x@y.vn','{}'::member_role[])`, [O])), /INVALID_ROLE/);

  // nhân viên kiêm Kho & chi phí (trùng được bỏ; thứ tự theo khai báo của kiểu: worker trước inventory_finance)
  const inv = (await asUser(db, owner, `select invite_member($1,'  U2@Test.local ',${R('inventory_finance', 'worker', 'worker')}) id`, [O])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select invite_member($1,'u2@test.local',${R('manager')})`, [O])), /ALREADY_INVITED/);

  assert.equal((await asUser(db, other, `select count(*)::int n from my_invitations()`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, other, `select accept_invitation($1)`, [inv])), /FORBIDDEN/);

  const mine = (await asUser(db, worker, `select roles::text[] roles, org_name from my_invitations()`)).rows;
  assert.deepEqual(mine, [{ roles: ['worker', 'inventory_finance'], org_name: 'Hộ A' }]);

  await asUser(db, worker, `select accept_invitation($1)`, [inv]);
  assert.deepEqual(await rolesOf(db, worker, O, worker), ['worker', 'inventory_finance']);
  assert.match(await expectError(asUser(db, worker, `select accept_invitation($1)`, [inv])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select invite_member($1,'u2@test.local',${R('manager')})`, [O])), /ALREADY_MEMBER/);
  // người lao động không đọc được danh sách thành viên kèm email, không mời được
  assert.match(await expectError(asUser(db, worker, `select * from list_org_members($1)`, [O])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, worker, `select invite_member($1,'z@z.vn',${R('worker')})`, [O])), /FORBIDDEN/);
  // người được mời làm nhân viên vẫn tạo được cơ sở riêng (chưa là chủ cơ sở nào)
  await org(db, worker, 'household', 'Hộ của nhân viên');
});

test('đổi nhiều vai trò, gỡ thành viên: không đụng chủ cơ sở; gỡ rồi mất quyền truy cập', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const w = await addUser(db, 2);
  const O = await org(db, owner, 'household', 'Hộ A');
  const inv = (await asUser(db, owner, `select invite_member($1,'u2@test.local',${R('worker')}) id`, [O])).rows[0].id;
  await asUser(db, w, `select accept_invitation($1)`, [inv]);

  await asUser(db, owner, `select set_member_roles($1,$2,${R('inventory_finance', 'manager')})`, [O, w]);
  assert.deepEqual(await rolesOf(db, w, O, w), ['manager', 'inventory_finance']);
  assert.match(await expectError(asUser(db, owner, `select set_member_roles($1,$2,${R('worker')})`, [O, owner])), /INVALID_ROLE/);
  assert.match(await expectError(asUser(db, owner, `select set_member_roles($1,$2,${R('owner')})`, [O, w])), /INVALID_ROLE/);
  assert.match(await expectError(asUser(db, owner, `select remove_member($1,$2)`, [O, owner])), /INVALID_ROLE/);
  assert.match(await expectError(asUser(db, w, `select set_member_roles($1,$2,${R('worker')})`, [O, w])), /FORBIDDEN/);

  const list = (await asUser(db, owner, `select roles::text[] roles from list_org_members($1)`, [O])).rows;
  assert.deepEqual(list.map((r) => r.roles), [['owner'], ['manager', 'inventory_finance']]);

  await asUser(db, owner, `select remove_member($1,$2)`, [O, w]);
  assert.equal((await asUser(db, w, `select count(*)::int n from organizations`)).rows[0].n, 0);
  assert.ok((await db.query(`select count(*)::int n from audit_events where entity='organization_memberships'`)).rows[0].n >= 3);
  // được mời lại sau khi bị gỡ: chỉ nhận vai trò mới, không giữ vai trò cũ
  const inv2 = (await asUser(db, owner, `select invite_member($1,'u2@test.local',${R('worker')}) id`, [O])).rows[0].id;
  await asUser(db, w, `select accept_invitation($1)`, [inv2]);
  assert.deepEqual(await rolesOf(db, w, O, w), ['worker']);
});

test('chủ bao gồm mọi vai trò (chủ kiêm quản lý, kiêm kho & chi phí, kiêm quản lý HTX)', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const H = await org(db, owner, 'household', 'Hộ A');
  for (const r of ['manager', 'worker', 'inventory_finance', 'profile_editor']) {
    assert.equal((await asUser(db, owner, `select has_org_role($1, ${R(r)}) ok`, [H])).rows[0].ok, true, r);
  }
  const boss = await addUser(db, 2);
  const C = await org(db, boss, 'cooperative', 'HTX');
  assert.equal((await asUser(db, boss, `select has_org_role($1, ${R('cooperative_manager')}) ok`, [C])).rows[0].ok, true);

  // người không phải chủ chỉ có đúng vai trò được gán
  const w = await addUser(db, 3);
  const inv = (await asUser(db, boss, `select invite_member($1,'u3@test.local',${R('worker', 'inventory_finance')}) id`, [C])).rows[0].id;
  await asUser(db, w, `select accept_invitation($1)`, [inv]);
  const has = async (r) => (await asUser(db, w, `select has_org_role($1, ${R(r)}) ok`, [C])).rows[0].ok;
  assert.equal(await has('worker'), true);
  assert.equal(await has('inventory_finance'), true);
  assert.equal(await has('manager'), false);
  assert.equal(await has('owner'), false);
});

test('tổ trưởng kiêm Quản lý HTX: có cả quyền theo tổ và quyền cấp HTX', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const lead = await addUser(db, 2); // u2@test.local
  const C = await org(db, boss, 'cooperative', 'HTX');
  const inv = (await asUser(db, boss, `select invite_member($1,'u2@test.local',${R('worker', 'cooperative_manager')}) id`, [C])).rows[0].id;
  await asUser(db, lead, `select accept_invitation($1)`, [inv]);
  // gọi được hàm dành cho quản lý HTX
  assert.deepEqual((await asUser(db, lead, `select name from list_coop_households($1)`, [C])).rows, []);
  const prof = (await db.query(`insert into worker_profiles (organization_id, user_id, full_name) values ($1,$2,'Hải') returning id`, [C, lead])).rows[0].id;
  await db.query(`insert into worker_teams (organization_id, name, leader_worker_id) values ($1,'Tổ 1',$2)`, [C, prof]);
  const m = (await asUser(db, boss, `select leads_teams from list_org_members($1) where leads_teams is not null`, [C])).rows;
  assert.deepEqual(m, [{ leads_teams: ['Tổ 1'] }]);
});

test('HTX mời hộ có sẵn; hộ chấp nhận; mỗi hộ chỉ một HTX', async () => {
  const db = await createDb();
  const boss1 = await addUser(db, 1);
  const boss2 = await addUser(db, 2);
  const farmer = await addUser(db, 3); // u3@test.local
  const C1 = await org(db, boss1, 'cooperative', 'HTX Một');
  const C2 = await org(db, boss2, 'cooperative', 'HTX Hai');
  const H = await org(db, farmer, 'household', 'Hộ Ba');

  assert.match(await expectError(asUser(db, farmer, `select invite_household($1,'a@b.vn')`, [C1])), /FORBIDDEN/);
  const i1 = (await asUser(db, boss1, `select invite_household($1,'u3@test.local') id`, [C1])).rows[0].id;
  const i2 = (await asUser(db, boss2, `select invite_household($1,'u3@test.local') id`, [C2])).rows[0].id;

  const pend = (await asUser(db, farmer, `select coop_name from my_coop_invitations() order by coop_name`)).rows;
  assert.deepEqual(pend.map((r) => r.coop_name), ['HTX Hai', 'HTX Một']);

  assert.match(await expectError(asUser(db, boss1, `select accept_coop_invitation($1,$2)`, [i1, H])), /FORBIDDEN/);
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [i1, H]);
  assert.deepEqual((await asUser(db, farmer, `select name from my_cooperative($1)`, [H])).rows, [{ name: 'HTX Một' }]);
  assert.match(await expectError(asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [i2, H])), /ALREADY_IN_COOPERATIVE/);

  assert.deepEqual((await asUser(db, boss1, `select name, managed from list_coop_households($1)`, [C1])).rows, [{ name: 'Hộ Ba', managed: false }]);
  assert.equal((await asUser(db, boss1, `select count(*)::int n from organizations where id=$1`, [H])).rows[0].n, 0);
});

test('hộ rời HTX: bị chặn khi còn vụ ghi theo HTX đang chạy, rời được khi đã kết thúc', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const farmer = await addUser(db, 2);
  const C = await org(db, boss, 'cooperative', 'HTX');
  const H = await org(db, farmer, 'household', 'Hộ');
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [C])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv, H]);

  const area = '20000000-0000-4000-8000-0000000000bb';
  const cyc = '30000000-0000-4000-8000-0000000000bb';
  await asUser(db, farmer, `insert into production_areas (id, organization_id, name) values ($1,$2,'N1')`, [area, H]);
  await asUser(db, farmer, `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
     values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [cyc, C, area]);

  assert.match(await expectError(asUser(db, farmer, `select leave_cooperative($1)`, [H])), /HAS_ACTIVE_COOP_CYCLES/);
  assert.match(await expectError(asUser(db, boss, `select remove_household($1,$2)`, [C, H])), /HAS_ACTIVE_COOP_CYCLES/);

  await asUser(db, boss, `update production_cycles set status='ended' where id=$1`, [cyc]);
  await asUser(db, farmer, `select leave_cooperative($1)`, [H]);
  assert.equal((await asUser(db, farmer, `select count(*)::int n from my_cooperative($1)`, [H])).rows[0].n, 0);
  const boss2 = await addUser(db, 3);
  const C2 = await org(db, boss2, 'cooperative', 'HTX Hai');
  const inv2 = (await asUser(db, boss2, `select invite_household($1,'u2@test.local') id`, [C2])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2)`, [inv2, H]);
});

test('HTX tạo hộ thành viên: HTX là chủ quản, tự có gói dùng thử, không rời/gỡ được khi chưa chuyển quyền', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const stranger = await addUser(db, 2);
  const C = await org(db, boss, 'cooperative', 'HTX');

  assert.match(await expectError(asUser(db, stranger, `select create_member_household($1,'Hộ X')`, [C])), /FORBIDDEN/);
  const H = (await asUser(db, boss, `select create_member_household($1,'Hộ bác Tư') id`, [C])).rows[0].id;

  assert.deepEqual((await asUser(db, boss, `select name, managed from list_coop_households($1)`, [C])).rows, [{ name: 'Hộ bác Tư', managed: true }]);
  const sub = (await db.query(`select status, max_cycles from subscriptions where organization_id=$1`, [H])).rows[0];
  assert.equal(sub.status, 'trial');
  assert.equal(sub.max_cycles, 2);
  assert.deepEqual(await rolesOf(db, boss, H, boss), ['owner']);

  assert.match(await expectError(asUser(db, boss, `select remove_household($1,$2)`, [C, H])), /MANAGED_HOUSEHOLD/);
  assert.match(await expectError(asUser(db, boss, `select leave_cooperative($1)`, [H])), /MANAGED_HOUSEHOLD/);
});

test('khách chưa đăng nhập không gọi được các hàm quản lý thành viên', async () => {
  const db = await createDb();
  for (const sql of [
    `select my_invitations()`, `select invite_member(gen_random_uuid(),'a@b.vn',${R('worker')})`,
    `select create_member_household(gen_random_uuid(),'X')`, `select current_email()`,
    `select create_team(gen_random_uuid(),'T')`,
  ]) {
    assert.match(await expectError(asAnon(db, sql)), /permission denied/);
  }
});
