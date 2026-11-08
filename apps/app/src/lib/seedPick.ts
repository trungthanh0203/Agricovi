import { supabase } from './supabase';

/** Chọn giống từ danh mục vật tư và nhà cung cấp của giống đó khi tạo/sửa vụ (D159). Chỉ đọc/ghi qua hàm máy chủ có kiểm quyền. */
export interface MaterialSupplier { partner_id: string; name: string; phone: string | null; purchases: number; last_date: string | null }

/** Giá trị ghi vào "nguồn giống" khi người dùng tự để giống, không mua của ai */
export const SELF_SEED = 'Tự để giống / không có nhà cung cấp';

/** Các nhà cung cấp đã bán vật tư này (theo hóa đơn mua) hoặc đã được chọn cho vật tư này trước đây */
export async function loadMaterialSuppliers(orgId: string, materialId: string): Promise<MaterialSupplier[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_material_suppliers', { p_org: orgId, p_material: materialId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MaterialSupplier[]).map((s) => ({ ...s, purchases: Number(s.purchases) }));
}

/** Nhớ "vật tư này mua của nhà cung cấp kia" cho lần sau; làm lặng lẽ, lỗi không báo vì chỉ là tiện ích */
export async function linkMaterialSupplier(orgId: string, materialId: string, partnerId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('link_material_supplier', { p_org: orgId, p_material: materialId, p_partner: partnerId }).then(() => undefined, () => undefined);
}
