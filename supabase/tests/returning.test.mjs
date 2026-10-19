import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// PostgREST thường thêm RETURNING vào INSERT. Khi đó chính sách SELECT cũng được kiểm tra trên hàng vừa thêm.
// Chính sách SELECT không được tra cứu hàng mới theo id trong bảng (hàng chưa nhìn thấy được trong câu lệnh đang chạy).
test('INSERT ... RETURNING hoạt động cho khu trồng và vụ (chủ hộ)', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const org = (await asUser(db, u, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const area = '20000000-0000-4000-8000-0000000000aa';
  const cyc = '30000000-0000-4000-8000-0000000000aa';

  const a = await asUser(db, u, `insert into production_areas (id, organization_id, name) values ($1,$2,'N1') returning id`, [area, org]);
  assert.equal(a.rows.length, 1);

  const c = await asUser(db, u, `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
     values ($1,$2,$3,(select id from crop_types limit 1),'active') returning id`, [cyc, org, area]);
  assert.equal(c.rows.length, 1);

  // đúng kiểu PostgREST upsert bỏ qua trùng
  const again = await asUser(db, u, `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
     values ($1,$2,$3,(select id from crop_types limit 1),'active') on conflict (id) do nothing returning id`, [cyc, org, area]);
  assert.equal(again.rows.length, 0);
});

test('INSERT ... RETURNING cho nhật ký và giao dịch kho', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const org = (await asUser(db, u, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const area = '20000000-0000-4000-8000-0000000000aa';
  const cyc = '30000000-0000-4000-8000-0000000000aa';
  await asUser(db, u, `insert into production_areas (id, organization_id, name) values ($1,$2,'N1')`, [area, org]);
  await asUser(db, u, `insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status)
     values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [cyc, org, area]);
  const l = await asUser(db, u, `insert into activity_logs (id, organization_id, cycle_id, work_type_id, performed_at, created_by)
     values ('40000000-0000-4000-8000-0000000000aa',$1,$2,(select id from work_types where code='irrigation'),now(),$3) returning id`, [org, cyc, u]);
  assert.equal(l.rows.length, 1);
});
