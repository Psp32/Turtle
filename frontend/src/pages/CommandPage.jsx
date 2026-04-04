import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import TaskTimeline from '../components/TaskTimeline';
import { useControlCenter } from '../context/ControlCenterContext';
import { useVoiceInput } from '../hooks/useVoiceInput';

const pageMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { duration: 0.28 },
};

function CommandPage() {
  const navigate = useNavigate();
  const {
    commandDraft,
    inspectCommand,
    launchCommand,
    quickCommands,
    setCommandDraft,
  } = useControlCenter();
  const {
    isListening,
    isSupported,
    resetTranscript,
    startListening,
    stopListening,
    transcript,
  } = useVoiceInput();

  const preview = inspectCommand(commandDraft);

  useEffect(() => {
    if (transcript) {
      setCommandDraft(transcript);
    }
  }, [setCommandDraft, transcript]);

  async function handlePasteFromClipboard() {
    const clipboardText = await navigator.clipboard?.readText?.();
    if (clipboardText) {
      setCommandDraft(clipboardText);
    }
  }

  function handleDispatch() {
    const sessionId = launchCommand(commandDraft, transcript ? 'voice' : 'text');
    if (!sessionId) {
      return;
    }

    resetTranscript();
    navigate('/console');
  }

  return (
    <motion.section className="page" {...pageMotion}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">COMMAND INTAKE</p>
          <h2>Voice + text workflow composer</h2>
        </div>
      </div>

      <article className="glass-panel command-panel">
        <div className="composer-grid">
          <div className="composer-main">
            <label className="composer-label" htmlFor="command-input">
              Describe the job
            </label>
            <textarea
              id="command-input"
              className="command-textarea"
              rows="7"
              placeholder="Example: upload the latest logs to cloud storage, restart the backend service, and surface the PR link in the dashboard."
              value={commandDraft}
              onChange={(event) => setCommandDraft(event.target.value)}
            />

            <div className="composer-actions">
              <button className="ghost-button" onClick={handlePasteFromClipboard}>
                Paste from clipboard
              </button>
              <button
                className="ghost-button"
                onClick={isListening ? stopListening : startListening}
                disabled={!isSupported}
              >
                {isListening ? 'Stop mic' : 'Start mic'}
              </button>
            </div>
          </div>

          <div className="voice-panel">
            <button
              className={isListening ? 'voice-orb is-listening' : 'voice-orb'}
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported}
            >
              <span className="voice-ring voice-ring-a" />
              <span className="voice-ring voice-ring-b" />
              <span className="voice-ring voice-ring-c" />
              <span className="voice-core">
                {isListening ? 'LIVE' : isSupported ? 'MIC' : 'TEXT'}
              </span>
            </button>

            <p className="subtle-copy centered-copy">
              {isSupported
                ? isListening
                  ? 'Listening for a phone-style command...'
                  : 'Tap once for voice capture with text as fallback.'
                : 'Speech recognition is unavailable in this browser, so text remains the fallback path.'}
            </p>

            <button className="primary-button" onClick={handleDispatch}>
              Send command
            </button>
          </div>
        </div>

        <div className="quick-command-row">
          {quickCommands.map((command) => (
            <button
              key={command}
              className="quick-command-pill"
              onClick={() => setCommandDraft(command)}
            >
              {command}
            </button>
          ))}
        </div>
      </article>

      <section className="section-block two-column-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">INTENT PREVIEW</p>
              <h2>What the planner sees</h2>
            </div>
          </div>

          <p className="subtle-copy">{preview.preview}</p>
          <div className="summary-pill-row">
            {preview.tags.map((tag) => (
              <span key={tag} className="capability-pill">
                {tag}
              </span>
            ))}
          </div>
          <p className="subtle-copy">
            {preview.blockedReason || preview.clarification || 'No clarification needed yet.'}
          </p>
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ROUTED TASKS</p>
              <h2>Execution draft</h2>
            </div>
          </div>
          <TaskTimeline tasks={preview.tasks} />
        </article>
      </section>
    </motion.section>
  );
}

export default CommandPage;
