import { useState } from 'react';
import { GuideFlow } from '../components/GuideFlow';
import { pickSection, SubTabs } from '../components/SubTabs';
import { GUIDES, type GuideId } from '../lib/guideContent';
import { shareSystem } from '../lib/shareApp';
import type { TabId } from '../lib/tabs';

/**
 * Tab Hướng dẫn sử dụng: menu 9 mục (Giới thiệu, Trồng cây, Vật nuôi, HTX, Nhân sự, Khai báo, Quy trình, Kho, Website; Công ty tạm ẩn). Mỗi hướng dẫn mở đầu bằng SƠ ĐỒ các chặng (bấm ô để nhảy tới bước),
 * rồi danh sách bước đánh số; bấm một bước thì mở chi tiết bên dưới kèm nút nhảy tới đúng màn. Nội dung ở lib/guideContent.ts.
 */
export function GuideTab({ section, onSection, onGo }: { section?: string; onSection: (s: GuideId) => void; onGo: (t: TabId, section?: string) => void }) {
  const items = GUIDES.map((g) => ({ id: g.id, label: g.label }));
  const current = pickSection(items, section);
  const guide = GUIDES.find((g) => g.id === current);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const pick = (i: number) => {
    setOpen(i);
    window.setTimeout(() => document.getElementById(`guide-step-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <section>
      <h1>Hướng dẫn sử dụng</h1>
      <SubTabs items={items} value={current} onChange={(s) => { setOpen(null); onSection(s); }} onBack={() => onSection('' as GuideId)} label="Hướng dẫn" />
      {current === null && (
        <div className="card">
          <p className="muted">Chọn một mục để xem. Mỗi hướng dẫn có sơ đồ tổng quát ở đầu, rồi các bước đánh số; bấm vào bước để xem chi tiết.</p>
          <button type="button" className="secondary" onClick={() => void shareSystem().then((m) => setNote(m))}>Chia sẻ hệ thống cho người khác</button>
          {note && <p className="muted" role="status">{note}</p>}
        </div>
      )}
      {guide && (
        <>
          <p className="guide-intro">{guide.intro}</p>
          <h2 className="sect">Sơ đồ tổng quát</h2>
          <GuideFlow phases={guide.flow} onPick={pick} />
          <h2 className="sect">Chi tiết từng bước</h2>
          <ol className="guide-steps">
            {guide.steps.map((s, i) => (
              <li key={s.title} id={`guide-step-${i}`}>
                <details className="guide-step" open={open === i} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((cur) => (o ? i : cur === i ? null : cur)); }}>
                  <summary>
                    <span className="guide-num" aria-hidden>{i + 1}</span>
                    <span className="guide-title">{s.title}</span>
                    <span className="menu-go" aria-hidden>›</span>
                  </summary>
                  <div className="guide-body">
                    <ul>{s.details.map((d) => <li key={d}>{d}</li>)}</ul>
                    {s.tip && <p className="guide-tip">💡 {s.tip}</p>}
                    {s.go && <button type="button" className="secondary" onClick={() => onGo(s.go!.tab, s.go!.section)}>{s.go.label}</button>}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
