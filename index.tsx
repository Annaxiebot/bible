
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingGate from './components/landing/LandingGate';
import './styles/stlTheme.css'; // --stl-* colour tokens (landing + TV mode); mapped to Tailwind in index.html

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
