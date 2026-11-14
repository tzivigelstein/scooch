import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App.tsx';
import { followLanguage } from './services/language.ts';
import { followTheme } from './services/theme.ts';
import { settleSavings } from './state/savings.ts';

followTheme();
settleSavings();

// Everything the app says comes from the language's texts: it renders once they are here.
void followLanguage().ready.then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
);
