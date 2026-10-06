
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingGate from './components/landing/LandingGate';
import './styles/stlTheme.css'; // --stl-* colour tokens (landing + TV mode); mapped to Tailwind in index.html
import './styles/stlShared.css'; // font stacks, paper page shell, gold pill (landing, member pages, TV headings)
import { startLeaderSettingsSync } from './services/leaderSettings';
import { startSyncLifecycle } from './services/syncLifecycle';
import { removeObsoleteAIStorageKeys } from './services/obsoleteStorageKeys';

// The removed multi-provider AI left API keys and toggles in this browser; nothing reads them (ADR-0007).
removeObsoleteAIStorageKeys();

// A signed-in leader's settings follow them across devices (ADR-0005); no-op signed out / unconfigured.
startLeaderSettingsSync();
// One Google login for every page: any sign-in syncs the personal app's data; sign-out stops (ADR-0010).
startSyncLifecycle();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LandingGate app={<App />} />
  </React.StrictMode>
);
