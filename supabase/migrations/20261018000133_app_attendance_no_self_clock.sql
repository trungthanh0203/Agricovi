-- Bỏ chấm công Vào/Ra ca bằng tài khoản đăng nhập (D117). Công chỉ do: (1) máy chấm công (số điện thoại + PIN + ảnh), hoặc
-- (2) chủ/quản lý (và tổ trưởng với người trong tổ) nhập ở "Chấm công cho người làm", gồm cả công của chính chủ/quản lý.
-- Lý do: bấm bằng tài khoản không có ảnh/đối chiếu, dễ đưa mật khẩu cho người khác chấm hộ.

create or replace function clock_in(p_id uuid, p_org uuid, p_cycle uuid default null,
                                    p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
returns attendance_records
language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'DISABLED: Không còn chấm công bằng tài khoản đăng nhập. Hãy chấm công ở máy chấm công, hoặc nhờ chủ/quản lý nhập ở mục "Chấm công cho người làm".';
end $$;

create or replace function clock_out(p_id uuid, p_break integer default 0, p_lat double precision default null, p_lng double precision default null,
                                     p_acc double precision default null, p_cycle uuid default null)
returns attendance_records
language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'DISABLED: Không còn chấm công bằng tài khoản đăng nhập. Hãy chấm công ở máy chấm công, hoặc nhờ chủ/quản lý nhập ở mục "Chấm công cho người làm".';
end $$;

-- Người làm không tự thêm/sửa công của mình (kể cả gửi trực tiếp bản ghi): chỉ tổ trưởng (người trong tổ) và chủ/quản lý
drop policy att_insert on attendance_records;
create policy att_insert on attendance_records for insert to authenticated
  with check (
    (source = 'team_leader' and is_team_leader_of(worker_id) and not is_worker_self(worker_id))
    or (source = 'admin' and is_workforce_admin(worker_org(worker_id))));

drop policy att_update on attendance_records;
create policy att_update on attendance_records for update to authenticated
  using ((is_team_leader_of(worker_id) and not is_worker_self(worker_id)) or is_workforce_admin(organization_id))
  with check ((is_team_leader_of(worker_id) and not is_worker_self(worker_id)) or is_workforce_admin(organization_id));
