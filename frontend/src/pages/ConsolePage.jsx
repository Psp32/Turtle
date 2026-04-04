import { motion } from 'framer-motion';
import AudioVisualizer from '../components/AudioVisualizer';
import ConsoleFeed from '../components/ConsoleFeed';
import TaskTimeline from '../components/TaskTimeline';
import { useControlCenter } from '../context/ControlCenterContext';
import { useNarration } from '../hooks/useNarration';

const pageMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { duration: 0.28 },
};

function ConsolePage() {
  const { activeSession, selectSession, sessions } = useControlCenter();
  const { isPlaying, isSupported, play, stop } = useNarration();

  if (!activeSession) {
    return null;
  }

  return (
    <motion.section className="page" {...pageMotion}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXECUTION CONSOLE</p>
          <h2>Live output, policy signals, and voice relay</h2>
        </div>
      </div>

      <div className="session-tabs">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={session.id === activeSession.id ? 'session-tab is-active' : 'session-tab'}
            onClick={() => selectSession(session.id)}
          >
            <span>{session.mode === 'voice' ? 'Voice' : 'Text'}</span>
            <strong>{session.status}</strong>
          </button>
        ))}
      </div>

      <section className="section-block two-column-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">SESSION SUMMARY</p>
              <h2>{activeSession.commandText}</h2>
            </div>
          </div>

          <p className="subtle-copy">{activeSession.summary}</p>
          <div className="summary-pill-row">
            {activeSession.tags?.map((tag) => (
              <span key={tag} className="capability-pill">
                {tag}
              </span>
            ))}
          </div>
          <p className="subtle-copy">
            {activeSession.blockedReason || activeSession.clarification}
          </p>

          {activeSession.prUrl ? (
            <a
              className="primary-link"
              href={activeSession.prUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open review artifact
            </a>
          ) : (
            <span className="policy-banner">No PR surfaced because policy stopped execution.</span>
          )}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ELEVENLABS RETURN CHANNEL</p>
              <h2>Voice output panel</h2>
            </div>
          </div>

          <AudioVisualizer isActive={isPlaying} />
          <p className="subtle-copy">
            The UI is wired as a live narration surface. Until the backend connects a real ElevenLabs
            stream, this panel uses browser speech synthesis for the demo fallback.
          </p>

          <div className="voice-action-row">
            <button
              className="primary-button"
              onClick={() => play(activeSession.voiceText || activeSession.summary)}
              disabled={!isSupported}
            >
              Play summary
            </button>
            <button className="ghost-button" onClick={stop}>
              Stop
            </button>
          </div>
        </article>
      </section>

      <section className="section-block two-column-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">TASK OUTPUT</p>
              <h2>Workflow breakdown</h2>
            </div>
          </div>
          <TaskTimeline tasks={activeSession.tasks} />
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">TERMINAL FEED</p>
              <h2>Real-time event stream</h2>
            </div>
          </div>
          <ConsoleFeed logs={activeSession.logs} />
        </article>
      </section>
    </motion.section>
  );
}

export default ConsolePage;
