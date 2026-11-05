import { PROVINCES, type Addr } from '../lib/vnAddress';

/** Ba ô địa chỉ chuẩn: Tỉnh/thành phố (chọn), Xã/phường, Địa chỉ. Dùng chung cho mọi nơi nhập địa chỉ. */
export function AddressFields({ value, onChange, addressLabel = 'Địa chỉ', addressHint = 'Số nhà, đường, thôn/ấp…', maxAddress = 200 }: {
  value: Addr; onChange: (v: Addr) => void; addressLabel?: string; addressHint?: string; maxAddress?: number;
}) {
  const known = !value.province || PROVINCES.includes(value.province);
  return (
    <>
      <label>Tỉnh/thành phố
        <select value={value.province} onChange={(e) => onChange({ ...value, province: e.target.value })}>
          <option value="">— Chọn tỉnh/thành phố —</option>
          {!known && <option value={value.province}>{value.province}</option>}
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>Xã/phường<input value={value.ward} maxLength={80} autoComplete="address-level2" onChange={(e) => onChange({ ...value, ward: e.target.value })} /></label>
      <label>{addressLabel}<input value={value.address} maxLength={maxAddress} autoComplete="street-address" placeholder={addressHint} onChange={(e) => onChange({ ...value, address: e.target.value })} /></label>
    </>
  );
}
