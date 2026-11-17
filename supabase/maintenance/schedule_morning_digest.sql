-- Đặt lịch BẢN TIN SÁNG (H2 lát 2, D183–D184): MỖI GIỜ gọi hàm send-push; mỗi lần hàm chỉ gửi cho những người có giờ nhận (họ tự chọn ở app, mặc định 7 giờ) đúng bằng giờ hiện tại theo giờ Việt Nam.
-- Người dùng tự chạy MỘT LẦN trong Supabase → SQL Editor (Claude không chạy). Cần đã làm đủ các bước 1–4 của docs/HUONG_DAN_BAT_THONG_BAO.md,
-- và đã bật hai tiện ích pg_cron, pg_net (Database → Extensions).
--
-- Thay 3 chỗ bên dưới: <MÃ_DỰ_ÁN> (đoạn đầu địa chỉ dự án: https://<MÃ_DỰ_ÁN>.supabase.co), <ANON_KEY> (khóa "anon public" ở Project Settings → API),
-- <PUSH_CRON_SECRET> (đúng chuỗi đã đặt bằng `npx supabase secrets set PUSH_CRON_SECRET=...`).
-- Chạy lại script này để đổi giờ hoặc bí mật (lệnh đầu xóa lịch cũ nếu có).

select cron.unschedule('morning-digest') where exists (select 1 from cron.job where jobname = 'morning-digest');

select cron.schedule(
  'morning-digest',
  '0 * * * *',   -- đầu mỗi giờ
  $$
  select net.http_post(
    url := 'https://<MÃ_DỰ_ÁN>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>', 'x-cron-secret', '<PUSH_CRON_SECRET>'),
    body := '{"action":"digest"}'::jsonb
  );
  $$
);

-- Kiểm tra: select jobname, schedule, active from cron.job;
-- Gửi thử ngay (không đợi 7 giờ): chạy riêng lệnh net.http_post ở trên một lần; bản tin chỉ gửi cho người có việc cần nhắc, mỗi người một lần mỗi ngày.
-- Tắt: select cron.unschedule('morning-digest');
