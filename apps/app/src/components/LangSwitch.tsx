import { getLang, type Lang } from '../lib/format';
import { setLang, showLangSwitch } from '../lib/i18n';

// Tên ngôn ngữ luôn viết bằng chính ngôn ngữ đó, không dịch
const OPTIONS: { id: Lang; label: string }[] = [{ id: 'vi', label: 'Tiếng Việt' }, { id: 'en', label: 'English' }];

export function LangSwitch() {
  if (!showLangSwitch()) return null;
  const cur = getLang();
  return (
    <div className="chips" role="group" aria-label="Ngôn ngữ / Language">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" lang={o.id} aria-pressed={cur === o.id} className={cur === o.id ? 'chip active' : 'chip'}
          onClick={() => { if (cur !== o.id && window.confirm('App sẽ tải lại để đổi ngôn ngữ.\nThe app will reload to change the language.')) setLang(o.id); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
