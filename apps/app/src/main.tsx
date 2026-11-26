import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { App } from './App';
import { initI18n } from './lib/i18n';
import { captureRefFromUrl } from './lib/referral';
import './styles.css';

captureRefFromUrl();

// Nạp gói ngôn ngữ trước rồi mới vẽ app
void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
