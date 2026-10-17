import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/noto-sans-kannada/400.css';
import '@fontsource/noto-sans-kannada/500.css';
import '@fontsource/noto-sans-kannada/600.css';
import '@fontsource/noto-sans-kannada/700.css';
import '@fontsource/noto-serif-kannada/500.css';
import '@fontsource/noto-serif-kannada/600.css';
import '@fontsource/noto-serif-kannada/700.css';
import '@fontsource/noto-serif-kannada/800.css';
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
