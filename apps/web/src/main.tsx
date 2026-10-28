import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { PrivacyPage } from './PrivacyPage.tsx';
import './fonts.ts';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/privacy' ? <PrivacyPage /> : <App />}
  </StrictMode>,
);
