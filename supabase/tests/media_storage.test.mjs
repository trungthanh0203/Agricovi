import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0054 (G2-1, D75): kho ảnh riêng 'org-media'. Chính sách theo cơ sở và quyền; đường dẫn đúng định dạng; không ghi đè.

const U = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const path = (org, kind, n, thumb = false) => `${org}/${kind}/${U(n)}${thumb ? '_t' : ''}.jpg`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  return { db, org, owner, worker, stranger };
}
const put = (db, u, name) => asUser(db, u, `insert into storage.objects (bucket_id, name) values ('org-media', $1)`, [name]);
const list = async (db, u) => (await asUser(db, u, `select name from storage.objects where bucket_id = 'org-media' order by name`)).rows.map((r) => r.name);

test('kho org-media là riêng tư, giới hạn 1 MB, chỉ nhận JPEG', async () => {
  const db = await createDb();
  const b = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'org-media'`)).rows[0];
  assert.equal(b.public, false);
  assert.equal(Number(b.file_size_limit), 1048576);
  assert.deepEqual(b.allowed_mime_types, ['image/jpeg']);
});

test('chủ ghi được ảnh đầy đủ và ảnh nhỏ; thành viên đọc được; người ngoài không thấy', async () => {
  const { db, org, owner, worker, stranger } = await setup();
  await put(db, owner, path(org, 'areas', 1));
  await put(db, owner, path(org, 'areas', 1, true));
  assert.equal((await list(db, owner)).length, 2);
  assert.equal((await list(db, worker)).length, 2); // nhân viên cùng cơ sở xem được
  assert.equal((await list(db, stranger)).length, 0); // người ngoài không thấy
});

test('nhân viên thường không ghi và không xóa được ảnh', async () => {
  const { db, org, owner, worker } = await setup();
  await expectError(put(db, worker, path(org, 'areas', 2)), /row-level security/i);
  await put(db, owner, path(org, 'areas', 3));
  await asUser(db, worker, `delete from storage.objects where bucket_id = 'org-media'`);
  assert.equal((await list(db, owner)).length, 1); // vẫn còn
});

test('người ngoài không ghi vào thư mục của cơ sở khác', async () => {
  const { db, org, stranger } = await setup();
  await expectError(put(db, stranger, path(org, 'materials', 4)), /row-level security/i);
});

test('đường dẫn sai định dạng bị từ chối, kể cả với chủ', async () => {
  const { db, org, owner } = await setup();
  for (const bad of [`${org}/areas/abc.jpg`, `${org}/khac/${U(5)}.jpg`, `${org}/areas/${U(5)}.png`, `${U(9)}/../${org}/areas/${U(5)}.jpg`, `x/${U(5)}.jpg`]) {
    await expectError(put(db, owner, bad), /row-level security/i);
  }
});

test('quyền theo mục: có quyền sửa Kho thì ghi được; chủ xóa được; không có chính sách ghi đè', async () => {
  const { db, org, owner, worker } = await setup();
  await asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, worker, JSON.stringify({ inventory: 'edit' })]);
  await put(db, worker, path(org, 'materials', 6));
  assert.equal((await list(db, owner)).length, 1);
  const upd = await asUser(db, owner, `update storage.objects set name = $2 where bucket_id = 'org-media' and name = $1 returning name`, [path(org, 'materials', 6), path(org, 'materials', 7)]);
  assert.equal(upd.rows.length, 0); // không cập nhật được
  await asUser(db, owner, `delete from storage.objects where bucket_id = 'org-media'`);
  assert.equal((await list(db, owner)).length, 0);
});
