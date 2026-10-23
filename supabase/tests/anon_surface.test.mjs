import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, asAnon, expectError } from './harness.mjs';

// Bề mặt công khai (khóa anon) — D71. Danh sách này là GIAO ƯỚC: thêm bảng/view/hàm mới cho khách thì phải cố ý sửa danh sách ở đây
// (và nhớ rằng mọi thứ trong danh sách ai cũng đọc/gọi được qua API công khai). Hàm mới mặc định phải `revoke … from public, anon`.
const TABLES = [
  'product_categories', 'public_cycles', 'public_directory', 'public_material_shops', 'public_price_board', 'public_products', 'public_products_lite', 'public_profile_badges',
  'public_profiles', 'public_profiles_lite', 'public_reviews', 'public_season_calendar', 'public_supplier_ratings', 'public_trade_posts', 'public_trade_results', 'public_trade_stats', 'site_articles', 'site_banners',
  'site_materials', 'site_menus', 'site_pages', 'site_settings', 'site_translations',
];
const FUNCS = [
  'can_configure', 'can_read_org_config', 'cycle_has_perm', 'fold_vi', 'has_perm', 'lite_images', 'login_email_for_phone', 'perm_level', 'perm_level_of', 'permissions_valid',
  'public_org_priority', 'role_default_perm', 'shop_is_active', 'shop_material_limit', 'site_search', 'submit_quote_request',
];

test('khách (anon) chỉ ĐỌC đúng các bảng/view công khai, không ghi được bảng nào', async () => {
  const db = await createDb();
  const g = (await db.query(`select table_name, privilege_type from information_schema.role_table_grants where grantee='anon' and table_schema='public'`)).rows;
  assert.deepEqual([...new Set(g.map((r) => r.table_name))].sort(), [...TABLES].sort());
  assert.deepEqual([...new Set(g.map((r) => r.privilege_type))], ['SELECT']);
});

test('khách (anon) chỉ gọi được các hàm trong danh sách; không gọi được hàm trigger', async () => {
  const db = await createDb();
  const f = (await db.query(`select p.proname, p.prorettype::regtype::text as ret from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname='public' and p.prokind='f' and has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows;
  assert.deepEqual(f.filter((r) => r.ret === 'trigger').map((r) => r.proname), []);
  assert.deepEqual(f.map((r) => r.proname).sort(), [...FUNCS].sort());
});

test('dữ liệu riêng không đọc được bằng khóa khách (đơn, giỏ, tài khoản, thông báo, báo giá, đánh giá gốc)', async () => {
  const db = await createDb();
  for (const t of ['web_orders', 'web_order_items', 'cart_items', 'buyer_profiles', 'buyer_addresses', 'notifications', 'quote_requests', 'supplier_reviews', 'trade_posts', 'messages', 'material_shops', 'org_licenses', 'platform_admins']) {
    assert.match(await expectError(asAnon(db, `select count(*) from ${t}`)), /permission|denied|does not exist/i, t);
  }
  assert.equal((await asAnon(db, `select count(*)::int n from public_reviews`)).rows[0].n, 0);
});
