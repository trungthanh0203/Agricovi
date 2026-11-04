import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, asAnon } from './harness.mjs';

// Phân trang danh bạ và sản phẩm: lọc theo tỉnh, còn hàng, từ khóa không dấu, danh mục; trang và tổng số; khách gọi được.
test('danh bạ và sản phẩm phân trang ở CSDL', async () => {
  const db = await createDb();
  await db.query(`set session_replication_role = replica`);
  const cat = '11111111-1111-1111-1111-111111111111';
  for (let i = 1; i <= 5; i++) {
    const pid = `00000000-0000-0000-0000-00000000000${i}`;
    const prov = i <= 3 ? 'Lâm Đồng' : 'Tiền Giang';
    await db.query(`insert into public_profiles (profile_id, organization_id, slug, snapshot) values ($1, gen_random_uuid(), $2, $3::jsonb)`,
      [pid, 'co-so-' + i, JSON.stringify({ display_name: 'Cơ sở ' + i, province: prov, description: i === 2 ? 'Trồng dâu tây sạch' : '' })]);
    await db.query(`insert into public_products (listing_id, profile_id, snapshot, supply_status, supply_updated_on) values (gen_random_uuid(), $1, $2::jsonb, $3, current_date)`,
      [pid, JSON.stringify({ name: i === 2 ? 'Dâu tây' : 'Xoài ' + i, category_id: i <= 4 ? cat : null, images: [] }), i % 2 ? 'available' : 'out_of_stock']);
  }
  const dir = (args) => asAnon(db, `select public_directory_page($1,$2,$3,$4,$5) r`, args).then((x) => x.rows[0].r);
  let r = await dir([null, null, false, 0, 2]);
  assert.equal(r.total, 5); assert.equal(r.rows.length, 2);
  assert.deepEqual(r.provinces, ['Lâm Đồng', 'Tiền Giang']);
  r = await dir([null, null, false, 4, 2]);
  assert.equal(r.rows.length, 1);                      // trang cuối
  r = await dir([null, 'Tiền Giang', false, 0, 24]);
  assert.equal(r.total, 2);
  r = await dir(['dau tay', null, false, 0, 24]);       // không dấu, khớp cả tên sản phẩm lẫn mô tả
  assert.equal(r.total, 1); assert.equal(r.rows[0].slug, 'co-so-2');
  r = await dir([null, null, true, 0, 24]);             // chỉ nơi đang có hàng: cơ sở 1, 3, 5
  assert.equal(r.total, 3);

  const prod = (args) => asAnon(db, `select public_products_page($1::uuid[],$2,$3,$4,$5,$6,$7) r`, args).then((x) => x.rows[0].r);
  let p = await prod([[cat], null, null, false, 0, 3, null]);
  assert.equal(p.total, 4); assert.equal(p.items.length, 3);
  assert.equal(p.items[0].supply_status, 'available');  // còn hàng lên trước
  p = await prod([[cat], 'Tiền Giang', null, false, 0, 24, null]);
  assert.equal(p.total, 1);
  p = await prod([null, null, 'dau', false, 0, 24, null]);
  assert.equal(p.total, 1); assert.equal(p.items[0].snapshot.name, 'Dâu tây');
  const id = p.items[0].listing_id;
  p = await prod([null, null, null, false, 0, 1, id]);
  assert.equal(p.total, 1); assert.equal(p.items[0].display_name, 'Cơ sở 2');
  p = await prod([null, null, null, false, 0, 1000, null]);
  assert.equal(p.items.length, 5);                       // giới hạn tối đa 60 nhưng chỉ có 5 sản phẩm
  await db.query(`update public_profiles set is_visible = false where slug = 'co-so-1'`);
  assert.equal((await prod([null, null, null, false, 0, 24, null])).total, 4); // hồ sơ ẩn thì sản phẩm ẩn theo
});

test('chỉ mục tìm kiếm: cột search_text tự tính, ô tìm trên đầu trang khớp không dấu, chỉ mục trigram tồn tại', async () => {
  const db = await createDb();
  await db.query(`set session_replication_role = replica`);
  await db.query(`insert into public_profiles (profile_id, organization_id, slug, snapshot) values ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'vuon-dau', $1::jsonb)`,
    [JSON.stringify({ display_name: 'Vườn Dâu Đà Lạt', province: 'Lâm Đồng', description: 'Dâu tây sạch' })]);
  await db.query(`insert into public_products (listing_id, profile_id, snapshot) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', $1::jsonb)`, [JSON.stringify({ name: 'Dâu tây Hàn Quốc', crop: 'Dâu' })]);
  const st = (await db.query(`select search_text from public_profiles`)).rows[0].search_text;
  assert.match(st, /vuon dau da lat lam dong/);
  const r = (await asAnon(db, `select site_search($1) r`, ['han quoc'])).rows[0].r;
  assert.equal(r.products.length, 1); assert.equal(r.profiles.length, 0);
  assert.equal((await asAnon(db, `select site_search($1) r`, ['da lat'])).rows[0].r.profiles.length, 1);
  const idx = (await db.query(`select count(*)::int n from pg_indexes where indexname in ('public_profiles_search_trgm','public_products_search_trgm','site_materials_search_trgm','site_articles_search_trgm')`)).rows[0].n;
  assert.equal(idx, 4);
});
