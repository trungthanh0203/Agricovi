import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

/** Tạo DB mới, áp shim Supabase rồi toàn bộ migration theo thứ tự tên file. */
export async function createDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, 'shim.sql'), 'utf8'));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} lỗi: ${e.message}`);
    }
  }
  return db;
}

export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function addUser(db, n) {
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email) values ($1, $1, 'authenticated', 'authenticated', $2)`,
    [uid(n), `u${n}@test.local`],
  );
  return uid(n);
}

/** Chạy một truy vấn với tư cách người dùng đã đăng nhập (RLS có hiệu lực). */
export async function asUser(db, userId, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Chạy với tư cách khách chưa đăng nhập (vai trò anon). */
export async function asAnon(db, sql, params = []) {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}

/** Kỳ vọng truy vấn bị từ chối; trả về thông báo lỗi. */
export async function expectError(promise) {
  try {
    await promise;
  } catch (e) {
    return e.message;
  }
  throw new Error('Kỳ vọng lỗi nhưng truy vấn thành công');
}
