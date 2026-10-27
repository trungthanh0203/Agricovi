-- Điểm 2 (docs/PLAN_PHAN_BIET_LOAI_VU.md): đầu việc và biểu mẫu theo LOẠI của vụ (cây trồng / vật nuôi / thủy sản / khác).
--  1) work_types.applies_to: đầu việc áp dụng cho loại nào (null = mọi loại).
--  2) org_catalog_overrides.kind: bản chỉnh biểu mẫu theo loại ('' = mọi loại, giữ nguyên các bản chỉnh đang có).
--  3) Đầu việc cơ bản theo chuẩn cho vật nuôi và thủy sản (dùng chung, có sẵn, không cần "Áp dụng gói"); biểu mẫu chuẩn nằm ở app (lib/standardFields.ts).

alter table work_types add column applies_to text[]
  check (applies_to is null or (cardinality(applies_to) > 0 and applies_to <@ array['crop', 'livestock', 'aquatic', 'other']));
update work_types set applies_to = array['crop'] where organization_id is null and code in ('irrigation', 'fertilizing', 'spraying', 'pruning', 'pollination');

alter table org_catalog_overrides add column kind text not null default '' check (kind in ('', 'crop', 'livestock', 'aquatic', 'other'));
alter table org_catalog_overrides drop constraint org_catalog_overrides_pkey;
alter table org_catalog_overrides add primary key (organization_id, item_kind, item_id, kind);

-- tên giai đoạn lấy theo tên đã chỉnh của cơ sở (bản chỉnh chung cho mọi loại, kind = '')
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
        on o.organization_id = new.organization_id and o.item_kind = 'work_type' and o.item_id = w.id and o.kind = ''
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
revoke execute on function template_stage_prepare() from public, anon;

-- Đầu việc cơ bản theo chuẩn (dùng chung). Tên giữ khớp với gói heo cũ để sổ nhật ký và FCR nhận ra.
insert into work_types (code, name, field_schema, applies_to) values
  ('feeding',        'Cho ăn',                       '[]', array['livestock', 'aquatic']),
  ('feed_mixing',    'Tự phối trộn thức ăn',         '[]', array['livestock', 'aquatic']),
  ('treating',       'Điều trị bệnh',                '[]', array['livestock', 'aquatic']),
  ('weighing',       'Cân mẫu',                      '[]', array['livestock', 'aquatic']),
  ('disinfecting',   'Sát trùng',                    '[]', array['livestock', 'aquatic']),
  ('vaccinating',    'Tiêm vaccine',                 '[]', array['livestock']),
  ('deworming',      'Tẩy giun sán',                 '[]', array['livestock']),
  ('water_checking', 'Kiểm tra nước uống',           '[]', array['livestock']),
  ('pit_changing',   'Thay thuốc hố sát trùng',      '[]', array['livestock']),
  ('waste_handling', 'Xử lý chất thải / biogas',     '[]', array['livestock']),
  ('pest_control',   'Diệt côn trùng và chuột',      '[]', array['livestock']),
  ('house_cleaning', 'Vệ sinh và để trống chuồng',   '[]', array['livestock']),
  ('water_measuring','Đo môi trường nước',           '[]', array['aquatic']),
  ('water_changing', 'Thay nước',                    '[]', array['aquatic']),
  ('water_treating', 'Xử lý nước (vôi, chế phẩm)',   '[]', array['aquatic']),
  ('pond_cleaning',  'Vệ sinh ao, bể',               '[]', array['aquatic'])
on conflict (code) where organization_id is null do nothing;

-- Tăng trọng/FCR nhận cả việc "Cân mẫu" (chuẩn) lẫn "Cân heo" (gói heo cũ)
create or replace function get_cycle_growth(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_weigh jsonb; v_stock jsonb; v_logs jsonb; v_manual jsonb; v_can boolean; v_other boolean := false;
begin
  select owner_org_id into v_org from production_cycles where id = p_cycle;
  if v_org is null or not can_read_cycle(p_cycle) then raise exception 'NOT_FOUND: Không tìm thấy vụ hoặc bạn không có quyền xem.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'pigs', x.pigs, 'avg_kg', x.avg, 'id', x.id, 'manual', x.manual) order by x.d, x.ts), '[]'::jsonb) into v_weigh
    from (
      select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, l.performed_at ts,
             case when l.data->>'pigs' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'pigs')::numeric end pigs,
             case when l.data->>'avg_kg' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'avg_kg')::numeric end avg,
             null::uuid id, false manual
        from activity_logs l join work_types w on w.id = l.work_type_id
       where l.cycle_id = p_cycle and l.voided_at is null and (w.name ilike 'cân heo%' or w.name ilike 'cân mẫu%' or (w.organization_id is null and w.code = 'weighing'))
      union all
      select m.weigh_date, m.created_at, m.head_count::numeric, m.avg_kg, m.id, true
        from cycle_weighings m where m.cycle_id = p_cycle and m.voided_at is null
    ) x
   where x.avg is not null and x.avg > 0;

  select coalesce(jsonb_agg(jsonb_build_object('date', y.d, 'kg', y.kg) order by y.d), '[]'::jsonb) into v_logs
    from (select u.d, sum(u.kg) kg from (
            select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, (l.data->>'feed_kg')::numeric kg
              from activity_logs l
             where l.cycle_id = p_cycle and l.voided_at is null and l.data->>'feed_kg' ~ '^[0-9]+(\.[0-9]+)?$'
            union all
            select f.feed_date, f.kg from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null
          ) u group by u.d) y;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'date', f.feed_date, 'kg', f.kg, 'name', f.feed_name) order by f.feed_date, f.created_at), '[]'::jsonb) into v_manual
    from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null;

  v_can := has_perm(v_org, 'inventory', 'view');
  if v_can then
    select coalesce(jsonb_agg(jsonb_build_object('date', z.d, 'kg', z.kg) order by z.d), '[]'::jsonb), coalesce(bool_or(z.unknown), false) into v_stock, v_other
      from (select t.txn_date d, sum(case when f.factor is null then 0 else -t.quantity_delta * f.factor end) kg, bool_or(f.factor is null) unknown
              from inventory_transactions t
              join materials m on m.id = t.material_id and m.material_group = 'feed'
              join units_of_measure u on u.id = m.base_unit_id
              cross join lateral (select case u.code when 'kg' then 1::numeric when 'g' then 0.001 when 'ton' then 1000::numeric end as factor) f
             where t.cycle_id = p_cycle and t.txn_type = 'issue'
               and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
             group by t.txn_date) z;
  else
    v_stock := '[]'::jsonb;
  end if;

  return jsonb_build_object('weighings', v_weigh, 'feed', jsonb_build_object('can_view', v_can, 'stock_by_date', v_stock, 'other_unit', v_other, 'logs_by_date', v_logs, 'manual_entries', v_manual));
end $$;
