import { missingEnv } from '../lib/supabase';

export function SetupNotice() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return (
    <main className="auth">
      <h1>AgriConnect</h1>
      <p className="msg warn" role="alert">
        Ứng dụng chưa được nối với máy chủ Supabase.
      </p>
      {missingEnv.length > 0 && (
        <p>Bản này đang thiếu: <code>{missingEnv.join(', ')}</code>.</p>
      )}
      {local ? (
        <>
          <p>Người cài đặt cần tạo file <code>apps/app/.env.local</code> với hai giá trị:</p>
          <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<khóa anon>`}</pre>
          <p className="muted">Xem hướng dẫn đầy đủ trong <code>docs/SETUP_SUPABASE.md</code>.</p>
        </>
      ) : (
        <>
          <p>
            Bản đã đưa lên mạng này được <strong>build mà không có</strong> hai biến trên. File <code>.env.local</code> trên máy
            không lên GitHub nên không có ở bước build. Người cài đặt cần khai hai biến cho bước build (hoặc dùng file
            <code> apps/app/.env.production</code>) rồi <strong>build lại</strong>.
          </p>
          <p className="muted">Xem mục "Biến môi trường" trong <code>docs/DEPLOY_CLOUDFLARE.md</code>.</p>
        </>
      )}
    </main>
  );
}
