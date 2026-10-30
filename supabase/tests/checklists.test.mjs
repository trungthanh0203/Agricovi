import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistSummary } from '../../apps/app/src/lib/checklistLogic.ts';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0084 (D98, P1B): bảng kiểm nội bộ VietGAP. Mức A/B và ngưỡng là DỮ LIỆU sửa được; đánh giá chụp lại nội dung lúc bắt đầu.

const AUD = '11000000-0000-4000-8000-0000000000e1';
const AUD2 = '11000000-0000-4000-8000-0000000000e2';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const tpl = (await asUser(db, owner, `select ensure_checklist_template($1,'vietgap_pig') id`, [org])).rows[0].id;
  const answers = async (audit = AUD) => (await db.query(`select id, seq, level from checklist_answers where audit_id=$1 order by seq`, [audit])).rows;
  const answer = (u, id, r, ev = null) => asUser(db, u, `select save_checklist_answer($1,$2,$3)`, [id, r, ev]);
  const start = (u, id = AUD, o = org, t = tpl) => asUser(db, u, `select start_checklist_audit($1,$2,$3,current_date,'Ban kiểm soát')`, [id, o, t]);
  return { db, owner, wk, other, org, tpl, answers, answer, start };
}

test('bộ dùng chung nạp sẵn đúng 45 tiêu chí (31 A, 14 B), chưa đối chiếu; bản sao của cơ sở độc lập và gọi lặp không nhân đôi', async () => {
  const { db, owner, wk, other, org, tpl } = await setup();
  const sh = (await db.query(`select count(*)::int n, count(*) filter (where level='A')::int a, count(*) filter (where level='B')::int b from checklist_items i join checklist_templates t on t.id=i.template_id where t.code='vietgap_pig'`)).rows[0];
  assert.deepEqual(sh, { n: 45, a: 31, b: 14 });
  assert.equal((await db.query(`select verified_at from checklist_templates where code='vietgap_pig'`)).rows[0].verified_at, null);
  assert.equal((await asUser(db, owner, `select count(*)::int n from checklist_items where template_id=$1`, [tpl])).rows[0].n, 45);
  assert.equal((await asUser(db, owner, `select ensure_checklist_template($1,'vietgap_pig') id`, [org])).rows[0].id, tpl);
  assert.match(await expectError(asUser(db, wk, `select ensure_checklist_template($1,'vietgap_pig')`, [org])), /FORBIDDEN/);
  assert.equal((await asUser(db, other, `select count(*)::int n from checklist_items where organization_id=$1`, [org])).rows[0].n, 0); // cơ sở khác không thấy
});

test('mức A/B, nội dung và ngưỡng của bản sao sửa được; bộ dùng chung và cơ sở khác thì không', async () => {
  const { db, owner, other, tpl } = await setup();
  await asUser(db, owner, `update checklist_items set level='B' where template_id=$1 and seq=1`, [tpl]);
  assert.equal((await db.query(`select level from checklist_items where template_id=$1 and seq=1`, [tpl])).rows[0].level, 'B');
  await asUser(db, owner, `update checklist_templates set pass_b_pct=60, verified_at=now() where id=$1`, [tpl]);
  assert.equal((await db.query(`select pass_b_pct from checklist_templates where id=$1`, [tpl])).rows[0].pass_b_pct, 60);
  await asUser(db, owner, `insert into checklist_items (template_id, seq, item_text, level) values ($1, 46, 'Tiêu chí riêng của trại', 'B')`, [tpl]);
  assert.equal((await db.query(`select count(*)::int n from checklist_items where template_id=$1`, [tpl])).rows[0].n, 46);
  // bộ dùng chung: sửa không có tác dụng (RLS lọc hết hàng)
  await asUser(db, owner, `update checklist_items set level='B' where template_id=(select id from checklist_templates where code='vietgap_pig')`);
  assert.equal((await db.query(`select count(*)::int n from checklist_items i join checklist_templates t on t.id=i.template_id where t.code='vietgap_pig' and i.level='B'`)).rows[0].n, 14);
  // cơ sở khác không sửa được và không thêm tiêu chí vào bộ của cơ sở này
  await asUser(db, other, `update checklist_items set level='A' where template_id=$1`, [tpl]);
  assert.equal((await db.query(`select count(*)::int n from checklist_items where template_id=$1 and level='A'`, [tpl])).rows[0].n, 30);
  assert.match(await expectError(asUser(db, other, `insert into checklist_items (template_id, seq, item_text, level) values ($1, 99, 'xen vào', 'A')`, [tpl])), /row-level|violates/i);
});

test('đánh giá: chụp nội dung lúc bắt đầu; gửi lặp không nhân đôi; sửa bộ sau đó không đổi kết quả cũ', async () => {
  const { db, owner, wk, tpl, answers, start } = await setup();
  await start(owner);
  await start(owner); // lặp
  assert.equal((await db.query(`select count(*)::int n from checklist_audits`)).rows[0].n, 1);
  assert.equal((await answers()).length, 45);
  assert.match(await expectError(start(wk, AUD2)), /FORBIDDEN/);
  await asUser(db, owner, `update checklist_items set level='B' where template_id=$1 and seq=1`, [tpl]);
  assert.equal((await answers())[0].level, 'A'); // bản đã chụp không đổi
});

test('kết luận: phải trả lời hết; A đạt 100 %, B đạt >= ngưỡng; không áp dụng bị loại khỏi mẫu số; ngưỡng sửa được', async () => {
  const { db, owner, tpl, answers, answer, start } = await setup();
  await start(owner);
  const rows = await answers();
  const sum = async () => (await asUser(db, owner, `select get_checklist_summary($1) s`, [AUD])).rows[0].s;
  assert.equal((await sum()).verdict, 'incomplete');
  assert.match(await expectError(asUser(db, owner, `select finalize_checklist_audit($1)`, [AUD])), /INCOMPLETE/);
  // tất cả đạt, riêng 1 tiêu chí A "không áp dụng" => vẫn đạt (loại khỏi mẫu số)
  for (const r of rows) await answer(owner, r.id, r.seq === 1 ? 'na' : 'pass', r.seq === 2 ? 'Phiếu kiểm nghiệm 10/2026' : null);
  let s = await sum();
  assert.deepEqual([s.a_total, s.b_total, s.na, s.verdict], [30, 14, 1, 'pass']);
  // một tiêu chí A chưa đạt => không đạt
  const a2 = rows.find((r) => r.seq === 3);
  await answer(owner, a2.id, 'fail');
  assert.equal((await sum()).verdict, 'fail');
  await answer(owner, a2.id, 'pass');
  // B: 14 tiêu chí, 7 đạt = 50 % => đạt; 6 đạt = 42,9 % => không đạt
  const bs = rows.filter((r) => r.level === 'B');
  for (const r of bs.slice(0, 7)) await answer(owner, r.id, 'fail');
  assert.equal((await sum()).verdict, 'pass');
  await answer(owner, bs[7].id, 'fail');
  s = await sum();
  assert.deepEqual([s.b_pass, s.verdict], [6, 'fail']);
  // bản tính phía giao diện phải KHỚP bản tính của CSDL
  const local = checklistSummary((await db.query(`select level, result from checklist_answers where audit_id=$1`, [AUD])).rows, 100, 50);
  assert.deepEqual(local, s);
  // ngưỡng B của bộ hạ xuống 40 % thì bản đã chụp vẫn theo ngưỡng cũ (50 %)
  await asUser(db, owner, `update checklist_templates set pass_b_pct=40 where id=$1`, [tpl]);
  assert.equal((await sum()).verdict, 'fail');
});

test('chốt kết quả bất biến; chưa đạt vẫn chốt được; hủy cần lý do; người không có quyền không sửa', async () => {
  const { db, owner, wk, answers, answer, start } = await setup();
  await start(owner);
  const rows = await answers();
  for (const r of rows) await answer(owner, r.id, r.seq === 5 ? 'fail' : 'pass'); // 1 tiêu chí A chưa đạt
  assert.match(await expectError(answer(wk, rows[0].id, 'fail')), /FORBIDDEN/);
  const fin = (await asUser(db, owner, `select * from finalize_checklist_audit($1)`, [AUD])).rows[0];
  assert.equal(fin.status, 'final');
  assert.equal(fin.conclusion.verdict, 'fail'); // chưa đạt vẫn chốt được (để có hồ sơ khắc phục)
  assert.match(await expectError(answer(owner, rows[0].id, 'fail')), /FINAL/);
  assert.match(await expectError(asUser(db, owner, `select void_checklist_audit($1,'x')`, [AUD])), /INVALID_REASON/);
  await asUser(db, owner, `select void_checklist_audit($1,'Nhập nhầm ngày đánh giá')`, [AUD]);
  assert.equal((await db.query(`select void_reason from checklist_audits where id=$1`, [AUD])).rows[0].void_reason, 'Nhập nhầm ngày đánh giá');
  assert.match(await expectError(asUser(db, owner, `update checklist_answers set result='fail' where audit_id=$1`, [AUD])), /permission denied/i);
});

test('bộ bảng kiểm dưa lưới dùng chung: đủ 25 tiêu chí loại A chia 4 nhóm, chưa đối chiếu; bộ 18 tiêu chí cũ ngừng; cơ sở lấy về chép cả nhóm', async () => {
  const { db, owner, org } = await setup();
  const sh = (await db.query(`select count(*)::int n, count(*) filter (where level='A')::int a, count(distinct section)::int g from checklist_items i join checklist_templates t on t.id=i.template_id where t.code='vietgap_melon_25'`)).rows[0];
  assert.deepEqual(sh, { n: 25, a: 25, g: 4 });
  const t25 = (await db.query(`select verified_at, pass_a_pct, is_active from checklist_templates where code='vietgap_melon_25'`)).rows[0];
  assert.deepEqual([t25.verified_at, t25.pass_a_pct, t25.is_active], [null, 100, true]);
  // bộ 18 tiêu chí cũ không còn cho lấy mới
  assert.equal((await db.query(`select is_active from checklist_templates where code='vietgap_melon'`)).rows[0].is_active, false);
  assert.match(await expectError(asUser(db, owner, `select ensure_checklist_template($1,'vietgap_melon')`, [org])), /NOT_FOUND/);
  // lấy bộ mới về: chép đủ 25 tiêu chí kèm nhóm; bắt đầu đánh giá chép nhóm sang câu trả lời
  const mel = (await asUser(db, owner, `select ensure_checklist_template($1,'vietgap_melon_25') id`, [org])).rows[0].id;
  assert.equal((await asUser(db, owner, `select count(*)::int n from checklist_items where template_id=$1 and section is not null`, [mel])).rows[0].n, 25);
  assert.equal((await db.query(`select count(*)::int n from checklist_templates where organization_id=$1`, [org])).rows[0].n, 2); // heo (ở setup) + dưa
  const aud = '70000000-0000-4000-8000-0000000000c1';
  await asUser(db, owner, `select start_checklist_audit($1,$2,$3,'2026-10-01','Chủ vườn')`, [aud, org, mel]);
  assert.equal((await db.query(`select count(*)::int n from checklist_answers where audit_id=$1 and section like 'IV.%'`, [aud])).rows[0].n, 8);
  // 100% đạt mới đạt: một tiêu chí không đạt thì kết luận không đạt
  const ans = (await db.query(`select id from checklist_answers where audit_id=$1 order by seq`, [aud])).rows;
  for (let i = 0; i < ans.length; i++) await asUser(db, owner, `select save_checklist_answer($1,$2,null)`, [ans[i].id, i === 0 ? 'fail' : 'pass']);
  assert.equal((await asUser(db, owner, `select get_checklist_summary($1) s`, [aud])).rows[0].s.verdict, 'fail');
  await asUser(db, owner, `select save_checklist_answer($1,'pass','Đã sửa mái màng')`, [ans[0].id]);
  assert.equal((await asUser(db, owner, `select get_checklist_summary($1) s`, [aud])).rows[0].s.verdict, 'pass');
});
