-- D200: BẢNG CHẤM CÔNG GIẤY, lớp A: nhập số liệu theo bảng đã in (docs/PLAN_BANG_CHAM_CONG_GIAY.md).
-- App chỉ gửi mã bảng và các ô đã điền (người, ngày, loại ô); MÁY CHỦ tự suy ra giờ từ cấu hình của bảng (ca mặc định, nghỉ giữa ca, kiểu ghi)
-- nên giờ luôn khớp ca đã in. Ô công tạo ca làm (attendance_records), ô P/Ô/V/K tạo ghi nghỉ (worker_absences).
-- Mỗi ô có MÃ XÁC ĐỊNH từ (bảng, người, ngày) nên gửi lặp không nhân đôi. Ô không ghi được thì bỏ qua và báo lý do (không làm hỏng cả lô).
-- Quyền như Ghi công: chủ nhập thì công xác nhận luôn; quản lý/tổ trưởng nhập thì chờ xác nhận. Kỳ lương đã khóa: trigger hiện có chặn từng ô.

-- Người được dùng bảng: chủ/quản lý của cơ sở hoặc người đã tạo bảng
create or replace function timesheet_guard(p_sheet uuid) returns timesheet_sheets
language plpgsql stable security definer set search_path = public as $$
declare sh timesheet_sheets;
begin
  select * into sh from timesheet_sheets where id = p_sheet;
  if sh.id is null then raise exception 'NOT_FOUND: Không tìm thấy bảng.'; end if;
  if auth.uid() is null or not (is_workforce_admin(sh.organization_id) or sh.created_by = auth.uid()) then
    raise exception 'FORBIDDEN: Bạn không có quyền với bảng này.';
  end if;
  return sh;
end $$;
revoke execute on function timesheet_guard(uuid) from public, anon;

-- Lưu các ô. p_cells = [{w: mã người, d: ngày, k: 'full'|'half'|'hours'|'P'|'O'|'V'|'K', h: số giờ (khi k = 'hours')}]
-- Trả {saved, unchanged, skipped: [{w, d, reason}]}
create or replace function record_timesheet(p_sheet uuid, p_cells jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sh timesheet_sheets; c jsonb; v_w uuid; v_d date; v_k text; v_h numeric; v_admin boolean; v_owner boolean; v_isme boolean; v_lead boolean;
  v_full integer; v_net integer; v_brk integer; v_start timestamptz; v_end timestamptz; v_id uuid; v_ex attendance_records; v_abs worker_absences;
  v_akind text; v_notice text; v_paid boolean;
  v_saved integer := 0; v_unch integer := 0; v_skipped jsonb := '[]'::jsonb; v_reason text;
begin
  sh := timesheet_guard(p_sheet);
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) = 0 then raise exception 'INVALID_ARGUMENT: Chưa có ô nào để lưu.'; end if;
  if jsonb_array_length(p_cells) > 1000 then raise exception 'INVALID_ARGUMENT: Mỗi lần lưu tối đa 1000 ô.'; end if;
  v_admin := is_workforce_admin(sh.organization_id);
  v_owner := has_org_role(sh.organization_id, array['owner']::member_role[]);
  v_full := (extract(epoch from (sh.shift_end - sh.shift_start)) / 60)::integer;

  for c in select * from jsonb_array_elements(p_cells) loop
    v_reason := null;
    begin
      v_w := (c->>'w')::uuid; v_d := (c->>'d')::date; v_k := c->>'k'; v_h := nullif(c->>'h', '')::numeric;
      if v_k not in ('full', 'half', 'hours', 'P', 'O', 'V', 'K') then v_reason := 'Ký hiệu chưa đúng.';
      elsif v_d < sh.from_date or v_d > sh.to_date then v_reason := 'Ngày nằm ngoài kỳ của bảng.';
      elsif not (sh.workers @> jsonb_build_array(jsonb_build_object('worker_id', v_w))) then v_reason := 'Người này không có trong bảng.';
      else
        v_isme := is_worker_self(v_w);
        v_lead := is_team_leader_of(v_w) and not v_isme;
        if not (v_admin or v_lead) then v_reason := 'Bạn không có quyền nhập cho người này.'; end if;
      end if;

      if v_reason is null and v_k in ('full', 'half', 'hours') then
        -- ---- ô công: ca làm ----
        v_start := (v_d + sh.shift_start) at time zone 'Asia/Ho_Chi_Minh';
        if v_k = 'full' then
          v_net := greatest(0, v_full - sh.break_minutes); v_brk := sh.break_minutes;
        elsif v_k = 'half' then
          v_net := round(greatest(0, v_full - sh.break_minutes) / 2.0)::integer; v_brk := 0;
        else
          if v_h is null or v_h <= 0 or v_h > 16 then v_reason := 'Số giờ phải lớn hơn 0 và không quá 16.';
          else v_net := round(v_h * 60)::integer; v_brk := case when v_net >= 360 then sh.break_minutes else 0 end; end if;
        end if;
        if v_reason is null and v_net <= 0 then v_reason := 'Ca mặc định không còn thời gian làm sau khi trừ nghỉ giữa ca.'; end if;
        if v_reason is null then
          v_end := v_start + make_interval(mins => v_net + v_brk);
          v_id := md5('ts:' || sh.id::text || v_w::text || v_d::text)::uuid;
          select * into v_ex from attendance_records where id = v_id;
          if v_ex.id is not null then
            if coalesce(v_ex.declared_minutes, -1) = v_net then v_unch := v_unch + 1;
            else v_reason := 'Đã nhập trước đó với giá trị khác. Muốn sửa hãy dùng Bảng công (Đề nghị sửa giờ).'; end if;
          elsif exists (select 1 from worker_absences a where a.worker_id = v_w and a.status = 'active' and a.from_date <= v_d and a.to_date >= v_d) then
            v_reason := 'Đã có ghi nghỉ ngày này.';
          elsif exists (select 1 from attendance_records a where a.worker_id = v_w and a.status <> 'rejected' and a.started_at < v_end and (a.ended_at is null or a.ended_at > v_start)) then
            v_reason := 'Đã có công trùng giờ ngày này.';
          else
            insert into attendance_records (id, worker_id, work_date, started_at, ended_at, break_minutes, source, device_recorded_at, note, entered_late,
                                            status, approved_minutes, confirmed_by, confirmed_at)
            values (v_id, v_w, v_d, v_start, v_end, v_brk, case when v_admin then 'admin'::attendance_source else 'team_leader'::attendance_source end, now(),
                    'Bảng ' || sh.code, true,
                    case when v_owner then 'confirmed'::attendance_status else 'needs_confirmation'::attendance_status end,
                    case when v_owner then v_net end, case when v_owner then auth.uid() end, case when v_owner then now() end);
            v_saved := v_saved + 1;
          end if;
        end if;
      elsif v_reason is null then
        -- ---- ô nghỉ: P phép năm, Ô ốm, V việc gia đình, K không lương/không báo trước ----
        v_akind := case v_k when 'P' then 'annual' when 'O' then 'sick' when 'V' then 'family' else 'no_notice' end;
        v_notice := case when v_k = 'K' then 'none' else 'after' end;
        v_paid := v_k <> 'K';
        v_id := md5('tsa:' || sh.id::text || v_w::text || v_d::text)::uuid;
        select * into v_abs from worker_absences where id = v_id;
        if v_abs.id is not null then
          if v_abs.status = 'active' and v_abs.kind = v_akind then v_unch := v_unch + 1;
          else v_reason := 'Đã nhập trước đó với giá trị khác. Muốn sửa hãy dùng tab Nghỉ phép.'; end if;
        elsif exists (select 1 from worker_absences a where a.worker_id = v_w and a.status = 'active' and a.from_date <= v_d and a.to_date >= v_d) then
          v_reason := 'Đã có ghi nghỉ ngày này.';
        elsif exists (select 1 from attendance_records a where a.worker_id = v_w and a.status <> 'rejected' and a.work_date = v_d) then
          v_reason := 'Đã có công ngày này.';
        else
          insert into worker_absences (id, organization_id, worker_id, from_date, to_date, half_day, kind, notice, channel, reason, paid, note)
          values (v_id, sh.organization_id, v_w, v_d, v_d, false, v_akind, v_notice, 'other', 'Ghi từ bảng giấy ' || sh.code, v_paid, 'Bảng ' || sh.code);
          v_saved := v_saved + 1;
        end if;
      end if;
    exception when others then
      v_reason := regexp_replace(sqlerrm, '^[A-Z_]+: ', '');
    end;
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('w', c->>'w', 'd', c->>'d', 'reason', v_reason));
    end if;
  end loop;

  if v_saved > 0 then
    insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
    values (sh.organization_id, auth.uid(), 'record_timesheet', 'timesheet_sheet', sh.id::text, jsonb_build_object('code', sh.code, 'saved', v_saved));
  end if;
  return jsonb_build_object('saved', v_saved, 'unchanged', v_unch, 'skipped', v_skipped);
end $$;

-- Những ô của bảng ĐÃ có dữ liệu (để app khóa ô và hiện nhãn): công làm việc và ghi nghỉ của các người/ngày trong bảng.
-- Trả {work: [{w, d, minutes, status, mine}], absences: [{w, d, kind, mine}]}; mine = do chính bảng này tạo ra
create or replace function timesheet_existing(p_sheet uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sh timesheet_sheets; v_ids uuid[]; v_work jsonb; v_abs jsonb;
begin
  sh := timesheet_guard(p_sheet);
  select array_agg((e->>'worker_id')::uuid) into v_ids from jsonb_array_elements(sh.workers) e;
  select coalesce(jsonb_agg(jsonb_build_object('w', t.worker_id, 'd', t.work_date, 'minutes', t.mins, 'status', t.status, 'mine', t.mine)), '[]'::jsonb) into v_work
    from (select a.worker_id, a.work_date,
                 sum(case when a.status = 'confirmed' then coalesce(a.approved_minutes, 0) else coalesce(a.declared_minutes, 0) end)::integer mins,
                 min(a.status::text) status,
                 bool_or(a.id = md5('ts:' || sh.id::text || a.worker_id::text || a.work_date::text)::uuid) mine
            from attendance_records a
           where a.worker_id = any (v_ids) and a.work_date between sh.from_date and sh.to_date and a.status <> 'rejected'
           group by a.worker_id, a.work_date) t;
  select coalesce(jsonb_agg(jsonb_build_object('w', x.worker_id, 'd', x.d, 'kind', x.kind,
           'mine', x.id = md5('tsa:' || sh.id::text || x.worker_id::text || x.d::text)::uuid)), '[]'::jsonb) into v_abs
    from (select a.id, a.worker_id, a.kind, d::date d
            from worker_absences a
            cross join lateral generate_series(greatest(a.from_date, sh.from_date), least(a.to_date, sh.to_date), interval '1 day') d
           where a.worker_id = any (v_ids) and a.status = 'active' and a.from_date <= sh.to_date and a.to_date >= sh.from_date) x;
  return jsonb_build_object('work', v_work, 'absences', v_abs);
end $$;

revoke execute on function record_timesheet(uuid, jsonb), timesheet_existing(uuid) from public, anon;
grant execute on function record_timesheet(uuid, jsonb), timesheet_existing(uuid) to authenticated;
