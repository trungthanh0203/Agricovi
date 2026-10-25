-- P1B (D98): BẢNG KIỂM NỘI BỘ (VietGAP/VietGAHP) — dữ liệu cấu hình sửa được, không cài cứng.
--  - Bộ bảng kiểm = checklist_templates + checklist_items. Bộ DÙNG CHUNG (organization_id null) do hệ thống nạp, chỉ đọc.
--    Mỗi cơ sở "lấy về" một BẢN SAO (ensure_checklist_template) rồi tự sửa: nội dung, MỨC A/B từng tiêu chí, ngưỡng đạt (A mặc định 100 %, B mặc định 50 %).
--  - Bộ nạp sẵn đối chiếu theo file bảng kiểm của chủ sản phẩm (45 tiêu chí: 31 A, 14 B); verified_at trống = CHƯA đối chiếu với bản chính thức.
--  - Một lần đánh giá = checklist_audits + checklist_answers; câu hỏi/mức A-B/ngưỡng được CHỤP lại lúc bắt đầu để sửa bộ sau này không làm đổi kết quả cũ.
--  - Kết luận: mọi tiêu chí phải được trả lời; "không áp dụng" bị loại khỏi mẫu số; đạt khi tỉ lệ A >= ngưỡng A và tỉ lệ B >= ngưỡng B.
--  - Chốt kết quả là bất biến (hủy = đánh dấu kèm lý do). Quyền: mục "Khai báo" (xem/sửa).

create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,   -- null = bộ dùng chung
  code text check (code is null or code ~ '^[a-z0-9_]{2,40}$'),           -- mã bộ dùng chung
  source_code text,                                                        -- bản sao của bộ dùng chung nào
  name text not null check (length(trim(name)) between 2 and 160),
  source_note text check (source_note is null or length(source_note) <= 400),
  pass_a_pct integer not null default 100 check (pass_a_pct between 0 and 100),
  pass_b_pct integer not null default 50 check (pass_b_pct between 0 and 100),
  verified_at timestamptz,                                                 -- đã đối chiếu với bản chính thức của đơn vị chứng nhận
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null and code is not null) or (organization_id is not null and code is null))
);
create unique index checklist_templates_shared_code on checklist_templates (code) where organization_id is null;
create unique index checklist_templates_org_source on checklist_templates (organization_id, source_code) where source_code is not null;
create trigger checklist_templates_updated before update on checklist_templates for each row execute function set_updated_at();

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,    -- sao từ bộ chứa (null = dùng chung)
  seq integer not null check (seq > 0),
  item_text text not null check (length(trim(item_text)) between 3 and 600),
  level text not null check (level in ('A', 'B')),
  method text check (method is null or length(method) <= 200),
  unique (template_id, seq)
);
create or replace function checklist_item_org() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from checklist_templates where id = new.template_id;
  return new;
end $$;
create trigger checklist_items_org before insert on checklist_items for each row execute function checklist_item_org();

alter table checklist_templates enable row level security;
alter table checklist_items enable row level security;
create policy checklist_templates_read on checklist_templates for select to authenticated
  using (organization_id is null or has_perm(organization_id, 'declare', 'view'));
create policy checklist_templates_write on checklist_templates for update to authenticated
  using (organization_id is not null and has_perm(organization_id, 'declare', 'edit'))
  with check (organization_id is not null and has_perm(organization_id, 'declare', 'edit'));
create policy checklist_items_read on checklist_items for select to authenticated
  using (organization_id is null or has_perm(organization_id, 'declare', 'view'));
create policy checklist_items_write on checklist_items for all to authenticated
  using (organization_id is not null and has_perm(organization_id, 'declare', 'edit'))
  with check (organization_id is not null and has_perm(organization_id, 'declare', 'edit')
              and exists (select 1 from checklist_templates t where t.id = template_id and t.organization_id = checklist_items.organization_id));
revoke insert, delete on checklist_templates from authenticated, anon;   -- bản sao chỉ tạo qua ensure_checklist_template

-- Lần đánh giá và câu trả lời (đã chụp nội dung bộ lúc bắt đầu)
create table checklist_audits (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  template_id uuid references checklist_templates(id) on delete set null,
  template_name text not null,
  audit_date date not null,
  auditor text check (auditor is null or length(auditor) <= 200),
  pass_a_pct integer not null,
  pass_b_pct integer not null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  conclusion jsonb,
  finalized_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(void_reason) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or void_reason is not null)
);
create index on checklist_audits (organization_id, audit_date desc);
create table checklist_answers (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references checklist_audits(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  seq integer not null,
  item_text text not null,
  level text not null check (level in ('A', 'B')),
  method text,
  result text check (result is null or result in ('pass', 'fail', 'na')),
  evidence text check (evidence is null or length(evidence) <= 500),
  unique (audit_id, seq)
);
alter table checklist_audits enable row level security;
alter table checklist_answers enable row level security;
create policy checklist_audits_read on checklist_audits for select to authenticated using (has_perm(organization_id, 'declare', 'view'));
create policy checklist_answers_read on checklist_answers for select to authenticated using (has_perm(organization_id, 'declare', 'view'));
revoke insert, update, delete on checklist_audits, checklist_answers from authenticated, anon;   -- chỉ ghi qua hàm bên dưới

-- Kết quả: tính từ các câu trả lời của một lần đánh giá (hàm nội bộ, không kiểm quyền)
create or replace function checklist_summary_of(p_audit uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select * from checklist_audits where id = p_audit),
  s as (
    select count(*) filter (where level = 'A' and result in ('pass', 'fail')) a_total,
           count(*) filter (where level = 'A' and result = 'pass') a_pass,
           count(*) filter (where level = 'B' and result in ('pass', 'fail')) b_total,
           count(*) filter (where level = 'B' and result = 'pass') b_pass,
           count(*) filter (where result = 'na') na,
           count(*) filter (where result is null) unanswered
      from checklist_answers where audit_id = p_audit),
  p as (select s.*, case when a_total = 0 then 100 else a_pass * 100.0 / a_total end a_pct,
                     case when b_total = 0 then 100 else b_pass * 100.0 / b_total end b_pct from s)
  select jsonb_build_object(
    'a_total', p.a_total, 'a_pass', p.a_pass, 'b_total', p.b_total, 'b_pass', p.b_pass, 'na', p.na, 'unanswered', p.unanswered,
    'a_pct', round(p.a_pct, 1), 'b_pct', round(p.b_pct, 1),
    'verdict', case when p.unanswered > 0 then 'incomplete'
                    when p.a_pct >= a.pass_a_pct and p.b_pct >= a.pass_b_pct then 'pass' else 'fail' end)
  from p, a;
$$;
revoke execute on function checklist_summary_of(uuid) from public, anon, authenticated;

-- Lấy bộ dùng chung về làm bản sao của cơ sở (gọi lặp trả bản đã có)
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
  insert into checklist_items (template_id, seq, item_text, level, method)
    select v_id, seq, item_text, level, method from checklist_items where template_id = v_src.id;
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
  insert into checklist_answers (audit_id, organization_id, seq, item_text, level, method)
    select p_id, p_org, i.seq, i.item_text, i.level, i.method from checklist_items i where i.template_id = t.id order by i.seq;
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
  if p_result is not null and p_result not in ('pass', 'fail', 'na') then raise exception 'INVALID_RESULT: Kết quả phải là Đạt, Chưa đạt hoặc Không áp dụng.'; end if;
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
    raise exception 'INCOMPLETE: Còn % tiêu chí chưa trả lời. Hãy chọn Đạt, Chưa đạt hoặc Không áp dụng cho tất cả rồi chốt.', sm->>'unanswered';
  end if;
  update checklist_audits set status = 'final', conclusion = sm, finalized_at = now() where id = p_audit returning * into au;
  return au;
end $$;

create or replace function void_checklist_audit(p_audit uuid, p_reason text) returns checklist_audits
language plpgsql security definer set search_path = public as $$
declare au checklist_audits;
begin
  select * into au from checklist_audits where id = p_audit;
  if au.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần đánh giá.'; end if;
  if not has_perm(au.organization_id, 'declare', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền hủy bảng kiểm.'; end if;
  if au.voided_at is not null then return au; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'INVALID_REASON: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  update checklist_audits set voided_at = now(), void_reason = trim(p_reason) where id = p_audit returning * into au;
  return au;
end $$;

-- Kết quả của một lần đánh giá: đã chốt thì lấy bản đã lưu, còn nháp thì tính tạm
create or replace function get_checklist_summary(p_audit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare au checklist_audits;
begin
  select * into au from checklist_audits where id = p_audit;
  if au.id is null or not has_perm(au.organization_id, 'declare', 'view') then raise exception 'NOT_FOUND: Không tìm thấy lần đánh giá.'; end if;
  return coalesce(au.conclusion, checklist_summary_of(p_audit));
end $$;

revoke execute on function ensure_checklist_template(uuid, text), start_checklist_audit(uuid, uuid, uuid, date, text),
  save_checklist_answer(uuid, text, text), finalize_checklist_audit(uuid), void_checklist_audit(uuid, text), get_checklist_summary(uuid) from public, anon;
grant execute on function ensure_checklist_template(uuid, text), start_checklist_audit(uuid, uuid, uuid, date, text),
  save_checklist_answer(uuid, text, text), finalize_checklist_audit(uuid), void_checklist_audit(uuid, text), get_checklist_summary(uuid) to authenticated, service_role;

-- Bộ dùng chung nạp sẵn: bảng kiểm VietGAHP/VietGAP chăn nuôi heo (45 tiêu chí). verified_at để trống: CHƯA đối chiếu với bản chính thức.
insert into checklist_templates (code, name, source_note)
values ('vietgap_pig', 'Bảng kiểm nội bộ VietGAP chăn nuôi heo (45 tiêu chí)',
        'Theo file bảng kiểm của chủ sản phẩm (ghi kèm Quyết định số 4653/QĐ-BNN-CN). Mức A/B và nội dung CHƯA đối chiếu với bản chính thức của đơn vị chứng nhận: hãy đối chiếu rồi sửa nếu lệch.');
insert into checklist_items (template_id, seq, item_text, level, method)
select (select id from checklist_templates where code = 'vietgap_pig'), v.* from (values
  (1, 'Từ trang trại đến trường học, bệnh viện, khu dân cư, nơi tập trung đông người, nguồn nước mặt có đạt khoảng cách tối thiểu theo quy định?', 'A', 'Quan sát thực tế & Đo đạc'),
  (2, 'Có đủ nguồn nước sạch phục vụ chăn nuôi và xử lý môi trường đạt tiêu chuẩn QCVN 01-39:2011/BNNPTNT?', 'A', 'Xem kết quả kiểm nghiệm nước'),
  (3, 'Trại có sơ đồ thiết kế bố trí riêng biệt các khu: chuồng nuôi, kho thức ăn, kho thuốc, khu xử lý chất thải, đảm bảo ATSH và PCCC?', 'A', 'Quan sát sơ đồ & thực tế'),
  (4, 'Trại chăn nuôi có tường hoặc hàng rào bao quanh để kiểm soát người, động vật và phương tiện ra vào trại?', 'A', 'Quan sát thực tế'),
  (5, 'Tại cổng ra vào trại có bố trí khu vực khử trùng (hố sát trùng, phòng phun sương, hố rửa ủng)?', 'A', 'Quan sát thực tế'),
  (6, 'Tại các khu chuồng nuôi có bố trí hố khử trùng hoặc chậu sát trùng độc lập?', 'B', 'Quan sát thực tế'),
  (7, 'Chuồng nuôi lợn có được thiết kế phù hợp với từng lứa tuổi của lợn (nái, hậu bị, lợn con, lợn thịt) và mục đích sản xuất?', 'A', 'Quan sát thực tế'),
  (8, 'Máng ăn, máng uống dùng cho chăn nuôi lợn có đảm bảo không gây độc (inox/nhựa nguyên sinh) và dễ vệ sinh, tẩy rửa?', 'A', 'Quan sát thực tế'),
  (9, 'Các thiết bị, dụng cụ sử dụng trong chăn nuôi có đảm bảo an toàn và dễ vệ sinh, bảo trì định kỳ?', 'A', 'Quan sát & Kiểm tra hồ sơ'),
  (10, 'Giống lợn nuôi trong trại có nguồn gốc rõ ràng, có hồ sơ lý lịch và chứng nhận kiểm dịch?', 'A', 'Kiểm tra hồ sơ giống'),
  (11, 'Lợn giống đưa từ bên ngoài vào trại có đảm bảo khỏe mạnh và được nuôi cách ly tối thiểu 14-21 ngày?', 'A', 'Kiểm tra thực tế & Sổ cách ly'),
  (12, 'Có quy trình chăn nuôi cho từng giống lợn theo mục đích sử dụng (nái đẻ, lợn thịt, hậu bị) và ban hành áp dụng?', 'A', 'Kiểm tra văn bản quy trình'),
  (13, 'Có áp dụng phương thức quản lý ''Cùng vào - Cùng ra'' (All-in All-out) theo dãy hoặc theo chuồng?', 'B', 'Kiểm tra hồ sơ chu chuyển'),
  (14, 'Trại có đầy đủ trang thiết bị và quy trình vệ sinh, tiêu độc, khử trùng đảm bảo an toàn sinh học?', 'A', 'Quan sát & Kiểm tra hồ sơ'),
  (15, 'Tất cả mọi người khi vào trại có tuân thủ việc tắm, thay quần áo, giày dép bảo hộ và đi đúng tuyến kỹ thuật?', 'A', 'Quan sát & Kiểm tra sổ khách'),
  (16, 'Phương tiện vận chuyển ra vào trại (xe cám, xe lợn) có được phun khử trùng nghiêm ngặt?', 'A', 'Quan sát & Nhật ký khử trùng'),
  (17, 'Có định kỳ phun thuốc khử trùng trong chuồng nuôi (khi có hoặc không có heo)?', 'B', 'Kiểm tra sổ phun thuốc'),
  (18, 'Có định kỳ phun thuốc khử trùng khu vực ngoài chuồng nuôi và đường nội bộ?', 'B', 'Kiểm tra sổ phun thuốc'),
  (19, 'Có định kỳ phát quang bụi rậm xung quanh khu chuồng nuôi và vệ sinh hệ thống cống rãnh?', 'B', 'Quan sát thực tế'),
  (20, 'Sau mỗi đợt nuôi hoặc sau khi chuyển đàn có thực hiện quy trình rửa sạch và để trống chuồng tối thiểu 7 ngày?', 'A', 'Kiểm tra nhật ký trống chuồng'),
  (21, 'Thiết bị, dụng cụ và phương tiện phục vụ trong chăn nuôi có được tiêu độc khử trùng thường xuyên?', 'A', 'Quan sát & Phỏng vấn'),
  (22, 'Sử dụng thức ăn chăn nuôi có nguồn gốc rõ ràng, còn hạn sử dụng và đảm bảo chất lượng?', 'A', 'Kiểm tra hóa đơn & Nhãn mác'),
  (23, 'Tuân thủ việc không sử dụng thức ăn có chứa hóa chất, kháng sinh thuộc danh mục chất cấm?', 'A', 'Kiểm tra hồ sơ & Phiếu xét nghiệm'),
  (24, 'Thức ăn dự trữ có được bảo quản trong kho đảm bảo khô ráo, thoáng mát, kê trên pallet và chống dịch hại?', 'A', 'Quan sát thực tế kho cám'),
  (25, 'Có ghi chép đầy đủ và lưu giữ các thông tin về xuất nhập thức ăn và lịch sử sử dụng kháng sinh trộn?', 'A', 'Kiểm tra Sổ nhập xuất cám'),
  (26, 'Có thường xuyên kiểm tra và vệ sinh khu vực sản xuất/kho chứa thức ăn để tránh gây ô nhiễm nấm mốc?', 'B', 'Quan sát thực tế'),
  (27, 'Nguồn nước cho chăn nuôi lợn uống có đảm bảo an toàn, kiểm tra chỉ tiêu vi sinh (E.coli, Coliforms) định kỳ?', 'A', 'Xem phiếu phân tích nước'),
  (28, 'Có kiểm tra thường xuyên hệ thống lọc và cấp nước chăn nuôi cho trang trại?', 'B', 'Kiểm tra sổ bảo dưỡng'),
  (29, 'Vận chuyển lợn giữa các trại hoặc xuất bán có sử dụng phương tiện vận chuyển chuyên dụng, phù hợp mật độ?', 'B', 'Quan sát & Kiểm tra sàn xe'),
  (30, 'Trước và sau khi vận chuyển lợn, phương tiện vận chuyển có được rửa sạch và khử trùng?', 'A', 'Kiểm tra biên bản khử trùng xe'),
  (31, 'Có lập kế hoạch phòng trừ dịch bệnh, lịch tiêm phòng vaccine và quy trình tẩy giun sán phù hợp?', 'B', 'Kiểm tra Lịch vắc xin'),
  (32, 'Có hồ sơ theo dõi dịch bệnh, nguyên nhân phát sinh, triệu chứng và loại thuốc phòng điều trị?', 'A', 'Kiểm tra Sổ theo dõi điều trị'),
  (33, 'Có sổ theo dõi sử dụng thuốc điều trị, ghi rõ tên thuốc, liều lượng, ngày bắt đầu - kết thúc và thời gian ngưng thuốc?', 'A', 'Kiểm tra Sổ dùng thuốc'),
  (34, 'Khi lợn ốm có nhốt ra khu nuôi cách ly? Khi phát hiện dịch bệnh nguy hiểm có báo ngay cho cơ quan thú y?', 'A', 'Quan sát ô bệnh viện & Quy trình'),
  (35, 'Chất thải rắn (phân, nhau thai, xác lợn) có được thu gom chuyển đến nơi tập trung và xử lý hợp vệ sinh?', 'A', 'Quan sát khu xử lý phân'),
  (36, 'Chất thải lỏng có được thu gom vào hệ thống Biogas/hồ sinh học và xử lý đạt QCVN 62-MT:2016/BTNMT?', 'A', 'Xem phiếu kiểm nghiệm nước thải'),
  (37, 'Trại có kế hoạch và thực hiện kiểm soát động vật hoang dã, loài gặm nhấm (chuột) và côn trùng (ruồi, muỗi)?', 'B', 'Quan sát hộc bẫy chuột'),
  (38, 'Có quy trình và trang thiết bị ứng phó sự cố khẩn cấp (mất điện, cháy nổ, tai nạn lao động)?', 'B', 'Kiểm tra quy trình & Máy phát'),
  (39, 'Người lao động có được ký hợp đồng lao động và khám sức khỏe định kỳ tối thiểu 1 lần/năm?', 'B', 'Kiểm tra hồ sơ nhân sự'),
  (40, 'Người lao động có được tập huấn về quy trình chăn nuôi, an toàn sinh học, ATTP và bảo vệ môi trường?', 'A', 'Kiểm tra giấy chứng nhận tập huấn'),
  (41, 'Trang trại chăn nuôi lợn có lập các sổ ghi chép theo dõi đầy đủ và lưu trữ hồ sơ tối thiểu 2 năm?', 'A', 'Kiểm tra kho hồ sơ & App'),
  (42, 'Có tiến hành tự kiểm tra đánh giá nội bộ định kỳ tối thiểu 1 lần/năm?', 'B', 'Kiểm tra báo cáo đánh giá'),
  (43, 'Bảng kiểm tra đánh giá nội bộ VietGAP có đầy đủ chữ ký của đại diện trại và được lưu hồ sơ?', 'A', 'Kiểm tra hồ sơ lưu'),
  (44, 'Trang trại có quy trình tiếp nhận, biểu mẫu và sổ theo dõi giải quyết khiếu nại của khách hàng?', 'B', 'Kiểm tra sổ khiếu nại'),
  (45, 'Tất cả lợn trong trại được định danh (bấm tai/đeo thẻ/mã lô) đảm bảo truy xuất nguồn gốc từ cơ sở giống?', 'A', 'Quan sát thẻ tai & App')
) as v(seq, item_text, level, method);
