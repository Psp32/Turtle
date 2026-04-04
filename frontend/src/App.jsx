import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import './App.css';

const SPACETIMEDB_URI =
  import.meta.env.VITE_SPACETIMEDB_URI ||
  'https://testnet.spacetimedb.com/database/fleet-control';
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const FINALE_TEXT =
  import.meta.env.VITE_FINALE_TEXT ||
  'Model training complete. Distributed across 3 nodes, time saved: 20 minutes. Final federated accuracy is 94.2 percent.';

const CARD_LAYOUT = [
  { id: 1, title: 'Chunk A', subtitle: 'Node 1 · Local shard', accent: 'cyan' },
  { id: 2, title: 'Chunk B', subtitle: 'Node 2 · Remote shard', accent: 'mint' },
  { id: 3, title: 'Chunk C', subtitle: 'Node 3 · Secure shard', accent: 'violet' },
];

const STATUS_PROGRESS = {
  awaiting_orders: 0,
  idle: 0,
  queued: 8,
  pending: 18,
  assigned: 30,
  running: 64,
  validating: 86,
  done: 100,
  completed: 100,
  failed: 100,
  blocked: 100,
};

function normalizeStatus(status) {
  return String(status || 'awaiting_orders')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeTask(row) {
  if (Array.isArray(row)) {
    return {
      id: Number(row[0]),
      taskType: row[1] || 'unknown',
      targetNode: row[2] || `node-${row[0]}`,
      status: normalizeStatus(row[3]),
      summary: row[4] || '',
    };
  }

  return {
    id: Number(row.id ?? row.task_id ?? row.taskId ?? 0),
    taskType: row.task_type ?? row.taskType ?? row.command_text ?? 'unknown',
    targetNode: row.target_node ?? row.targetNode ?? row.assigned_pc_id ?? 'unassigned',
    status: normalizeStatus(row.status),
    summary:
      row.summary ??
      row.command_text ??
      row.intent_json ??
      row.enforcement_decision ??
      '',
  };
}

function normalizeTaskRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.rows || payload?.data || payload?.result || [];

  return rows
    .map(normalizeTask)
    .filter((task) => Number.isFinite(task.id) && task.id > 0);
}

function formatStatus(status) {
  return status.replace(/_/g, ' ');
}

function fallbackSpeak(text, setAudioState) {
  if (!window.speechSynthesis || !text) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 1.02;
  utterance.onstart = () => setAudioState('playing');
  utterance.onend = () => setAudioState('complete');
  utterance.onerror = () => setAudioState('fallback');
  window.speechSynthesis.speak(utterance);
}

function startVoiceCapture(setIsListening, setTranscript) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    window.alert('Speech recognition not supported in this browser. Please use Chrome.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => setIsListening(true);
  recognition.onresult = (event) => {
    const nextTranscript = event.results?.[0]?.[0]?.transcript || '';
    setTranscript(nextTranscript);
    console.log('User said:', nextTranscript);
  };
  recognition.onerror = () => setIsListening(false);
  recognition.onend = () => setIsListening(false);

  recognition.start();
}

async function playElevenLabsAudio(textToSpeak, setAudioState) {
  if (!textToSpeak) {
    return;
  }

  if (!ELEVENLABS_API_KEY) {
    fallbackSpeak(textToSpeak, setAudioState);
    return;
  }

  try {
    setAudioState('arming');
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToSpeak,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs returned ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onplay = () => setAudioState('playing');
    audio.onended = () => {
      setAudioState('complete');
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setAudioState('fallback');
      URL.revokeObjectURL(url);
      fallbackSpeak(textToSpeak, setAudioState);
    };
    await audio.play();
  } catch (error) {
    console.error('ElevenLabs failed:', error);
    setAudioState('fallback');
    fallbackSpeak(textToSpeak, setAudioState);
  }
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M12 14.75A3.25 3.25 0 0 0 15.25 11.5V6.25a3.25 3.25 0 1 0-6.5 0v5.25A3.25 3.25 0 0 0 12 14.75Z" />
      <path d="M18.25 11.5a.75.75 0 0 0-1.5 0 4.75 4.75 0 1 1-9.5 0 .75.75 0 0 0-1.5 0 6.26 6.26 0 0 0 5.5 6.21V20h-2a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-2v-2.29a6.26 6.26 0 0 0 5.5-6.21Z" />
    </svg>
  );
}

function NetworkStrip({ tasks }) {
  const items = tasks.length
    ? tasks
    : CARD_LAYOUT.map((card) => ({
        id: card.id,
        targetNode: `node-${card.id}`,
        status: 'idle',
        taskType: 'waiting',
      }));

  return (
    <div className="network-strip">
      {items.map((task, index) => (
        <div key={task.id} className="network-node">
          <div className={`network-pulse status-${task.status}`} />
          <div className="network-copy">
            <strong>{task.targetNode}</strong>
            <span>{formatStatus(task.status)}</span>
          </div>
          {index < items.length - 1 ? <div className="network-link" /> : null}
        </div>
      ))}
    </div>
  );
}

function TaskCard({ title, subtitle, task, accent = 'cyan', isAggregator = false }) {
  const status = task ? task.status : 'awaiting_orders';
  const progress = STATUS_PROGRESS[status] ?? (status.includes('done') ? 100 : 0);

  return (
    <motion.article
      className={`command-card accent-${accent} ${isAggregator ? 'aggregator-card' : ''}`}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="card-header">
        <div>
          <p className="card-kicker">{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <span className={`status-badge status-badge-${status}`}>
          {formatStatus(status)}
        </span>
      </div>

      <div className="card-metrics">
        <div className="metric-block">
          <span>Task</span>
          <strong>{task?.id ?? '--'}</strong>
        </div>
        <div className="metric-block">
          <span>Target</span>
          <strong>{task?.targetNode ?? 'Standby'}</strong>
        </div>
        <div className="metric-block">
          <span>Type</span>
          <strong>{task?.taskType ?? 'Awaiting sync'}</strong>
        </div>
      </div>

      <p className="card-summary">
        {task?.summary ||
          (isAggregator
            ? 'Waiting to merge distributed output and trigger the narrated finish.'
            : 'Waiting for the next orchestration update from the command plane.')}
      </p>

      <div className="card-footnote">
        <span className="mini-dot" />
        <span>{status === 'running' ? 'Live execution' : status === 'completed' || status === 'done' ? 'Checkpoint sealed' : 'Queue watching'}</span>
      </div>

      <div className="card-progress-row">
        <div className="progress-track">
          <motion.div
            className="progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 110, damping: 20 }}
          />
        </div>
        <span className="progress-label">{progress}%</span>
      </div>
    </motion.article>
  );
}

function AudioPanel({ audioState, hasPlayedAudio, lastUpdated }) {
  const labelMap = {
    idle: 'Ready',
    arming: 'Connecting',
    playing: 'Playing',
    complete: 'Complete',
    fallback: 'Fallback',
  };

  return (
    <section className="surface-card utility-card">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Voice Finale</p>
          <h2>Voice Output</h2>
        </div>
        <span className={`tiny-pill tone-${audioState}`}>{audioState}</span>
      </div>

      <div className={`audio-core audio-${audioState}`}>
        <div className="audio-rings">
          <span />
          <span />
          <span />
        </div>
        <div className="audio-core-copy">
          <strong>{labelMap[audioState] || 'Ready'}</strong>
          <span>{hasPlayedAudio ? 'Aggregator finished' : 'Waiting for aggregator'}</span>
        </div>
      </div>

      <div className="data-row">
        <div className="data-block">
          <span className="feed-label">Pulse</span>
          <p>
            {lastUpdated
              ? new Date(lastUpdated).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'No data yet'}
          </p>
        </div>
        <div className="data-block">
          <span className="feed-label">Mode</span>
          <p>{ELEVENLABS_API_KEY ? 'ElevenLabs API' : 'Browser fallback'}</p>
        </div>
      </div>
    </section>
  );
}

function VoiceDock({ isListening, transcript, onStart }) {
  return (
    <section className="surface-card voice-dock">
      <div className="voice-copy">
        <p className="panel-kicker">Voice Command</p>
        <h2>Voice Input</h2>
        <p className="support-copy">Tap once and speak.</p>
      </div>

      <div className="voice-dock-main">
        <div className="voice-transcript-panel">
          <div className="transcript-head">
            <span className={`live-dot ${isListening ? 'is-live' : ''}`} />
            <span>{isListening ? 'Listening' : 'Ready'}</span>
          </div>
          <p className={transcript ? 'transcript-text has-text' : 'transcript-text'}>
            {transcript || 'Your voice command will appear here.'}
          </p>
          <div className="voice-helper-row">
            <span className="tiny-pill">Mobile ready</span>
          </div>
        </div>

        <div className="mic-stage">
          <div className="mic-ambient-grid" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <button
            type="button"
            className={`mic-control ${isListening ? 'listening' : ''}`}
            onClick={onStart}
            aria-label={isListening ? 'Listening for voice input' : 'Start voice input'}
          >
            <span className="mic-halo mic-halo-a" />
            <span className="mic-halo mic-halo-b" />
            <span className="mic-halo mic-halo-c" />
            <span className="mic-center">
              <span className="mic-icon-wrap">
                <MicGlyph />
              </span>
            </span>
          </button>
          <div className="mic-label">
            <strong>{isListening ? 'Listening...' : 'Tap to speak'}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function InsightCard({ title, value, tone = 'default' }) {
  return (
    <div className={`insight-card tone-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);
  const [audioState, setAudioState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchTasks = async () => {
      try {
        const res = await axios.post(`${SPACETIMEDB_URI}/sql`, {
          query: 'SELECT * FROM TaskQueue',
        });

        if (!mounted) {
          return;
        }

        setTasks(normalizeTaskRows(res.data));
        setConnectionState('online');
        setLastUpdated(Date.now());
      } catch (error) {
        if (!mounted) {
          return;
        }

        console.error('SpacetimeDB offline.', error);
        setConnectionState('offline');
      }
    };

    fetchTasks();
    const interval = window.setInterval(fetchTasks, 1000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const aggregateTask = useMemo(() => tasks.find((task) => task.id === 4), [tasks]);

  useEffect(() => {
    if (
      aggregateTask &&
      (aggregateTask.status === 'done' || aggregateTask.status === 'completed') &&
      !hasPlayedAudio
    ) {
      setHasPlayedAudio(true);
      playElevenLabsAudio(FINALE_TEXT, setAudioState);
    }
  }, [aggregateTask, hasPlayedAudio]);

  const liveCards = CARD_LAYOUT.map((card) => ({
    ...card,
    task: tasks.find((task) => task.id === card.id),
  }));

  const completedCount = tasks.filter((task) =>
    ['done', 'completed'].includes(task.status)
  ).length;
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const queuedCount = tasks.filter((task) =>
    ['queued', 'pending', 'assigned', 'validating'].includes(task.status)
  ).length;
  const successRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const activeSummary = aggregateTask?.summary || transcript || 'Awaiting a live command.';

  return (
    <div className="dashboard-shell">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="background-mesh" />

      <div className="dashboard-frame">
        <header className="hero-shell">
          <section className="surface-card hero-card">
            <div className="hero-topline">
              <span className="eyebrow">Command Center</span>
              <div className="topline-pills">
                <span className={`tiny-pill tone-${connectionState}`}>{connectionState}</span>
                <span className="tiny-pill">1s sync</span>
              </div>
            </div>

            <div className="hero-body">
              <div className="hero-copy">
                <h1>Remote orchestration, at a glance.</h1>
                <p className="support-copy">Voice, nodes, and output in one place.</p>
              </div>

              <div className="hero-metrics">
                <InsightCard title="Running" value={runningCount} tone="cyan" />
                <InsightCard title="Queued" value={queuedCount} tone="amber" />
                <InsightCard title="Completed" value={completedCount} tone="mint" />
                <InsightCard title="Success" value={`${successRate}%`} tone="violet" />
              </div>
            </div>
          </section>
        </header>

        <section className="top-grid">
          <VoiceDock
            isListening={isListening}
            transcript={transcript}
            onStart={() => startVoiceCapture(setIsListening, setTranscript)}
          />

          <div className="utility-stack">
            <AudioPanel
              audioState={audioState}
              hasPlayedAudio={hasPlayedAudio}
              lastUpdated={lastUpdated}
            />

            <section className="surface-card utility-card">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Summary</p>
                  <h2>Live Output</h2>
                </div>
              </div>
              <div className="summary-well">
                <span className="feed-label">Current</span>
                <p>{activeSummary}</p>
              </div>
            </section>
          </div>
        </section>

        <section className="section-shell">
          <div className="section-heading">
            <div>
              <p className="panel-kicker">Nodes</p>
              <h2>Distributed Tasks</h2>
            </div>
            <span className="tiny-pill">{liveCards.length} shard lanes</span>
          </div>

          <div className="surface-card network-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Fabric</p>
                <h2>Live Routing</h2>
              </div>
            </div>
            <NetworkStrip tasks={liveCards.map((card) => card.task).filter(Boolean)} />
          </div>

          <div className="card-grid">
            {liveCards.map((card) => (
              <TaskCard
                key={card.id}
                title={card.title}
                subtitle={card.subtitle}
                task={card.task}
                accent={card.accent}
              />
            ))}
          </div>
        </section>

        <section className="bottom-grid">
          <TaskCard
            title="Map-Reduce Aggregator"
            subtitle="Node 4 · Federated merge"
            task={aggregateTask}
            accent="amber"
            isAggregator
          />

          <div className="meta-grid">
            <section className="surface-card meta-card">
              <span className="feed-label">Source</span>
              <p>{SPACETIMEDB_URI}</p>
            </section>

            <section className="surface-card meta-card">
              <span className="feed-label">Transcript</span>
              <p>{transcript || 'No command captured yet.'}</p>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;

