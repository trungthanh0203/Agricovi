-- Quản lý kho: XUẤT CHO VỤ (issue_kind = 'cycle'). Thủ kho/người có quyền sửa Kho xuất vật tư cho một vụ mà KHÔNG cần nhật ký đi kèm:
-- giao dịch mang mã vụ nên vào giá vốn vật tư của Tổng kết vụ và (với thức ăn) vào tính Tăng trọng/FCR, giống xuất khi Ghi việc.
-- Chỉ cần chọn vụ; lý do không bắt buộc (tự ghi "Xuất cho vụ ..."). Vụ phải thuộc cơ sở và chưa kết thúc hoặc hủy.

alter table inventory_transactions drop constraint if exists inventory_transactions_issue_kind_check;
alter table inventory_transactions
  add constraint inventory_transactions_issue_kind_check check (issue_kind is null or issue_kind in ('loss', 'sale', 'shared', 'other', 'cycle')),
  add constraint inv_issue_cycle_kind check (issue_kind is null or ((issue_kind = 'cycle') = (cycle_id is not null)));

create or replace function inventory_manual_issue_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c production_cycles;
begin
  if new.issue_kind is not null then
    if auth.uid() is not null and not has_perm(new.organization_id, 'inventory', 'edit') then
      raise exception 'FORBIDDEN: Chỉ người có quyền sửa Kho mới xuất kho thủ công được.';
    end if;
    if new.issue_kind = 'cycle' then
      select * into c from production_cycles where id = new.cycle_id;
      if c.id is null or c.owner_org_id <> new.organization_id then
        raise exception 'INVALID_CYCLE: Vụ không thuộc cơ sở này.';
      end if;
      if c.status in ('ended', 'cancelled') then
        raise exception 'CYCLE_CLOSED: Vụ đã kết thúc hoặc đã hủy nên không xuất vật tư cho vụ này được.';
      end if;
      if length(trim(coalesce(new.reason, ''))) < 3 then
        new.reason := 'Xuất cho vụ ' || coalesce(nullif(trim(c.name), ''), nullif(trim(c.code), ''), 'đang chạy');
      end if;
    elsif length(trim(coalesce(new.reason, ''))) < 3 then
      raise exception 'REASON_REQUIRED: Xuất kho cần ghi lý do (ít nhất 3 ký tự).';
    end if;
  end if;
  return new;
end $$;
