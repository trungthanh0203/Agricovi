-- Bảng kiểm VietGAP dưa lưới nhà màng ĐỦ 25 TIÊU CHÍ (D129), thay bộ 18 tiêu chí cũ của migration 0087.
-- Nguồn: file bảng kiểm của chủ sản phẩm (docs/Bang_kiem_25_VietGAP_Dua_luoi.xlsx, theo TCVN 11892-1:2017): 25 tiêu chí cốt lõi chia 4 nhóm; nhà vườn đạt khi 100% tiêu chí đạt.
-- - Thêm cột "nhóm" (section) cho tiêu chí và câu trả lời để hiển thị theo nhóm I-IV; sao bộ và bắt đầu đánh giá chép cột này.
-- - 25 tiêu chí đều là loại A (bắt buộc), ngưỡng đạt 100%; cột "Biện pháp khắc phục" của file dùng ô ghi chú của từng câu trả lời (evidence).
-- - Bộ cũ 'vietgap_melon' (18 tiêu chí) được ngừng cho cơ sở lấy mới; cơ sở đã lấy bản sao cũ thì giữ nguyên, có thể lấy thêm bộ 25 tiêu chí.
-- - Thông báo lỗi dùng chữ "Không đạt" cho khớp file.

alter table checklist_items add column section text check (section is null or length(section) <= 160);
alter table checklist_answers add column section text check (section is null or length(section) <= 160);

create or replace function ensure_checklist_template(p_org uuid, p_source_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_src checklist_templates; v_id uuid;
begin
  if not has_perm(p_org, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền khai báo bảng kiểm.'; end if;
  select id into v_id from checklist_templates where organization_id = p_org and source_code = p_source_code;
  if v_id is not null then return v_id; end if;
  select * into v_src from checklist_templates where organization_id is null and code = p_source_code and is_active;
  if v_src.id is null then raise exception 'NOT_FOUND: Không tìm thấy bộ bảng kiểm này.'; end if;
  insert into checklist_templates (organization_id, source_code, name, source_note, pass_a_pct, pass_b_pct)
    values (p_org, p_source_code, v_src.name, v_src.source_note, v_src.pass_a_pct, v_src.pass_b_pct) returning id into v_id;
  insert into checklist_items (template_id, seq, item_text, level, method, section)
    select v_id, seq, item_text, level, method, section from checklist_items where template_id = v_src.id;
  return v_id;
end $$;

create or replace function start_checklist_audit(p_id uuid, p_org uuid, p_template uuid, p_date date, p_auditor text) returns checklist_audits
language plpgsql security definer set search_path = public as $$
declare r checklist_audits; t checklist_templates;
begin
  select * into r from checklist_audits where id = p_id;
  if r.id is not null then
    if r.organization_id = p_org and has_perm(p_org, 'declare', 'view') then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền với lần đánh giá này.';
  end if;
  if not has_perm(p_org, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập bảng kiểm.'; end if;
  select * into t from checklist_templates where id = p_template and organization_id = p_org;
  if t.id is null then raise exception 'NOT_FOUND: Không tìm thấy bộ bảng kiểm của cơ sở.'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'INVALID_DATE: Ngày đánh giá không được ở tương lai.'; end if;
  if not exists (select 1 from checklist_items where template_id = t.id) then raise exception 'EMPTY_TEMPLATE: Bộ bảng kiểm chưa có tiêu chí nào.'; end if;
  insert into checklist_audits (id, organization_id, template_id, template_name, audit_date, auditor, pass_a_pct, pass_b_pct)
    values (p_id, p_org, t.id, t.name, p_date, nullif(trim(coalesce(p_auditor, '')), ''), t.pass_a_pct, t.pass_b_pct) returning * into r;
  insert into checklist_answers (audit_id, organization_id, seq, item_text, level, method, section)
    select p_id, p_org, i.seq, i.item_text, i.level, i.method, i.section from checklist_items i where i.template_id = t.id order by i.seq;
  return r;
end $$;

create or replace function save_checklist_answer(p_answer uuid, p_result text, p_evidence text) returns checklist_answers
language plpgsql security definer set search_path = public as $$
declare a checklist_answers; au checklist_audits;
begin
  select * into a from checklist_answers where id = p_answer;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy tiêu chí.'; end if;
  if not has_perm(a.organization_id, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa bảng kiểm.'; end if;
  select * into au from checklist_audits where id = a.audit_id;
  if au.status <> 'draft' or au.voided_at is not null then raise exception 'FINAL: Lần đánh giá đã chốt hoặc đã hủy nên không sửa được.'; end if;
  if p_result is not null and p_result not in ('pass', 'fail', 'na') then raise exception 'INVALID_RESULT: Kết quả phải là Đạt, Không đạt hoặc Không áp dụng.'; end if;
  update checklist_answers set result = p_result, evidence = nullif(trim(coalesce(p_evidence, '')), '') where id = p_answer returning * into a;
  return a;
end $$;

create or replace function finalize_checklist_audit(p_audit uuid) returns checklist_audits
language plpgsql security definer set search_path = public as $$
declare au checklist_audits; sm jsonb;
begin
  select * into au from checklist_audits where id = p_audit;
  if au.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần đánh giá.'; end if;
  if not has_perm(au.organization_id, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền chốt bảng kiểm.'; end if;
  if au.status <> 'draft' or au.voided_at is not null then raise exception 'FINAL: Lần đánh giá đã chốt hoặc đã hủy.'; end if;
  sm := checklist_summary_of(p_audit);
  if (sm->>'unanswered')::int > 0 then
    raise exception 'INCOMPLETE: Còn % tiêu chí chưa trả lời. Hãy chọn Đạt, Không đạt hoặc Không áp dụng cho tất cả rồi chốt.', sm->>'unanswered';
  end if;
  update checklist_audits set status = 'final', conclusion = sm, finalized_at = now() where id = p_audit returning * into au;
  return au;
end $$;

-- Ngừng bộ 18 tiêu chí cũ cho cơ sở lấy mới (bản sao đã lấy giữ nguyên)
update checklist_templates set is_active = false where organization_id is null and code = 'vietgap_melon';

insert into checklist_templates (code, name, source_note, pass_a_pct, pass_b_pct)
values ('vietgap_melon_25', 'Bảng kiểm tự đánh giá VietGAP dưa lưới nhà màng (25 tiêu chí)',
        'Theo file bảng kiểm của chủ sản phẩm (TCVN 11892-1:2017, 25 tiêu chí cốt lõi chia 4 nhóm). Nhà vườn đạt chứng nhận khi 100% tiêu chí được đánh giá ĐẠT. Chưa đối chiếu với bản của đơn vị chứng nhận: hãy đối chiếu rồi đánh dấu.',
        100, 100);
insert into checklist_items (template_id, seq, section, item_text, level)
select (select id from checklist_templates where code = 'vietgap_melon_25'), v.* from (values
  (1, 'I. Cơ sở vật chất & môi trường canh tác', 'Vị trí nhà màng an toàn: Cách ly hoàn toàn khỏi khu vực ô nhiễm, bãi rác, nhà máy hóa chất hoặc vùng ngập lụt.', 'A'),
  (2, 'I. Cơ sở vật chất & môi trường canh tác', 'Kết cấu và vệ sinh nhà màng: Khung giàn kiên cố, màng PE phủ mái và lưới chắn côn trùng không bị rách thủng.', 'A'),
  (3, 'I. Cơ sở vật chất & môi trường canh tác', 'Khu vực chứa vật tư biệt lập: Có kho riêng để bảo quản phân bón, thuốc BVTV; có khóa, biển cảnh báo và nội quy.', 'A'),
  (4, 'I. Cơ sở vật chất & môi trường canh tác', 'Khu vực sơ chế và bảo quản: Nơi xếp quả sau thu hoạch sạch sẽ, thoáng mát, tách biệt với nơi chứa hóa chất.', 'A'),
  (5, 'I. Cơ sở vật chất & môi trường canh tác', 'Quản lý chất thải, rác thải: Có thùng chứa rác sinh hoạt và thùng chứa vỏ chai thuốc BVTV nguy hại riêng biệt.', 'A'),
  (6, 'II. Nguyên liệu đầu vào & canh tác', 'Nguồn gốc hạt giống: Có hóa đơn, chứng từ chứng minh nguồn gốc rõ ràng và hồ sơ xử lý hạt giống.', 'A'),
  (7, 'II. Nguyên liệu đầu vào & canh tác', 'Chất lượng giá thể: Giá thể được xử lý sạch mầm bệnh, không chứa kim loại nặng vượt ngưỡng.', 'A'),
  (8, 'II. Nguyên liệu đầu vào & canh tác', 'Chất lượng nước tưới: Nguồn nước cấp hệ thống tưới nhỏ giọt đạt tiêu chuẩn, không nhiễm vi sinh vật độc hại.', 'A'),
  (9, 'II. Nguyên liệu đầu vào & canh tác', 'Kiểm soát phân bón đầu vào: Chỉ sử dụng phân bón nằm trong danh mục được phép lưu hành tại Việt Nam.', 'A'),
  (10, 'II. Nguyên liệu đầu vào & canh tác', 'Kỹ thuật bón phân: Bón đúng liều lượng, đúng giai đoạn; không bón phân hữu cơ chưa qua ủ hoai mục.', 'A'),
  (11, 'II. Nguyên liệu đầu vào & canh tác', 'Kiểm soát thuốc BVTV: Chỉ dùng thuốc trong danh mục cho phép. Ưu tiên thuốc sinh học, không dùng thuốc cấm.', 'A'),
  (12, 'II. Nguyên liệu đầu vào & canh tác', 'Tuân thủ nguyên tắc 4 đúng: Đúng thuốc - Đúng lúc - Đúng liều lượng - Đúng cách; tuân thủ thời gian cách ly (PHI).', 'A'),
  (13, 'III. Thu hoạch & quản lý chất lượng trái', 'Tiêu chuẩn độ chín: Thu hoạch khi đạt độ chín sinh lý (lưới đều, cuống đổi màu, độ ngọt Brix >= 12%).', 'A'),
  (14, 'III. Thu hoạch & quản lý chất lượng trái', 'Dụng cụ thu hoạch an toàn: Kéo cắt, sọt chứa được lau chùi, khử trùng; không để dưa tiếp xúc trực tiếp nền đất.', 'A'),
  (15, 'III. Thu hoạch & quản lý chất lượng trái', 'Phân loại và xử lý quả hỏng: Loại bỏ hoàn toàn quả thối, bệnh ra khỏi khu vực đóng gói và tiêu hủy đúng nơi.', 'A'),
  (16, 'III. Thu hoạch & quản lý chất lượng trái', 'Kiểm nghiệm dư lượng: Lấy mẫu kiểm nghiệm định kỳ, dư lượng thuốc BVTV và kim loại nặng trong mức cho phép.', 'A'),
  (17, 'III. Thu hoạch & quản lý chất lượng trái', 'Dán tem nhãn, bao bì: Đóng thùng có nhãn mác rõ ràng ghi tên cơ sở, mã số lô, ngày đóng gói.', 'A'),
  (18, 'IV. Quản lý hồ sơ & an toàn lao động', 'Tập huấn kiến thức VietGAP: Chủ vườn và người lao động có giấy chứng nhận tập huấn VietGAP trồng trọt.', 'A'),
  (19, 'IV. Quản lý hồ sơ & an toàn lao động', 'Nhật ký nguồn gốc giống: Ghi chép rõ ràng ngày gieo, lượng hạt giống, nhà cung cấp.', 'A'),
  (20, 'IV. Quản lý hồ sơ & an toàn lao động', 'Nhật ký sử dụng phân bón: Ghi chép chi tiết ngày bón, tên loại phân, liều lượng, tỷ lệ châm phân.', 'A'),
  (21, 'IV. Quản lý hồ sơ & an toàn lao động', 'Nhật ký thuốc BVTV: Ghi rõ ngày phun, tên thuốc, lý do phun, người phun và ngày thu hoạch an toàn.', 'A'),
  (22, 'IV. Quản lý hồ sơ & an toàn lao động', 'Nhật ký sản lượng, tiêu thụ: Ghi cụ thể ngày thu hoạch, khối lượng dưa hái và đơn vị thu mua.', 'A'),
  (23, 'IV. Quản lý hồ sơ & an toàn lao động', 'Trang bị bảo hộ lao động: Người lao động được trang bị đầy đủ quần áo bảo hộ, khẩu trang, găng tay khi làm việc.', 'A'),
  (24, 'IV. Quản lý hồ sơ & an toàn lao động', 'Vệ sinh cá nhân nhân công: Có nhà vệ sinh hợp quy cách, trang bị xà phòng rửa tay đầy đủ.', 'A'),
  (25, 'IV. Quản lý hồ sơ & an toàn lao động', 'Lưu trữ hồ sơ, khiếu nại: Hồ sơ, nhật ký lưu giữ ít nhất 12 tháng; có quy trình xử lý sự cố sản phẩm.', 'A')
) as v(seq, section, item_text, level);
