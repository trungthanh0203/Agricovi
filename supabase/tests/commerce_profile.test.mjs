import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0040 (D55): soạn và xuất bản hồ sơ thương mại.
const IMG = 'data:image/jpeg;base64,/9j/4AAQ';

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2), editor = await addUser(db, 3), wk = await addUser(db, 4);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn Thành Công') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['profile_editor']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, editor, wk]);
  const prof = (await asUser(db, editor, `insert into business_profiles (organization_id, display_name, tagline, description, province, district, location_precision, contact_phone, practices, total_area, established_year)
    values ($1,'Vườn nhà màng Thành Công','Dưa lưới sạch','Chuyên trồng dưa lưới trong nhà màng, theo quy trình VietGAP, giao hàng toàn quốc.','Long An','Đức Hòa','district','0912345678','Nhà màng, tưới nhỏ giọt',2.5,2015) returning id`, [org])).rows[0].id;
  return { db, admin, owner, editor, wk, org, prof };
}
const consent = (db, u, org, prof, scope) => asUser(db, u, `insert into publication_consents (organization_id,business_profile_id,scope,text_version) values ($1,$2,$3::text[],'v1')`, [org, prof, scope]);

test('soạn hồ sơ: biên tập hồ sơ sửa được, nhân viên thường không thấy; trạng thái không tự đổi; liên hệ đổi thì phải xác nhận lại, chỉ chủ xác nhận', async () => {
  const { db, owner, editor, wk, prof } = await setup();
  assert.equal((await asUser(db, wk, `select count(*)::int n from business_profiles`)).rows[0].n, 0);
  await asUser(db, editor, `update business_profiles set tagline='Dưa lưới hữu cơ' where id=$1`, [prof]);
  assert.match(await expectError(asUser(db, editor, `update business_profiles set status='published' where id=$1`, [prof])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, editor, `update business_profiles set contact_confirmed_at=now() where id=$1`, [prof])), /Chỉ chủ/);
  await asUser(db, owner, `update business_profiles set contact_confirmed_at=now() where id=$1`, [prof]);
  assert.ok((await db.query(`select contact_confirmed_at from business_profiles where id=$1`, [prof])).rows[0].contact_confirmed_at);
  await asUser(db, editor, `update business_profiles set contact_phone='0999999999' where id=$1`, [prof]);
  assert.equal((await db.query(`select contact_confirmed_at from business_profiles where id=$1`, [prof])).rows[0].contact_confirmed_at, null); // đổi liên hệ: xác nhận lại
});

test('gửi duyệt cần đủ thông tin và đồng ý của chủ; duyệt và xuất bản; website (anon) chỉ thấy phần được phép trong phạm vi đồng ý', async () => {
  const { db, admin, owner, editor, org, prof } = await setup();
  const lic = (await db.query(`insert into org_licenses (organization_id,name,issuer,number,expires_date) values ($1,'VietGAP','Sở NN','VG-01','2030-01-01') returning id`, [org])).rows[0].id;
  await asUser(db, editor, `insert into certification_records (organization_id,business_profile_id,name,issuer,license_id) values ($1,$2,'VietGAP','Sở NN',$3)`, [org, prof, lic]);
  await asUser(db, editor, `insert into product_images (organization_id,business_profile_id,image,caption,is_public_allowed) values ($1,$2,$3,'Nhà màng',true), ($1,$2,$3,'Chưa cho phép',false)`, [org, prof, IMG]);
  const listing = (await asUser(db, editor, `insert into product_listings (business_profile_id,organization_id,name,description,specification,unit,season,price_note,min_order)
    values ($1,$2,'Dưa lưới Taki','Ngọt giòn','Quả 1,5–2 kg','kg','Tháng 10–12','Liên hệ','50 kg') returning id`, [prof, org])).rows[0].id;
  await asUser(db, editor, `insert into supply_offers (listing_id,organization_id,status,expected_from,expected_to) values ($1,$2,'expected','2026-12-01','2026-12-30')`, [listing, org]);

  assert.match(await expectError(asUser(db, editor, `select submit_profile_for_review($1)`, [prof])), /FORBIDDEN/); // chỉ chủ gửi duyệt
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [prof])), /NO_CONSENT/);
  assert.match(await expectError(consent(db, editor, org, prof, ['profile'])), /row-level security/); // chỉ chủ đồng ý
  await consent(db, owner, org, prof, ['profile', 'images', 'certifications']); // KHÔNG đồng ý 'contact'
  await asUser(db, owner, `update business_profiles set contact_confirmed_at=now() where id=$1`, [prof]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  assert.equal((await db.query(`select status from business_profiles where id=$1`, [prof])).rows[0].status, 'pending_review');

  // người duyệt xem gói xem xét: đúng phạm vi
  const pack = (await asUser(db, admin, `select review_pack($1) p`, [prof])).rows[0].p;
  assert.deepEqual(pack.scope.sort(), ['certifications', 'images', 'profile']);
  assert.equal(pack.preview.profile.contact, undefined);
  assert.equal(pack.preview.products.length, 1);

  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 0); // chưa duyệt: website chưa thấy
  await asUser(db, admin, `select approve_and_publish($1,'ok')`, [prof]);
  const pub = (await asAnon(db, `select slug, snapshot from public_profiles`)).rows[0];
  assert.equal(pub.slug, 'vuon-nha-mang-thanh-cong');
  const s = pub.snapshot;
  assert.deepEqual([s.display_name, s.tagline, s.province, s.district, s.established_year, Number(s.total_area)], ['Vườn nhà màng Thành Công', 'Dưa lưới sạch', 'Long An', 'Đức Hòa', 2015, 2.5]);
  assert.equal(s.commune, null);                    // mức công khai: huyện
  assert.equal(s.contact, undefined);               // không đồng ý nhóm liên hệ
  assert.equal(s.images.length, 1);                 // ảnh chưa cho phép không ra
  assert.equal(s.images[0].src, IMG);
  assert.deepEqual([s.certifications[0].name, s.certifications[0].number, s.certifications[0].status], ['VietGAP', 'VG-01', 'self_declared']);
  const prod = (await asAnon(db, `select snapshot, supply_status from public_products`)).rows[0];
  assert.deepEqual([prod.snapshot.name, prod.snapshot.unit, prod.snapshot.season, prod.snapshot.min_order, prod.supply_status], ['Dưa lưới Taki', 'kg', 'Tháng 10–12', '50 kg', 'expected']);

  // cập nhật tình trạng cung ứng hiện ngay không cần duyệt lại; 'đang có hàng' cần cơ sở xác nhận
  assert.match(await expectError(asUser(db, editor, `insert into supply_offers (listing_id,organization_id,status) values ($1,$2,'available')`, [listing, org])), /check/i);
  await asUser(db, editor, `insert into supply_offers (listing_id,organization_id,status,confirmed_by_org) values ($1,$2,'available',true)`, [listing, org]);
  assert.equal((await asAnon(db, `select supply_status from public_products`)).rows[0].supply_status, 'available');

  // đang xuất bản vẫn gửi duyệt lại được sau khi sửa
  await asUser(db, editor, `update business_profiles set tagline='Dưa lưới VietGAP' where id=$1`, [prof]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  assert.equal((await asAnon(db, `select snapshot->>'tagline' t from public_profiles`)).rows[0].t, 'Dưa lưới sạch'); // bản cũ vẫn hiện tới khi duyệt
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [prof])), /INVALID_STATE/);
  await asUser(db, admin, `select approve_and_publish($1,null)`, [prof]);
  assert.equal((await asAnon(db, `select snapshot->>'tagline' t from public_profiles`)).rows[0].t, 'Dưa lưới VietGAP');
});

test('thiếu thông tin thì không gửi duyệt; tạm ẩn có hiệu lực ngay; rút đồng ý', async () => {
  const { db, admin, owner, editor, org, prof } = await setup();
  await asUser(db, editor, `update business_profiles set description='Ngắn' where id=$1`, [prof]);
  await consent(db, owner, org, prof, ['profile']);
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [prof])), /MISSING_INFO/);
  assert.equal((await db.query(`select status from business_profiles where id=$1`, [prof])).rows[0].status, 'draft'); // báo lỗi, không đổi trạng thái
  await asUser(db, editor, `update business_profiles set description='Mô tả đủ dài để gửi duyệt hồ sơ thương mại.' where id=$1`, [prof]);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [prof]);
  await asUser(db, admin, `select approve_and_publish($1,null)`, [prof]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 1);
  await asUser(db, owner, `select hide_profile($1, true)`, [prof]); // chủ rút công khai và rút đồng ý
  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from publication_consents where revoked_at is null`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [prof])), /NO_CONSENT/); // phải đồng ý lại
});

test('xem trước: người soạn xem được, nhân viên thường không', async () => {
  const { db, editor, wk, prof } = await setup();
  const p = (await asUser(db, editor, `select preview_profile($1, array['profile']) p`, [prof])).rows[0].p;
  assert.equal(p.profile.display_name, 'Vườn nhà màng Thành Công');
  assert.match(await expectError(asUser(db, wk, `select preview_profile($1, array['profile'])`, [prof])), /FORBIDDEN/);
});
