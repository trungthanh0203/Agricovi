-- Kho đợt 2: XUẤT KHO TAY (hao hụt/hỏng, xuất bán, dùng chung, khác; bắt buộc lý do) và CHUYỂN KHO giữa hai kho.
--  - Xuất tay là giao dịch 'issue' có issue_kind, không gắn nhật ký; lô tự gắn theo hạn gần nhất như xuất khi ghi việc (trigger có sẵn).
--    Chỉ người có quyền sửa Kho được xuất tay (nhân viên vẫn chỉ "xuất dùng" khi ghi việc).
--  - Chuyển kho = hai giao dịch 'adjustment' (trừ kho đi, cộng kho đến) cùng transfer_id, chuyển theo lô (hạn gần nhất trước)
--    nên tổng tồn không đổi và tồn theo lô khớp. Cho chuyển quá tồn (tồn âm vẫn chỉ cảnh báo, như quy tắc kho).

alter table inventory_transactions
  add column issue_kind text check (issue_kind is null or issue_kind in ('loss', 'sale', 'shared', 'other')),
  add column transfer_id uuid,
  add constraint inv_issue_kind_issue_only check (issue_kind is null or (txn_type = 'issue' and activity_log_id is null)),
  add constraint inv_transfer_adjustment_only check (transfer_id is null or txn_type = 'adjustment');
create index on inventory_transactions (transfer_id) where transfer_id is not null;

create or replace function inventory_manual_issue_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.issue_kind is not null then
    if auth.uid() is not null and not has_perm(new.organization_id, 'inventory', 'edit') then
      raise exception 'FORBIDDEN: Chỉ người có quyền sửa Kho mới xuất kho thủ công được.';
    end if;
    if length(trim(coalesce(new.reason, ''))) < 3 then
      raise exception 'REASON_REQUIRED: Xuất kho cần ghi lý do (ít nhất 3 ký tự).';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_manual_issue_ins before insert on inventory_transactions
  for each row execute function inventory_manual_issue_guard();

create function transfer_stock(p_org uuid, p_material uuid, p_from uuid, p_to uuid, p_qty numeric, p_date date, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  tid uuid := gen_random_uuid(); need numeric := p_qty; lot record; take numeric; fname text; tname text; rsn text;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY: Số lượng chuyển phải lớn hơn 0.'; end if;
  if p_from = p_to then raise exception 'INVALID_LOCATION: Kho đi và kho đến phải khác nhau.'; end if;
  select name into fname from inventory_locations where id = p_from and organization_id = p_org and is_active;
  select name into tname from inventory_locations where id = p_to and organization_id = p_org and is_active;
  if fname is null or tname is null then raise exception 'INVALID_LOCATION: Kho không thuộc cơ sở này hoặc đã dừng.'; end if;
  if not exists (select 1 from materials where id = p_material and organization_id = p_org) then
    raise exception 'INVALID_MATERIAL: Vật tư không thuộc cơ sở này.';
  end if;
  rsn := 'Chuyển kho: ' || fname || ' → ' || tname || coalesce(' — ' || nullif(trim(p_note), ''), '');

  for lot in
    select l.id as lot_id, sum(t.quantity_delta) as rem
      from material_lots l join inventory_transactions t on t.lot_id = l.id and t.location_id = p_from
     where l.material_id = p_material
     group by l.id, l.expiry_date, l.received_date, l.created_at
    having sum(t.quantity_delta) > 0
     order by l.expiry_date nulls last, l.received_date, l.created_at
  loop
    exit when need <= 0;
    take := least(need, lot.rem);
    insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason, source, transfer_id, lot_id)
      values (gen_random_uuid(), p_org, p_from, p_material, 'adjustment', -take, p_date, rsn, 'online', tid, lot.lot_id),
             (gen_random_uuid(), p_org, p_to, p_material, 'adjustment', take, p_date, rsn, 'online', tid, lot.lot_id);
    need := need - take;
  end loop;
  if need > 0 then  -- phần không thuộc lô nào (hoặc vượt tồn)
    insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason, source, transfer_id)
      values (gen_random_uuid(), p_org, p_from, p_material, 'adjustment', -need, p_date, rsn, 'online', tid),
             (gen_random_uuid(), p_org, p_to, p_material, 'adjustment', need, p_date, rsn, 'online', tid);
  end if;
  return tid;
end $$;
revoke execute on function transfer_stock(uuid, uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function transfer_stock(uuid, uuid, uuid, uuid, numeric, date, text) to authenticated, service_role;
