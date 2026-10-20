import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createCycle, fetchQuotaContexts, type QuotaContext } from '../lib/production';

export function CreateCycleScreen({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { active } = useOrgs();
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const allCrops = useLiveQuery(() => db.cropTypes.toArray(), [], []);
  // cây dùng chung hoặc do chính cơ sở đang chọn khai báo
  const cropTypes = allCrops.filter((c) => !c.organization_id || c.organization_id === active?.id);

  const myAreas = areas.filter((a) => a.organization_id === active?.id);
  const [areaId, setAreaId] = useState('');
  const [cropId, setCropId] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(todayLocal());
  const [contexts, setContexts] = useState<QuotaContext[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!areaId && myAreas[0]) setAreaId(myAreas[0].id);
  }, [myAreas, areaId]);
  useEffect(() => {
    if (!cropId && cropTypes[0]) setCropId(cropTypes[0].id);
  }, [cropTypes, cropId]);

  // Hộ: chọn ghi theo hộ riêng hoặc theo HTX đang tham gia (v1.2 mục 4.1). HTX: luôn ghi theo HTX.
  useEffect(() => {
    if (!active) return;
    setOwnerId(active.id);
    if (!navigator.onLine) return setContexts(null);
    if (active.type === 'household') {
      fetchQuotaContexts(active.id).then(setContexts).catch(() => setContexts(null));
    }
  }, [active]);

  if (!active) return null;
  const choices = contexts && contexts.length > 1 ? contexts : null;
  const chosen = contexts?.find((c) => c.org_id === ownerId) ?? null;
  const ownerLabel = (c: QuotaContext) => (c.kind === 'own' ? `Hộ riêng (${c.org_name})` : `HTX ${c.org_name}`);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!areaId) return setError('Hãy chọn khu trồng. Nếu chưa có, quay lại và thêm khu trồng trước.');
    if (!cropId) return setError('Hãy chọn loại cây.');
    // Báo sớm khi biết chắc đã hết hạn mức; máy chủ vẫn là nơi kiểm tra cuối cùng
    if (startNow && chosen && (!chosen.is_current || (chosen.max_cycles !== null && chosen.used_cycles >= chosen.max_cycles))) {
      return setError(
        chosen.is_current
          ? `Đã dùng ${chosen.used_cycles}/${chosen.max_cycles} vụ của gói. Kết thúc một vụ, nâng gói, hoặc chọn "Chưa bắt đầu" để lưu ở trạng thái Chuẩn bị.`
          : 'Gói đã hết hạn nên chưa tạo được vụ đang sản xuất. Hãy gia hạn, hoặc chọn "Chưa bắt đầu".',
      );
    }
    setBusy(true);
    try {
      await createCycle({
        ownerOrgId: ownerId || active!.id,
        areaId,
        cropTypeId: cropId,
        status: startNow ? 'active' : 'preparing',
        startDate: startDate || null,
      });
      onDone();
    } catch (err) {
      setError(friendlyError(err)); // gồm cả lỗi vượt hạn mức từ máy chủ
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>Tạo vụ mới</h1>
      <p className="muted">Cơ sở: {active.name}</p>

      {myAreas.length === 0 ? (
        <>
          <p className="msg warn">Cơ sở chưa có khu trồng. Hãy thêm khu trồng ở màn hình Sản xuất trước.</p>
          <button className="secondary" onClick={onCancel}>Quay lại</button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <label>
            Khu trồng
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {myAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label>
            Loại cây
            <select value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {cropTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          {choices && (
            <fieldset>
              <legend>Vụ này ghi theo</legend>
              {choices.map((c) => (
                <label key={c.org_id} className={ownerId === c.org_id ? 'choice selected' : 'choice'}>
                  <input type="radio" name="owner" checked={ownerId === c.org_id} onChange={() => setOwnerId(c.org_id)} />
                  <span>
                    <strong>{ownerLabel(c)}</strong>
                    <small>
                      Đã dùng {c.used_cycles}/{c.max_cycles ?? '—'} vụ{c.plan_name ? ` · ${c.plan_name}` : ''}
                      {!c.is_current && ' · Gói đã hết hạn'}
                    </small>
                  </span>
                </label>
              ))}
              <small className="muted">
                Vụ ghi theo HTX thì HTX xem được theo quyền. Vụ ghi theo hộ riêng chỉ mình bạn xem.
              </small>
            </fieldset>
          )}
          {!online && <p className="msg warn">Đang offline. Tạo vụ cần có mạng để máy chủ kiểm hạn mức; hãy kết nối mạng rồi bấm Tạo vụ.</p>}

          <fieldset>
            <legend>Trạng thái</legend>
            <label className={startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={startNow} onChange={() => setStartNow(true)} />
              <span><strong>Bắt đầu sản xuất ngay</strong><small>Tính vào số vụ của gói.</small></span>
            </label>
            <label className={!startNow ? 'choice selected' : 'choice'}>
              <input type="radio" name="start" checked={!startNow} onChange={() => setStartNow(false)} />
              <span><strong>Chưa bắt đầu (Chuẩn bị)</strong><small>Không tính vào số vụ của gói.</small></span>
            </label>
          </fieldset>

          <label>
            Ngày bắt đầu
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          {error && <p className="msg error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={!online || busy}>{busy ? 'Đang tạo…' : 'Tạo vụ'}</button>
          <button type="button" className="link" onClick={onCancel}>Hủy</button>
        </form>
      )}
    </main>
  );
}
