import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { MncApp } from './ui/MncApp';
import './ui/styles.css';

// Two tasks ship from one build. The foraging study stays the default so an
// existing link cannot land a participant in the pilot by accident; the pilot
// is reached only by asking for it.
const isMnc = new URLSearchParams(window.location.search).get('task') === 'mnc';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMnc ? <MncApp /> : <App />}</StrictMode>,
);
