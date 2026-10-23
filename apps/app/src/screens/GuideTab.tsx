import { pickSection, SubTabs } from '../components/SubTabs';
import { GUIDES, type GuideId } from '../lib/guideContent';
import { shareSystem } from '../lib/shareApp';
import { useState } from 'react';
import type { TabId } from '../lib/tabs';

/**
 * Tab Hướng dẫn sử dụng: menu 4 mục (Giới thiệu, Hộ, HTX, Công ty). Mỗi hướng dẫn là danh sách bước đánh số;
 * bấm một bước thì mở chi tiết bên dưới kèm nút nhảy tới đúng màn. Nội dung ở lib/guideContent.ts.
 */
export function GuideTab({ section, onSection, onGo }: { section?: string; onSection: (s: GuideId) => void; onGo: (t: TabId, section?: string) => void }) {
  const items = GUIDES.map((g) => ({ id: g.id, label: g.label }));
  const current = pickSection(items, section);
  const guide = GUIDES.find((g) => g.id === current);
  const [note, setNote] = useState('');

  return (
    <section>
      <h1>Hướng dẫn sử dụng</h1>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as GuideId)} label="Hướng dẫn" />
      {current === null && (
        <div className="card">
          <p className="muted">Chọn một mục để xem. Mỗi hướng dẫn chia thành các bước đánh số; bấm vào bước để xem chi tiết.</p>
          <button type="button" className="secondary" onClick={() => void shareSystem().then((m) => setNote(m))}>Chia sẻ hệ thống cho người khác</button>
          {note && <p className="muted" role="status">{note}</p>}
        </div>
      )}
      {guide && (
        <>
          <p className="guide-intro">{guide.intro}</p>
          <ol className="guide-steps">
            {guide.steps.map((s, i) => (
              <li key={s.title}>
                <details className="guide-step">
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
