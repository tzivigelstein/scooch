import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App.tsx';
import { showFocusMovedByKeys } from './hooks/keyboardFocus.ts';
import { showBootFailure } from './services/bootFailure.ts';
import { followLanguage } from './services/language.ts';
import { followTheme } from './services/theme.ts';
import { settleSavings } from './state/savings.ts';

followTheme();
settleSavings();
showFocusMovedByKeys();

// Everything the app says comes from the language's texts: it renders once
// they are here. If they never arrive, or the app fails while it is still
// starting (the loading screen is up), the page says so.
void followLanguage().ready.then(
  () =>
    createRoot(document.getElementById('root')!, {
      onUncaughtError: (error) => {
        reportError(error);
        if (document.querySelector('.boot')) showBootFailure();
      },
    }).render(
      <StrictMode>
        <App />
      </StrictMode>
    ),
  (error: unknown) => {
    console.error('The texts could not be loaded.', error);
    showBootFailure();
  }
);
