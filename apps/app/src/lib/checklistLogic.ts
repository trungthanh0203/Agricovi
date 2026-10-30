/**
 * Bảng kiểm nội bộ (D98, P1B), phần thuần. Quy tắc KHỚP hàm checklist_summary_of ở CSDL (test đối chiếu trong checklists.test.mjs):
 * "không áp dụng" bị loại khỏi mẫu số; chưa trả lời hết thì chưa kết luận; đạt khi tỉ lệ A >= ngưỡng A và tỉ lệ B >= ngưỡng B.
 * Mức A/B và ngưỡng là dữ liệu của bộ bảng kiểm (sửa được), không cài cứng ở đây.
 */
export type ChecklistResult = 'pass' | 'fail' | 'na';
export interface ChecklistAnswerLite { level: 'A' | 'B'; result: ChecklistResult | null }
export interface ChecklistSummary {
  a_total: number; a_pass: number; b_total: number; b_pass: number; na: number; unanswered: number;
  a_pct: number; b_pct: number; verdict: 'pass' | 'fail' | 'incomplete';
}

export function checklistSummary(answers: ChecklistAnswerLite[], passA: number, passB: number): ChecklistSummary {
  const count = (f: (a: ChecklistAnswerLite) => boolean) => answers.filter(f).length;
  const a_total = count((a) => a.level === 'A' && (a.result === 'pass' || a.result === 'fail'));
  const a_pass = count((a) => a.level === 'A' && a.result === 'pass');
  const b_total = count((a) => a.level === 'B' && (a.result === 'pass' || a.result === 'fail'));
  const b_pass = count((a) => a.level === 'B' && a.result === 'pass');
  const unanswered = count((a) => a.result === null);
  const a_pct = a_total === 0 ? 100 : (a_pass * 100) / a_total;
  const b_pct = b_total === 0 ? 100 : (b_pass * 100) / b_total;
  return {
    a_total, a_pass, b_total, b_pass, na: count((a) => a.result === 'na'), unanswered,
    a_pct: Math.round(a_pct * 10) / 10, b_pct: Math.round(b_pct * 10) / 10,
    verdict: unanswered > 0 ? 'incomplete' : a_pct >= passA && b_pct >= passB ? 'pass' : 'fail',
  };
}

export const VERDICT_LABEL: Record<ChecklistSummary['verdict'], string> = { pass: 'Đạt', fail: 'Không đạt', incomplete: 'Chưa xong' };
export const RESULT_LABEL: Record<ChecklistResult, string> = { pass: 'Đạt', fail: 'Không đạt', na: 'Không áp dụng' };
