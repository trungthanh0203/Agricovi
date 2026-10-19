export function SetupNotice() {
  return (
    <main className="auth">
      <h1>AgriConnect</h1>
      <p className="msg warn" role="alert">
        Ứng dụng chưa được nối với máy chủ Supabase.
      </p>
      <p>Người cài đặt cần tạo file <code>apps/app/.env.local</code> với hai giá trị:</p>
      <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<khóa anon>`}</pre>
      <p className="muted">Xem hướng dẫn đầy đủ trong <code>docs/SETUP_SUPABASE.md</code>.</p>
    </main>
  );
}
