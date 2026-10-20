import { db } from './db';

const LAST_USER_KEY = 'agriconnect.lastUser';

/**
 * Bản lưu để xem offline (khu trồng, vụ, nhật ký, kho, chi phí...) thuộc về người dùng đã đăng nhập trước.
 * Khi một tài khoản KHÁC đăng nhập trên cùng thiết bị thì xóa các bản lưu đó, để không lẫn dữ liệu giữa hai người
 * (hoặc dữ liệu cũ còn sót sau khi xóa hết dữ liệu trên máy chủ).
 * Hàng đợi gửi (outbox) được GIỮ NGUYÊN: đó là việc chưa gửi của người trước, không tự xóa âm thầm.
 */
export async function purgeCachesIfUserChanged(uid: string): Promise<boolean> {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_USER_KEY); } catch { /* bộ nhớ bị chặn */ }
  let purged = false;
  if (last && last !== uid) {
    await Promise.all([
      db.areas, db.cycles, db.logs, db.workTypes, db.cropTypes, db.units, db.materials, db.locations,
      db.balances, db.harvests, db.expenses, db.sales, db.summaries,
    ].map((t) => t.clear()));
    purged = true;
  }
  try { localStorage.setItem(LAST_USER_KEY, uid); } catch { /* bỏ qua */ }
  return purged;
}
