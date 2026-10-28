import { useEffect } from 'react';

/**
 * Mỗi khi người dùng bấm Sửa / Thêm mới và một form nhập liệu hiện ra (form `.inline-form` mới xuất hiện, hoặc mục "＋ Thêm …" được mở),
 * tự cuộn tới form để người dùng thao tác ngay, không phải tìm ở trên hay dưới. Chỉ cuộn khi form xuất hiện NGAY SAU một lần bấm (trong vòng 1 giây),
 * nên không cuộn khi đang gõ hay khi dữ liệu tải xong. Dùng một lần ở gốc ứng dụng.
 */
export function useAutoScrollToForm(): void {
  useEffect(() => {
    let lastClick = 0;
    const onClick = () => { lastClick = Date.now(); };
    const recent = () => Date.now() - lastClick < 1000;
    const go = (el: Element) => {
      const target = el.closest('.card') ?? el.closest('details.fold') ?? el;
      const r = target.getBoundingClientRect();
      const inView = r.top >= 56 && r.top < window.innerHeight * 0.6; // đã nằm gọn ở nửa trên màn hình thì không cuộn
      if (!inView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const mo = new MutationObserver((records) => {
      if (!recent()) return;
      for (const rec of records) {
        for (const n of rec.addedNodes) {
          if (!(n instanceof Element)) continue;
          const form = n.matches('.inline-form') ? n : n.querySelector('.inline-form');
          if (form) { requestAnimationFrame(() => go(form)); return; }
        }
      }
    });
    const onToggle = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLDetailsElement && t.open && t.classList.contains('inline') && recent()) requestAnimationFrame(() => go(t));
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('toggle', onToggle, true);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('toggle', onToggle, true); mo.disconnect(); };
  }, []);
}
