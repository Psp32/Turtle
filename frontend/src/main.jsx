import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ControlCenterProvider } from './context/ControlCenterContext';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ControlCenterProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ControlCenterProvider>
    </BrowserRouter>
  </React.StrictMode>
);
