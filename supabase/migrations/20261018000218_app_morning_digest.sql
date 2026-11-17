-- H2 lát 2 (D183): BẢN TIN SÁNG. Mỗi sáng (lịch 7 giờ giờ Việt Nam, xem supabase/maintenance/schedule_morning_digest.sql) máy chủ đếm gọn, cho TỪNG người đã bật thông báo,
-- những việc cần chú ý hôm nay rồi gửi MỘT thông báo gộp. Chỉ có số đếm (không ghi tiền, tên khách) vì hiện trên màn hình khóa. Không có gì để nhắc thì không gửi.
-- Quyền: dùng đúng các hàm kiểm quyền hiện có bằng cách đặt người nhận làm "người đang gọi" trong giao dịch (request.jwt.claim.sub), nên người nào
-- thấy gì ở app thì chỉ được nhắc đúng phần đó. Quy tắc "đến hạn" khớp với Trang chủ (Nhắc việc hôm nay, Mốc an toàn, Bảo dưỡng tài sản).
-- Mỗi người mỗi ngày tối đa một bản tin (bảng push_digest_log), chạy lại không gửi trùng. Không dùng hàm thống kê vụ nặng (get_cycles_stats).

create table push_digest_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  counts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table push_digest_log enable row level security;
revoke all on push_digest_log from authenticated, anon;

-- Đếm cho một người (cộng qua mọi cơ sở họ thuộc)
create or replace function morning_digest_counts(p_user uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record; r record; j jsonb;
  t_crop int := 0; t_live int := 0; t_aq int := 0; t_other int := 0;
  v_vac int := 0; v_ms int := 0; v_assets int := 0; v_pay int := 0; v_rec int := 0; v_lic int := 0; n int;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);                 -- các hàm kiểm quyền đọc auth.uid() từ đây
  for o in select organization_id from organization_memberships where user_id = p_user and status = 'active' loop
    -- việc theo kế hoạch hôm nay và trễ (khớp TodayPlan: vụ đang sản xuất, chưa xong, trễ tối đa 15 ngày)
    for r in
      select coalesce(ct.kind, 'crop') k, count(*)::int n
        from production_stages s join production_cycles c on c.id = s.cycle_id left join crop_types ct on ct.id = c.crop_type_id
       where c.owner_org_id = o.organization_id and c.status = 'active' and s.status <> 'done' and s.planned_end is not null
         and coalesce(s.planned_start, s.planned_end) <= p_day and p_day - s.planned_end <= 15 and can_read_cycle(c.id)
       group by 1
    loop
      if r.k = 'livestock' then t_live := t_live + r.n; elsif r.k = 'aquatic' then t_aq := t_aq + r.n; elsif r.k = 'crop' then t_crop := t_crop + r.n; else t_other := t_other + r.n; end if;
    end loop;
    -- mốc và mũi tiêm: quá hạn, hôm nay hoặc trong 3 ngày tới
    for r in
      select m.kind, count(*)::int n
        from cycle_milestones m join production_cycles c on c.id = m.cycle_id
       where c.owner_org_id = o.organization_id and c.status::text not in ('ended', 'cancelled') and m.done_at is null and can_read_cycle(c.id)
         and (case when m.anchor = 'end' then c.expected_end_date - m.offset_days else c.start_date + m.offset_days end) <= p_day + 3
       group by 1
    loop
      if r.kind = 'vaccine' then v_vac := v_vac + r.n; else v_ms := v_ms + r.n; end if;
    end loop;
    if has_perm(o.organization_id, 'expenses', 'view') then
      select count(*)::int into n from assets a
       where a.organization_id = o.organization_id and a.status = 'active' and a.maintain_every_months is not null
         and (coalesce(a.last_maintained_on, a.purchase_date) + make_interval(months => a.maintain_every_months))::date <= p_day;
      v_assets := v_assets + n;
      select count(*)::int into n from jsonb_array_elements(get_payables(o.organization_id, true)) e
       where (e->>'due_date') is not null and (e->>'due_date')::date <= p_day + 3;
      v_pay := v_pay + n;
    end if;
    if has_perm(o.organization_id, 'sales', 'view') then
      select count(*)::int into n from jsonb_array_elements(get_receivables(o.organization_id, true)) e
       where (e->>'due_date') is not null and (e->>'due_date')::date <= p_day + 3;
      v_rec := v_rec + n;
    end if;
    if has_org_role(o.organization_id, array['owner', 'manager']::member_role[]) then
      select count(*)::int into n from org_licenses l
       where l.organization_id = o.organization_id and l.expires_date is not null and (l.expires_date - p_day) in (30, 14, 7, 3, 1, 0);
      v_lic := v_lic + n;
    end if;
  end loop;
  j := jsonb_build_object('tasks', jsonb_build_object('crop', t_crop, 'livestock', t_live, 'aquatic', t_aq, 'other', t_other),
                          'vaccine', v_vac, 'milestones', v_ms, 'assets', v_assets, 'payables', v_pay, 'receivables', v_rec, 'licenses', v_lic);
  return j;
end $$;
revoke execute on function morning_digest_counts(uuid, date) from public, anon, authenticated;

-- Chọn những người cần gửi hôm nay: đã bật thông báo (có thiết bị), không tắt bản tin sáng, không đang trong giờ im lặng, chưa gửi hôm nay, có việc để nhắc.
-- Ghi nhận "đã gửi" ngay lúc chọn để chạy lại không gửi trùng.
create or replace function claim_morning_digests(p_day date default null) returns table (user_id uuid, counts jsonb)
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, vn_today()); u record; c jsonb; total int; now_t time := (now() at time zone 'Asia/Ho_Chi_Minh')::time; quiet boolean;
begin
  for u in
    select distinct s.user_id uid, coalesce(p.quiet_from, '21:00'::time) qf, coalesce(p.quiet_to, '06:00'::time) qt
      from push_subscriptions s left join notification_prefs p on p.user_id = s.user_id
     where coalesce(p.morning_digest, true)
       and not exists (select 1 from push_digest_log l where l.user_id = s.user_id and l.day = d)
  loop
    quiet := case when u.qf = u.qt then false when u.qf > u.qt then (now_t >= u.qf or now_t < u.qt) else (now_t >= u.qf and now_t < u.qt) end;
    if quiet then continue; end if;
    c := morning_digest_counts(u.uid, d);
    total := (c->'tasks'->>'crop')::int + (c->'tasks'->>'livestock')::int + (c->'tasks'->>'aquatic')::int + (c->'tasks'->>'other')::int
           + (c->>'vaccine')::int + (c->>'milestones')::int + (c->>'assets')::int + (c->>'payables')::int + (c->>'receivables')::int + (c->>'licenses')::int;
    if total = 0 then continue; end if;
    insert into push_digest_log (user_id, day, counts) values (u.uid, d, c) on conflict do nothing;
    if found then user_id := u.uid; counts := c; return next; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
revoke execute on function claim_morning_digests(date) from public, anon, authenticated;
grant execute on function claim_morning_digests(date) to service_role;
