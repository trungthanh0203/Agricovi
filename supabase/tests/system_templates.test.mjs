import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { totalDays } from '../../apps/app/src/lib/templates.ts';

// Migration 0113: quy trình mẫu hệ thống (dưa lưới) và hàm áp dụng cho cơ sở.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const other = await addUser(db, 3);
  const admin = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  const sys = (await db.query(`select id, version from system_templates where code='melon_greenhouse'`)).rows[0];
  const melon = (await db.query(`select id from crop_types where organization_id is null and code='melon'`)).rows[0].id;
  return { db, owner, worker, other, admin, org, org2, sys, melon };
}

test('mẫu dưa lưới có sẵn: 7 công đoạn, 17 việc chạy song song/lặp lại, tổng 79 ngày; mọi người đăng nhập đọc được, chỉ quản trị nền tảng ghi', async () => {
  const { db, owner, worker, admin, sys } = await setup();
  assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [sys.id])).rows[0].n, 7);
  const rows = (await db.query(`select id, seq, duration_days, start_day, repeat_every_days from system_template_stages where system_template_id=$1 order by seq`, [sys.id])).rows;
  assert.equal(rows.length, 17);
  assert.equal(totalDays(rows), 79); // ngày kết thúc muộn nhất, không phải tổng thời lượng
  assert.ok(rows.some((r) => r.start_day === 32 && r.repeat_every_days === 5));
  assert.equal((await asUser(db, worker, `select count(*)::int n from system_templates`)).rows[0].n, 3);
  assert.match(await expectError(asUser(db, owner, `insert into system_templates (code, kind, name) values ('x','crop','X')`)), /row-level security/);
  await asUser(db, owner, `update system_templates set name='Đổi' where id=$1`, [sys.id]); // RLS: không có dòng nào được sửa
  assert.equal((await db.query(`select name from system_templates where id=$1`, [sys.id])).rows[0].name, 'Dưa lưới nhà màng (bản tham khảo)');
  await asUser(db, admin, `insert into system_templates (code, kind, name) values ('pig_x','livestock','Heo thử')`);
});

test('áp dụng cho cơ sở: sao đủ công đoạn và việc, ghi nguồn; áp lặp đặt tên khác; bấm lặp cùng mã không nhân đôi', async () => {
  const { db, owner, org, sys, melon } = await setup();
  const id = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, melon])).rows[0].id;
  const t = (await db.query(`select name, source_system_id, source_version from cycle_templates where id=$1`, [id])).rows[0];
  assert.equal(t.source_system_id, sys.id); assert.equal(t.source_version, sys.version); assert.equal(t.name, 'Dưa lưới nhà màng (bản tham khảo)');
  assert.equal((await db.query(`select count(*)::int n from template_phases where template_id=$1`, [id])).rows[0].n, 7);
  const rows = (await db.query(`select s.name, s.duration_days, s.importance, p.name phase from template_stages s join template_phases p on p.id=s.phase_id where s.template_id=$1 order by s.seq`, [id])).rows;
  assert.equal(rows.length, 17);
  assert.deepEqual(rows[0], { name: 'Chuẩn bị giá thể', duration_days: 5, importance: 'high', phase: 'Chuẩn bị' });
  assert.equal(rows[16].name, 'Thu hoạch cây trồng');
  const id2 = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, melon])).rows[0].id;
  assert.equal((await db.query(`select name from cycle_templates where id=$1`, [id2])).rows[0].name, 'Dưa lưới nhà màng (bản tham khảo) (2)');
  const pid = '7aaaaaaa-0000-4000-8000-000000000001';
  await asUser(db, owner, `select apply_system_template($1,$2,$3,'Dưa của tôi',$4)`, [org, sys.id, melon, pid]);
  await asUser(db, owner, `select apply_system_template($1,$2,$3,'Dưa của tôi',$4)`, [org, sys.id, melon, pid]);
  assert.equal((await db.query(`select count(*)::int n from cycle_templates where id=$1`, [pid])).rows[0].n, 1);
  // sửa bản của cơ sở không đổi mẫu hệ thống
  await asUser(db, owner, `delete from template_stages where template_id=$1`, [id]);
  assert.equal((await db.query(`select count(*)::int n from system_template_stages where system_template_id=$1`, [sys.id])).rows[0].n, 17);
});

test('áp dụng: nhân viên không được; sản phẩm phải cùng loại và thuộc cơ sở; mẫu ngừng dùng bị từ chối', async () => {
  const { db, owner, worker, other, org, org2, sys, melon } = await setup();
  assert.match(await expectError(asUser(db, worker, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /FORBIDDEN/); // cơ sở khác
  const pigCrop = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Heo thịt','livestock') returning id`, [org])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, pigCrop])), /INVALID_CROP/);
  const foreign = (await asUser(db, other, `insert into crop_types (organization_id, name, kind) values ($1,'Dưa của B','crop') returning id`, [org2])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, foreign])), /INVALID_CROP/);
  const own = (await asUser(db, owner, `insert into crop_types (organization_id, name, kind) values ($1,'Dưa vàng','crop') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, own]); // sản phẩm riêng cùng loại: được
  await db.query(`update system_templates set is_active=false where id=$1`, [sys.id]);
  assert.match(await expectError(asUser(db, owner, `select apply_system_template($1,$2,$3)`, [org, sys.id, melon])), /NOT_FOUND/);
});

test('tạo vụ từ quy trình có việc chạy song song: ngày kế hoạch theo ngày bắt đầu, tổng ngày là ngày kết thúc muộn nhất, lưu lặp lại', async () => {
  const { db, owner, org, sys, melon } = await setup();
  const tpl = (await asUser(db, owner, `select apply_system_template($1,$2,$3) id`, [org, sys.id, melon])).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1,'Nhà màng') returning id`, [org])).rows[0].id;
  const cyc = '8aaaaaaa-0000-4000-8000-000000000001';
  await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-11-01')`, [cyc, org, area, tpl]);
  assert.equal((await db.query(`select expected_end_date::text d from production_cycles where id=$1`, [cyc])).rows[0].d, '2027-01-18'); // ngày 79 của quy trình
  const st = (await db.query(`select name, planned_start::text a, planned_end::text b, repeat_every_days r from production_stages where cycle_id=$1 order by seq`, [cyc])).rows;
  assert.equal(st.length, 17);
  assert.deepEqual([st[0].a, st[0].b], ['2026-11-01', '2026-11-05']);        // nối tiếp từ ngày 1
  assert.deepEqual([st[4].a, st[4].b, st[4].r], ['2026-11-10', '2026-11-21', 1]); // Tưới cây con: 12 ngày, lặp mỗi ngày
  assert.deepEqual([st[8].a, st[8].b, st[8].r], ['2026-12-02', '2026-12-11', 5]); // Bón phân ngày 32–41 lặp mỗi 5 ngày
  assert.deepEqual([st[9].a, st[9].r], ['2026-12-02', 1]);                      // Tưới chạy song song cùng ngày bắt đầu
  assert.deepEqual([st[16].a, st[16].b], ['2027-01-12', '2027-01-18']);         // Thu hoạch ngày 73–79
});
