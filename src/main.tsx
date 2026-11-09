import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  (window as unknown as {gm_authFailure?: () => void}).gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args
      .map((a: unknown) => {
        const err = a as { stack?: string; message?: string } | null;
        return String(err?.stack || err?.message || a);
      })
      .join(' ');

    if (
      msg.includes('WebSocket closed without opened') ||
      msg.includes('@vite/client') ||
      msg.includes("reading 'onMessage'")
    ) {
      return;
    }

    origError.apply(console, args);
    if (
      msg.includes('OverQuotaMapError') ||
      msg.includes('QuotaExceededError')
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };

  window.addEventListener(
    'error',
    (event) => {
      const filename = event.filename || '';
      const message = event.message || '';
      if (
        filename.startsWith('chrome-extension://') ||
        message.includes('WebSocket closed without opened') ||
        message.includes("reading 'onMessage'")
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reasonStr = String(event.reason?.message || event.reason || '');
      if (
        reasonStr.includes('WebSocket closed without opened') ||
        reasonStr.includes('chrome-extension://') ||
        reasonStr.includes("reading 'onMessage'")
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(<App />);


