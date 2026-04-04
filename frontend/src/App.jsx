import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { useControlCenter } from './context/ControlCenterContext';
import CommandPage from './pages/CommandPage';
import ConsolePage from './pages/ConsolePage';
import DashboardPage from './pages/DashboardPage';

function App() {
  const location = useLocation();
  const { activeSession, busyDevices, onlineDevices, sessions } = useControlCenter();
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <header className="topbar glass-strip">
        <div>
          <p className="eyebrow">TURTLE // REMOTE ORCHESTRATION</p>
          <h1>Command cockpit for distributed execution nodes</h1>
          <p className="subtle-copy">
            Voice or text in. Structured workflow, live fleet telemetry, and reviewable output out.
          </p>
        </div>

        <div className="topbar-actions">
          <span className="signal-chip">{onlineDevices.length} nodes synced</span>
          <span className="signal-chip">{busyDevices.length} executing</span>
          <span className="signal-chip">{sessions.filter((session) => session.status === 'blocked').length} blocked</span>
          {installPrompt ? (
            <button className="ghost-button" onClick={handleInstall}>
              Install app
            </button>
          ) : (
            <span className="signal-chip muted-chip">Branch: sammy</span>
          )}
        </div>
      </header>

      <section className="status-ribbon">
        <span>
          {activeSession ? activeSession.summary : 'Control plane idle and awaiting next workflow.'}
        </span>
        <span className="status-ribbon-accent">
          {activeSession ? activeSession.status.toUpperCase() : 'STANDBY'}
        </span>
      </section>

      <main className="page-shell">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/command" element={<CommandPage />} />
            <Route path="/console" element={<ConsolePage />} />
          </Routes>
        </AnimatePresence>
      </main>

      <motion.div
        className="floating-status glass-strip"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <span className="floating-dot" />
        <span>{activeSession ? activeSession.commandText : 'Ready for mobile command input'}</span>
      </motion.div>

      <BottomNav />
    </div>
  );
}

export default App;
