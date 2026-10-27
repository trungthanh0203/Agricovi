-- Hàm trigger không được để khách (anon) hay người dùng gọi trực tiếp: thu hồi quyền EXECUTE mặc định của PUBLIC trên mọi hàm trigger.
-- Trigger vẫn chạy bình thường (kiểm tra quyền EXECUTE chỉ xảy ra lúc tạo trigger). Test: supabase/tests/anon_surface.test.mjs.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;
