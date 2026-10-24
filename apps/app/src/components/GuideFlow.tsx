import { Fragment } from 'react';
import type { FlowPhase } from '../lib/guideContent';

/**
 * Sơ đồ hướng dẫn: các chặng xếp từ trên xuống (mũi tên ▼ giữa các chặng), trong chặng các ô nối bằng mũi tên →.
 * Bấm một ô để mở bước tương ứng bên dưới. Màu chỉ để phân nhóm; mọi ô đều có chữ.
 */
export function GuideFlow({ phases, onPick }: { phases: FlowPhase[]; onPick: (step: number) => void }) {
  return (
    <div className="gflow" role="group" aria-label="Sơ đồ các bước">
      {phases.map((p, pi) => (
        <Fragment key={p.title}>
          {pi > 0 && <div className="gflow-down" aria-hidden>▼</div>}
          <div className={`gflow-phase ${p.tone}`}>
            <div className="gflow-title">{p.title}</div>
            <div className="gflow-nodes">
              {p.nodes.map((n, ni) => (
                <Fragment key={n.label}>
                  {ni > 0 && <span className="gflow-arrow" aria-hidden>→</span>}
                  <button type="button" className="gflow-node" onClick={() => onPick(n.step)}>
                    <span className="gflow-ico" aria-hidden>{n.icon}</span>
                    <span>{n.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
