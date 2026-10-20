import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0032 (D44): chức vụ, quyền Khai báo, hạn chế loại việc, quyền quản lý giai đoạn, chấm công cho chủ.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const id = (n) => `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), tech = await addUser(db, 2), wk = await addUser(db, 3), mgr = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values
    ($1,$2,array['worker']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['manager']::member_role[])`, [org, tech, wk, mgr]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'T') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'M') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  const cyc = id(900);
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,current_date,'active')`, [cyc, org, area, tpl]);
  return { db, owner, tech, wk, mgr, org, cyc };
}
const save = (db, u, org, over = {}) => asUser(db, u,
  `select save_position($1,$2,$3,$4,$5::jsonb,$6::uuid[],$7,$8) id`,
  [org, over.id ?? null, over.name ?? 'Kỹ thuật viên', 'Phụ trách kỹ thuật', JSON.stringify(over.perms ?? { declare: 'edit', inventory: 'view' }), over.wts ?? null, over.stages ?? false, over.active ?? true]);

test('chức vụ: chỉ chủ tạo/sửa/xóa/gán; quyền hiệu lực = hợp vai trò và chức vụ; chủ cấp riêng đè lên; ngừng thì mất tác dụng', async () => {
  const { db, owner, tech, mgr, org } = await setup();
  assert.match(await expectError(save(db, mgr, org)), /FORBIDDEN/);
  assert.match(await expectError(save(db, owner, org, { perms: { declare: 'full' } })), /INVALID_PERMISSIONS/);
  const pos = (await save(db, owner, org)).rows[0].id;
  const lvl = async (u, m) => (await asUser(db, u, `select perm_level($1,$2) l`, [org, m])).rows[0].l;

  assert.equal(await lvl(tech, 'declare'), 0);
  assert.equal(await lvl(tech, 'inventory'), 0);
  assert.match(await expectError(asUser(db, mgr, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]])), /FORBIDDEN/);
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]]);
  assert.equal(await lvl(tech, 'declare'), 2);
  assert.equal(await lvl(tech, 'inventory'), 1);
  assert.equal(await lvl(tech, 'harvest'), 2); // vai trò mặc định vẫn còn
  // chủ cấp riêng đè lên (cả bớt quyền)
  await asUser(db, owner, `select set_member_permissions($1,$2,'{"declare":"none"}'::jsonb)`, [org, tech]);
  assert.equal(await lvl(tech, 'declare'), 0);
  await asUser(db, owner, `select set_member_permissions($1,$2,'{}'::jsonb)`, [org, tech]);
  // ngừng chức vụ thì không còn hiệu lực
  await save(db, owner, org, { id: pos, active: false });
  assert.equal(await lvl(tech, 'declare'), 0);
  assert.match(await expectError(asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]])), /INVALID_POSITION/);
  // xóa chức vụ gỡ khỏi người giữ
  await save(db, owner, org, { id: pos, active: true });
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]]);
  await asUser(db, owner, `select delete_position($1)`, [pos]);
  assert.deepEqual((await db.query(`select position_ids from organization_memberships where user_id=$1`, [tech])).rows[0].position_ids, []);
});

test('quyền Khai báo theo chức vụ: người được cấp tạo được sản phẩm/mẫu/trang trại; người khác không', async () => {
  const { db, owner, tech, wk, org } = await setup();
  const add = (u, n) => asUser(db, u, `insert into crop_types (organization_id, name) values ($1,$2)`, [org, n]);
  assert.match(await expectError(add(tech, 'Ớt')), /row-level security/);
  const pos = (await save(db, owner, org)).rows[0].id;
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]]);
  await add(tech, 'Ớt');
  await asUser(db, tech, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Trang trại 2')`, [org]);
  assert.match(await expectError(add(wk, 'Cà')), /row-level security/);
});

test('hạn chế loại việc: chức vụ giới hạn thì chỉ ghi được loại được phép; chưa gán/không giới hạn thì ghi mọi loại', async () => {
  const { db, owner, tech, wk, mgr, org, cyc } = await setup();
  const log = (u, n, code) => asUser(db, u, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,source)
     values ($1,$2,$3,${wt(code)},now(),$4,'online') on conflict (id) do nothing`, [id(n), org, cyc, u]);
  await log(tech, 1, 'spraying'); // chưa gán chức vụ: ghi được mọi loại
  const irrigationId = (await db.query(`select id from work_types where organization_id is null and code='irrigation'`)).rows[0].id;
  const pos = (await save(db, owner, org, { name: 'Tưới tiêu', perms: {}, wts: [irrigationId] })).rows[0].id;
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]]);
  await log(tech, 2, 'irrigation');
  assert.match(await expectError(log(tech, 3, 'spraying')), /row-level security/);
  await log(wk, 4, 'spraying'); // người khác không bị ảnh hưởng
  await log(mgr, 5, 'spraying'); // quản lý luôn được
  // thêm một chức vụ không giới hạn thì được mọi loại
  const free = (await save(db, owner, org, { name: 'Tổng hợp', perms: {} })).rows[0].id;
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos, free]]);
  await log(tech, 6, 'spraying');
  assert.match(await expectError(save(db, owner, org, { name: 'Sai', perms: {}, wts: ['00000000-0000-4000-8000-0000000000aa'] })), /INVALID_WORK_TYPE/);
});

test('quản lý giai đoạn theo chức vụ: được bắt đầu/sửa giai đoạn; người không có chức vụ thì không', async () => {
  const { db, owner, tech, wk, org, cyc } = await setup();
  const st = (await db.query(`select id from production_stages where cycle_id=$1`, [cyc])).rows[0].id;
  assert.match(await expectError(asUser(db, tech, `select advance_stage($1,'start',null)`, [st])), /FORBIDDEN/);
  const pos = (await save(db, owner, org, { name: 'Giám sát', perms: {}, stages: true })).rows[0].id;
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [pos]]);
  assert.equal((await asUser(db, tech, `select * from advance_stage($1,'start',null)`, [st])).rows[0].status, 'in_progress');
  await asUser(db, tech, `select * from update_cycle_stage($1, '{"note":"Theo dõi sát"}'::jsonb)`, [st]);
  assert.match(await expectError(asUser(db, wk, `select advance_stage($1,'complete',null)`, [st])), /FORBIDDEN/);
});

test('chủ và nhân viên có hồ sơ lao động tự tạo để chấm công; người chỉ Kho & chi phí thì không', async () => {
  const { db, owner, wk, org } = await setup();
  const w1 = (await asUser(db, owner, `select ensure_my_worker($1) id`, [org])).rows[0].id;
  assert.equal((await asUser(db, owner, `select ensure_my_worker($1) id`, [org])).rows[0].id, w1); // lặp không tạo thêm
  await asUser(db, owner, `select * from clock_in($1,$2)`, [id(50), org]); // chủ chấm công được
  assert.ok((await asUser(db, wk, `select ensure_my_worker($1) id`, [org])).rows[0].id);
  const fin = await addUser(db, 9);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['inventory_finance']::member_role[])`, [org, fin]);
  assert.match(await expectError(asUser(db, fin, `select ensure_my_worker($1)`, [org])), /FORBIDDEN/);
});
