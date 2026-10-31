
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingGate from './components/landing/LandingGate';
import './styles/stlTheme.css'; // --stl-* colour tokens (landing + TV mode); mapped to Tailwind in index.html
import './styles/stlShared.css'; // font stacks, paper page shell, gold pill (landing, member pages, TV headings)
import { startLeaderSettingsSync } from './services/leaderSettings';
import { startSyncLifecycle } from './services/syncLifecycle';
import { removeObsoleteAIStorageKeys } from './services/obsoleteStorageKeys';
import { startFunnelSignInWatch } from './components/stats/funnelSignIn';
import { takeOverRoot } from './utils/mountRoot';

// The removed multi-provider AI left API keys and toggles in this browser; nothing reads them (ADR-0007).
removeObsoleteAIStorageKeys();

// A signed-in leader's settings follow them across devices (ADR-0005); no-op signed out / unconfigured.
startLeaderSettingsSync();
// One Google login for every page: any sign-in syncs the personal app's data; sign-out stops (ADR-0010).
startSyncLifecycle();
// A sign-in started on the sign-in card counts once as finished when its session appears (anonymous funnel, ADR-0025).
startFunnelSignInWatch();

// #root holds the prerendered homepage fallback; clear it so React never mounts beside it.
const rootElement = takeOverRoot();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LandingGate app={<App />} />
  </React.StrictMode>
);
