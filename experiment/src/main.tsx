import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { MncApp } from './ui/MncApp';
import { OperatorApp } from './ui/OperatorApp';
import './ui/styles.css';

// Several procedures ship from one build. The original foraging study stays
// the default so an existing link cannot land a participant somewhere new by
// accident; the others are reached only by asking for them.
const task = new URLSearchParams(window.location.search).get('task');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {task === 'operator' ? <OperatorApp />
      : task === 'mnc' ? <MncApp />
      : <App />}
  </StrictMode>,
);
