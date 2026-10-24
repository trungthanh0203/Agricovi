-- D96 (Đợt 1, T2 bước 1): FORM ĐỘNG. Trường của loại việc (field_schema) nay có thêm kiểu (chọn nhiều, ngày, có/không) và thuộc tính
-- (bắt buộc, đơn vị, nhỏ nhất/lớn nhất, gợi ý, mặc định). Máy chủ ép dạng hợp lệ để dữ liệu cấu hình không làm hỏng màn ghi việc.

create or replace function valid_field_schema(p jsonb) returns boolean
language plpgsql immutable as $$
declare f jsonb; k text; keys text[] := '{}'; o jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then return false; end if;
  for f in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    k := f->>'key';
    if k is null or k !~ '^[A-Za-z0-9_]{1,40}$' or k = any (keys) then return false; end if;
    keys := keys || k;
    if coalesce(length(trim(f->>'label')), 0) not between 1 and 80 then return false; end if;
    if coalesce(f->>'type', '') not in ('number', 'text', 'select', 'multiselect', 'date', 'bool') then return false; end if;
    if f ? 'options' then
      if jsonb_typeof(f->'options') <> 'array' or jsonb_array_length(f->'options') > 40 then return false; end if;
      for o in select * from jsonb_array_elements(f->'options') loop
        if jsonb_typeof(o) <> 'string' or length(o #>> '{}') not between 1 and 80 then return false; end if;
      end loop;
    end if;
    if f ? 'required' and jsonb_typeof(f->'required') <> 'boolean' then return false; end if;
    if f ? 'unit' and (jsonb_typeof(f->'unit') <> 'string' or length(f->>'unit') > 20) then return false; end if;
    if (f ? 'min' and jsonb_typeof(f->'min') <> 'number') or (f ? 'max' and jsonb_typeof(f->'max') <> 'number') then return false; end if;
    if f ? 'min' and f ? 'max' and (f->>'min')::numeric > (f->>'max')::numeric then return false; end if;
    if f ? 'hint' and (jsonb_typeof(f->'hint') <> 'string' or length(f->>'hint') > 120) then return false; end if;
    if f ? 'default' and (jsonb_typeof(f->'default') <> 'string' or length(f->>'default') > 120) then return false; end if;
  end loop;
  return true;
end $$;

alter table work_types add constraint work_types_field_schema_valid check (valid_field_schema(field_schema));
alter table org_catalog_overrides add constraint overrides_field_schema_valid check (valid_field_schema(field_schema));
