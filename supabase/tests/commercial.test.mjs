import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

const ORG = '10000000-0000-4000-8000-00000000000a';
const ORG2 = '10000000-0000-4000-8000-00000000000b';
const PROFILE = '90000000-0000-4000-8000-000000000001';
const LISTING = '91000000-0000-4000-8000-000000000001';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const editor = await addUser(db, 2);   // nhân viên hỗ trợ hồ sơ (profile_editor)
  const reviewer = await addUser(db, 3); // kiểm duyệt viên nền tảng
  const other = await addUser(db, 4);
  await db.query(`insert into organizations (id,type,name,created_by) values ($1,'household','Vườn Dưa Xanh',$2),($3,'household','Hộ khác',$4)`, [ORG, owner, ORG2, other]);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['profile_editor']::member_role[])`, [ORG, editor]);
  await db.query(`insert into platform_reviewers (user_id) values ($1)`, [reviewer]);
  await asUser(db, owner, `insert into business_profiles (id,organization_id,display_name,description,province,contact_phone,contact_confirmed_at,location_precision)
     values ($1,$2,'Vườn Dưa Xanh','Dưa lưới trồng nhà màng','Tiền Giang','0900000000',now(),'province')`, [PROFILE, ORG]);
  await asUser(db, owner, `insert into product_listings (id,business_profile_id,organization_id,name,specification) values ($1,$2,$3,'Dưa lưới loại 1','1.5-2kg/trái')`, [LISTING, PROFILE, ORG]);
  await asUser(db, owner, `insert into product_images (organization_id,business_profile_id,listing_id,storage_path,is_public_allowed) values
     ($1,$2,$3,'ok.jpg',true),($1,$2,$3,'private.jpg',false)`, [ORG, PROFILE, LISTING]);
  return { db, owner, editor, reviewer, other };
}

const consent = (db, owner, scope = ['profile', 'contact', 'images']) =>
  asUser(db, owner, `insert into publication_consents (organization_id,business_profile_id,scope,text_version,granted_by) values ($1,$2,$3,'v1',$4)`, [ORG, PROFILE, scope, owner]);

test('chưa duyệt thì website (anon) không thấy gì; không đọc được bảng nội bộ', async () => {
  const { db } = await setup();
  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 0);
  assert.match(await expectError(asAnon(db, `select * from business_profiles`)), /permission denied/);
  assert.match(await expectError(asAnon(db, `select * from production_cycles`)), /permission denied/);
  assert.match(await expectError(asAnon(db, `select * from subscriptions`)), /permission denied/);
  assert.match(await expectError(asAnon(db, `select * from attendance_records`)), /permission denied/);
});

test('luồng xuất bản: cần đồng ý -> gửi duyệt (chỉ chủ) -> kiểm duyệt viên xuất bản', async () => {
  const { db, owner, editor, reviewer } = await setup();
  // thiếu đồng ý
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE])), /NO_CONSENT/);
  // nhân viên hỗ trợ không được xác nhận thay
  assert.match(await expectError(asUser(db, editor, `insert into publication_consents (organization_id,business_profile_id,scope,text_version,granted_by)
     values ($1,$2,array['profile'],'v1',$3)`, [ORG, PROFILE, editor])), /row-level security/);
  await consent(db, owner);
  // nhân viên hỗ trợ không gửi duyệt thay
  assert.match(await expectError(asUser(db, editor, `select submit_profile_for_review($1)`, [PROFILE])), /FORBIDDEN/);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE]);
  // chủ không tự duyệt
  assert.match(await expectError(asUser(db, owner, `select approve_and_publish($1)`, [PROFILE])), /FORBIDDEN/);
  // không tự đổi trạng thái bằng UPDATE
  assert.match(await expectError(asUser(db, owner, `update business_profiles set status='published' where id=$1`, [PROFILE])), /FORBIDDEN/);

  await asUser(db, reviewer, `select approve_and_publish($1, 'ok')`, [PROFILE]);
  const pub = (await asAnon(db, `select slug, snapshot from public_profiles`)).rows;
  assert.equal(pub.length, 1);
  assert.equal(pub[0].slug, 'vuon-dua-xanh');
});

test('bản chụp công khai chỉ gồm phần được đồng ý; ảnh chưa cho phép và chứng nhận ngoài phạm vi không lộ', async () => {
  const { db, owner, reviewer } = await setup();
  await asUser(db, owner, `insert into certification_records (organization_id,business_profile_id,name) values ($1,$2,'VietGAP')`, [ORG, PROFILE]);
  await consent(db, owner, ['profile', 'images']); // KHÔNG có contact, KHÔNG có certifications
  await asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE]);
  await asUser(db, reviewer, `select approve_and_publish($1)`, [PROFILE]);
  const snap = (await asAnon(db, `select snapshot from public_profiles`)).rows[0].snapshot;
  assert.equal(snap.contact, undefined);
  assert.equal(snap.certifications, undefined);
  const prod = (await asAnon(db, `select snapshot from public_products`)).rows[0].snapshot;
  assert.deepEqual(prod.images.map((i) => i.path), ['ok.jpg']);
  assert.equal(JSON.stringify(snap).includes('0900000000'), false);
});

test('chứng nhận: cơ sở không tự đặt "đã xác minh"; chỉ kiểm duyệt viên', async () => {
  const { db, owner, reviewer } = await setup();
  assert.match(await expectError(asUser(db, owner, `insert into certification_records (organization_id,business_profile_id,name,status,verification_basis,checked_by,checked_at)
     values ($1,$2,'VietGAP','verified','tự nói',$3,now())`, [ORG, PROFILE, owner])), /CERT_FORBIDDEN/);
  await asUser(db, reviewer, `insert into certification_records (organization_id,business_profile_id,name,status,verification_basis,checked_by,checked_at)
     values ($1,$2,'VietGAP','verified','Đối chiếu bản gốc',$3,now())`, [ORG, PROFILE, reviewer]);
  // verified thiếu căn cứ bị chặn bởi ràng buộc
  assert.match(await expectError(db.query(`insert into certification_records (organization_id,business_profile_id,name,status) values ($1,$2,'X','verified')`, [ORG, PROFILE])), /check/);
});

test('cung ứng: "đang có hàng" cần cơ sở xác nhận; cập nhật lan sang bản chụp công khai', async () => {
  const { db, owner, reviewer } = await setup();
  await consent(db, owner);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE]);
  await asUser(db, reviewer, `select approve_and_publish($1)`, [PROFILE]);
  assert.match(await expectError(asUser(db, owner, `insert into supply_offers (listing_id,organization_id,status) values ($1,$2,'available')`, [LISTING, ORG])), /check/);
  await asUser(db, owner, `insert into supply_offers (listing_id,organization_id,status,confirmed_by_org) values ($1,$2,'available',true)`, [LISTING, ORG]);
  const p = (await asAnon(db, `select supply_status, supply_updated_on from public_products`)).rows[0];
  assert.equal(p.supply_status, 'available');
  assert.ok(p.supply_updated_on);
});

test('ẩn/rút công khai có hiệu lực ngay; rút đồng ý chặn xuất bản lại', async () => {
  const { db, owner, reviewer, other } = await setup();
  await consent(db, owner);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE]);
  await asUser(db, reviewer, `select approve_and_publish($1)`, [PROFILE]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 1);
  // người ngoài không ẩn được
  assert.match(await expectError(asUser(db, other, `select hide_profile($1, true)`, [PROFILE])), /FORBIDDEN/);
  await asUser(db, owner, `select hide_profile($1, true)`, [PROFILE]);
  assert.equal((await asAnon(db, `select count(*)::int n from public_profiles`)).rows[0].n, 0);
  assert.equal((await asAnon(db, `select count(*)::int n from public_products`)).rows[0].n, 0);
  // gửi duyệt lại khi đã rút đồng ý
  assert.match(await expectError(asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE])), /NO_CONSENT/);
});

test('xếp hạng: hồ sơ không có gói vẫn hiện nhưng không được ưu tiên; gói hết hạn mất ưu tiên', async () => {
  const { db, owner, reviewer } = await setup();
  await consent(db, owner);
  await asUser(db, owner, `select submit_profile_for_review($1)`, [PROFILE]);
  await asUser(db, reviewer, `select approve_and_publish($1)`, [PROFILE]);
  await asUser(db, owner, `insert into supply_offers (listing_id,organization_id,status,confirmed_by_org) values ($1,$2,'available',true)`, [LISTING, ORG]);

  let row = (await asAnon(db, `select is_priority, rank_score from public_directory`)).rows[0];
  assert.equal(row.is_priority, true); // gói dùng thử còn hạn + cung ứng còn mới
  const scorePriority = Number(row.rank_score);

  await db.query(`update subscriptions set period_start = now() - interval '60 days', period_end = now() - interval '1 day' where organization_id=$1`, [ORG]);
  row = (await asAnon(db, `select is_priority, rank_score from public_directory`)).rows[0];
  assert.equal(row.is_priority, false);
  assert.ok(Number(row.rank_score) < scorePriority);
  assert.equal((await asAnon(db, `select count(*)::int n from public_directory`)).rows[0].n, 1); // vẫn hiển thị
});

test('liên hệ người mua: anon không ghi trực tiếp; chỉ cơ sở của hồ sơ đọc được', async () => {
  const { db, owner, other } = await setup();
  assert.match(await expectError(asAnon(db, `insert into contact_inquiries (business_profile_id,organization_id,sender_name,sender_phone,message) values ($1,$2,'A','0900','hi')`, [PROFILE, ORG])), /permission denied/);
  await db.query(`insert into contact_inquiries (business_profile_id,organization_id,sender_name,sender_phone,message) values ($1,$2,'A','0900','hi')`, [PROFILE, ORG]); // như Edge Function (service role)
  assert.equal((await asUser(db, owner, `select count(*)::int n from contact_inquiries`)).rows[0].n, 1);
  assert.equal((await asUser(db, other, `select count(*)::int n from contact_inquiries`)).rows[0].n, 0);
});
