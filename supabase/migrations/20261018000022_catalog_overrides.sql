-- Cơ sở được SỬA hoặc DỪNG các mục có sẵn dùng chung (cây trồng, loại việc) cho riêng mình (D32), và dừng khu trồng.
-- Mục dùng chung là của nền tảng nên không sửa trực tiếp (sẽ đổi cho mọi cơ sở). Thay vào đó mỗi cơ sở có một "bản chỉnh":
--   display_name: tên hiển thị riêng; field_schema: trường cần ghi riêng (loại việc); is_active=false: cơ sở này dừng dùng mục đó.
-- Mã mục không đổi nên nhật ký, quy trình, vụ cũ vẫn hiển thị đúng; bỏ bản chỉnh là trở về mặc định.

create table org_catalog_overrides (
  organization_id uuid not null references organizations(id) on delete cascade,
  item_kind text not null check (item_kind in ('crop_type', 'work_type')),
  item_id uuid not null,
  display_name text check (display_name is null or length(trim(display_name)) > 0),
  field_schema jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, item_kind, item_id)
);

create or replace function override_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare item_org uuid; item_found boolean;
begin
  if new.item_kind = 'crop_type' then
    select true, organization_id into item_found, item_org from crop_types where id = new.item_id;
    if new.field_schema is not null then
      raise exception 'INVALID_ITEM: Cây trồng không có trường dữ liệu để chỉnh.';
    end if;
  else
    select true, organization_id into item_found, item_org from work_types where id = new.item_id;
  end if;
  if item_found is null then raise exception 'INVALID_ITEM: Không tìm thấy mục cần chỉnh.'; end if;
  if item_org is not null then
    raise exception 'INVALID_ITEM: Chỉ chỉnh bản có sẵn dùng chung; mục của cơ sở thì sửa trực tiếp.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger org_catalog_overrides_guard before insert or update on org_catalog_overrides
  for each row execute function override_guard();

alter table org_catalog_overrides enable row level security;
create policy ovr_read on org_catalog_overrides for select to authenticated using (can_read_org_config(organization_id));
create policy ovr_write on org_catalog_overrides for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));

-- Tên giai đoạn lấy theo tên việc đã chọn, có tính bản chỉnh của cơ sở (nội dung còn lại giữ như migration 0021)
create or replace function template_stage_prepare() returns trigger language plpgsql security definer set search_path = public as $$
declare wt_org uuid; wt_name text; wt_found boolean;
begin
  select organization_id into new.organization_id from cycle_templates where id = new.template_id;
  if new.organization_id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;

  if tg_op = 'INSERT' and new.work_type_id is null and coalesce(current_setting('agri.copying_template', true), '') <> '1' then
    raise exception 'INVALID_WORK_TYPE: Giai đoạn phải chọn từ danh mục việc.';
  end if;
  if new.work_type_id is not null then
    select true, w.organization_id, coalesce(o.display_name, w.name) into wt_found, wt_org, wt_name
      from work_types w
      left join org_catalog_overrides o
        on o.organization_id = new.organization_id and o.item_kind = 'work_type' and o.item_id = w.id
     where w.id = new.work_type_id;
    if wt_found is null then raise exception 'INVALID_WORK_TYPE: Không tìm thấy việc trong danh mục.'; end if;
    if wt_org is not null and wt_org <> new.organization_id then
      raise exception 'INVALID_WORK_TYPE: Việc này không thuộc cơ sở.';
    end if;
    new.name := wt_name;
  end if;

  if tg_op = 'INSERT' and (new.seq is null or new.seq < 1) then
    select coalesce(max(seq), 0) + 1 into new.seq from template_stages where template_id = new.template_id;
  end if;
  if tg_op = 'UPDATE' and new.template_id <> old.template_id then
    raise exception 'IMMUTABLE_FIELD: Không chuyển giai đoạn sang mẫu khác.';
  end if;
  if tg_op = 'UPDATE' and new.duration_days < old.duration_days
     and exists (select 1 from template_tasks t where t.stage_id = new.id and t.start_day > new.duration_days) then
    raise exception 'INVALID_DURATION: Giai đoạn còn việc bắt đầu sau ngày thứ %. Hãy sửa ngày bắt đầu của việc trước.', new.duration_days;
  end if;
  return new;
end $$;

-- Khu trồng dừng được (không dùng để tạo vụ mới nhưng giữ lịch sử)
alter table production_areas add column is_active boolean not null default true;
