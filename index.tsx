
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingGate from './components/landing/LandingGate';
import './styles/stlTheme.css'; // --stl-* colour tokens (landing + TV mode); mapped to Tailwind in index.html
import { startLeaderSettingsSync } from './services/leaderSettings';

// A signed-in leader's settings follow them across devices (ADR-0005); no-op signed out / unconfigured.
startLeaderSettingsSync();

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
