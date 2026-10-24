import { useEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Ô nhập nhiều dòng tự cao vừa nội dung (không cuộn trong ô), rộng bằng khung. Dùng cho tên/mô tả dài trên điện thoại. */
export function AutoTextarea({ value, onChange, maxLength, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string; onChange: (v: string) => void; maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))} {...rest} />;
}
