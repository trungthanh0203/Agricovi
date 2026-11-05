/**
 * Địa chỉ chuẩn của app: 3 mục Tỉnh/thành phố · Xã/phường · Địa chỉ (số nhà, đường, thôn/ấp…).
 * Việt Nam tổ chức 2 cấp hành chính (không còn quận/huyện), nên chỉ có 2 cấp tỉnh và xã.
 */
export { PROVINCES } from '@agriconnect/shared';

export interface Addr { province: string; ward: string; address: string }
export const EMPTY_ADDR: Addr = { province: '', ward: '', address: '' };

/** Ghép thành một dòng để hiển thị: địa chỉ, xã/phường, tỉnh/thành */
export const formatAddr = (a: { province?: string | null; ward?: string | null; address?: string | null }): string =>
  [a.address, a.ward, a.province].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
