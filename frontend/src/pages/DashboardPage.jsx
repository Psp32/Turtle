import { motion } from 'framer-motion';
import ConsoleFeed from '../components/ConsoleFeed';
import DeviceCard from '../components/DeviceCard';
import TaskTimeline from '../components/TaskTimeline';
import { useControlCenter } from '../context/ControlCenterContext';

const pageMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { duration: 0.28 },
};

function DashboardPage() {
  const { activeSession, busyDevices, devices, onlineDevices, sessions } = useControlCenter();
  const safetyEvents = sessions.filter((session) => session.status === 'blocked').slice(0, 2);

  return (
    <motion.section className="page" {...pageMotion}>
      <div className="dashboard-hero-grid">
        <article className="glass-panel spotlight-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">CONTROL SURFACE</p>
              <h2>Live fleet status</h2>
            </div>
            <span className="panel-count">{onlineDevices.length}/4 online</span>
          </div>

          <p className="hero-copy">
            The cockpit is optimized for one-thumb control on mobile while still surfacing
            the routing, safety, and review story judges will care about.
          </p>

          <div className="stats-row">
            <div className="stat-card">
              <span>Busy nodes</span>
              <strong>{busyDevices.length}</strong>
            </div>
            <div className="stat-card">
              <span>Active workflow</span>
              <strong>{activeSession?.status ?? 'standby'}</strong>
            </div>
            <div className="stat-card">
              <span>Review output</span>
              <strong>{activeSession?.prUrl ? 'PR ready' : 'Policy hold'}</strong>
            </div>
          </div>
        </article>

        <article className="glass-panel summary-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">CURRENT SESSION</p>
              <h2>{activeSession?.mode === 'voice' ? 'Voice-issued workflow' : 'Text-issued workflow'}</h2>
            </div>
          </div>

          <p className="command-preview">{activeSession?.commandText}</p>
          <div className="summary-pill-row">
            {activeSession?.tags?.map((tag) => (
              <span key={tag} className="capability-pill">
                {tag}
              </span>
            ))}
          </div>
          <p className="subtle-copy">
            {activeSession?.clarification || 'No clarification loop needed for the current workflow.'}
          </p>
        </article>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SYNCED NODES</p>
            <h2>Execution fabric</h2>
          </div>
          <span className="panel-count">{devices.length} total nodes</span>
        </div>

        <div className="device-grid">
          {devices.map((device, index) => (
            <DeviceCard key={device.id} device={device} index={index} />
          ))}
        </div>
      </section>

      <section className="section-block two-column-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">WORKFLOW GRAPH</p>
              <h2>Ordered task stream</h2>
            </div>
          </div>
          <TaskTimeline tasks={activeSession?.tasks ?? []} />
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">SAFETY SIGNALS</p>
              <h2>Policy + output feed</h2>
            </div>
          </div>

          <div className="safety-stack">
            {safetyEvents.map((session) => (
              <div key={session.id} className="safety-card">
                <strong>{session.status.toUpperCase()}</strong>
                <p>{session.commandText}</p>
                <span>{session.blockedReason}</span>
              </div>
            ))}
          </div>

          <ConsoleFeed logs={activeSession?.logs?.slice(-4) ?? []} />
        </article>
      </section>
    </motion.section>
  );
}

export default DashboardPage;
