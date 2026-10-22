import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon } from './harness.mjs';

// Migration 0051 (W8, D71): bản "nhẹ" không chứa nội dung ảnh, cờ có ảnh, một lệnh gọi cho số đếm trên khung trang.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function setup() {
  const db = await createDb();
  await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`);
  const admin = await addUser(db, 1), owner = await addUser(db, 3), buyer = await addUser(db, 6);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  const prof = (await asUser(db, owner, `insert into business_profiles (organization_id, display_name, description, province, location_precision)
    values ($1,'Vườn Thành Công','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP','Long An','district') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,array['profile','images']::text[],'v1')`, [org, prof]);
  const listing = (await asUser(db, owner, `insert into product_listings (business_profile_id,organization_id,name,unit,price_from) values ($1,$2,'Dưa lưới Taki','kg',40000) returning id`, [prof, org])).rows[0].id;
  await db.query(`insert into product_images (organization_id, business_profile_id, listing_id, storage_path, image, caption, is_public_allowed, sort_order) values
    ($1,$2,$3,null,$4,'Ảnh 1',true,1), ($1,$2,$3,'cu/duong-dan.jpg',null,'Ảnh cũ',true,2)`, [org, prof, listing, PNG]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  await asUser(db, buyer, `select ensure_buyer_profile('Người Mua','individual',null)`);
  return { db, owner, buyer, org, prof, listing };
}

test('bản nhẹ của sản phẩm/hồ sơ không chứa nội dung ảnh; giữ thứ tự và cờ ok; bản đầy đủ vẫn còn nguyên', async () => {
  const { db, listing } = await setup();
  const full = (await asAnon(db, `select snapshot s from public_products where listing_id=$1`, [listing])).rows[0].s;
  assert.ok(JSON.stringify(full).includes('data:image/png'));
  const lite = (await asAnon(db, `select snapshot s from public_products_lite where listing_id=$1`, [listing])).rows[0].s;
  assert.equal(JSON.stringify(lite).includes('base64'), false);
  assert.deepEqual(lite.images, [{ caption: 'Ảnh 1', ok: true }, { caption: 'Ảnh cũ', ok: false }]);   // ảnh đường dẫn cũ không phục vụ được → ok=false
  assert.equal(lite.name, 'Dưa lưới Taki');
  const p = (await asAnon(db, `select snapshot s from public_profiles_lite`)).rows[0].s;
  assert.equal(JSON.stringify(p).includes('base64'), false);
  assert.equal(p.display_name, 'Vườn Thành Công');
  await db.query(`update public_products set is_visible=false`);
  assert.equal((await asAnon(db, `select count(*)::int n from public_products_lite`)).rows[0].n, 0);   // ẩn thì bản nhẹ cũng ẩn
});

test('cờ has_image của banner, vật tư, bài viết tự tính từ cột ảnh', async () => {
  const { db } = await setup();
  await db.query(`insert into site_banners (slot, title, image, status) values ('hero','A',$1,'published'), ('hero','B',null,'published')`, [PNG]);
  const r = (await asAnon(db, `select title, has_image from site_banners order by title`)).rows;
  assert.deepEqual(r.map((x) => [x.title, x.has_image]), [['A', true], ['B', false]]);
  await db.query(`update site_banners set image = null where title='A'`);
  assert.equal((await asAnon(db, `select has_image from site_banners where title='A'`)).rows[0].has_image, false);
});

test('web_shell_counts: chưa đọc + giỏ trong một lệnh; khách bị từ chối', async () => {
  const { db, buyer, listing } = await setup();
  assert.deepEqual((await asUser(db, buyer, `select web_shell_counts() c`)).rows[0].c, { unread: 0, cart: 0 });
  await asUser(db, buyer, `select cart_set_item($1,2)`, [listing]);
  await db.query(`insert into notifications (user_id, kind, title, body, link) values ($1,'order','Tiêu đề','Nội dung','/x')`, [buyer]);
  assert.deepEqual((await asUser(db, buyer, `select web_shell_counts() c`)).rows[0].c, { unread: 1, cart: 1 });
  await assert.rejects(asAnon(db, `select web_shell_counts()`), /permission|denied/i);
});
