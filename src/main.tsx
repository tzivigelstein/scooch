import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App.tsx';
import { followTheme } from './services/theme.ts';
import { settleSavings } from './state/savings.ts';

followTheme();
settleSavings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
