import { createContext, useContext, useEffect, useRef, useState } from 'react';

const ControlCenterContext = createContext(null);

const quickCommands = [
  'Implement a scheduler service with a frontend form, store responses, and email results to Gmail.',
  'Upload the latest logs to cloud storage and restart the backend service.',
  'Create a polished status board for all active devices and show the PR output.',
  'Delete all project files and wipe the repo history.'
];

const baseDevices = [
  {
    id: 'node-alpha',
    name: 'OpenClaw Alpha',
    ip: '10.0.0.21',
    status: 'busy',
    activeTask: 'Synthesis + PR handoff',
    cpu: 61,
    memory: 54,
    latency: 28,
    zone: 'Frontend + Git',
    capabilities: ['frontend', 'git', 'validation', 'voice'],
    lastSeen: Date.now() - 4000,
  },
  {
    id: 'node-beta',
    name: 'OpenClaw Beta',
    ip: '10.0.0.34',
    status: 'online',
    activeTask: 'Idle and warmed for orchestration',
    cpu: 25,
    memory: 36,
    latency: 44,
    zone: 'Backend + Services',
    capabilities: ['backend', 'api', 'validation', 'cloud'],
    lastSeen: Date.now() - 2800,
  },
  {
    id: 'node-gamma',
    name: 'OpenClaw Gamma',
    ip: '10.0.0.52',
    status: 'online',
    activeTask: 'Database watch standby',
    cpu: 18,
    memory: 42,
    latency: 39,
    zone: 'Database + Queue',
    capabilities: ['database', 'storage', 'validation'],
    lastSeen: Date.now() - 6100,
  },
  {
    id: 'node-delta',
    name: 'OpenClaw Delta',
    ip: '10.0.0.70',
    status: 'offline',
    activeTask: 'Disconnected from fleet fabric',
    cpu: 0,
    memory: 0,
    latency: 0,
    zone: 'Fallback node',
    capabilities: ['frontend', 'backend', 'cloud'],
    lastSeen: Date.now() - 1000 * 60 * 14,
  },
];

const starterSessions = [
  {
    id: 'session-starter',
    commandText:
      'Implement a scheduler service with a frontend form, store responses, and email results to Gmail.',
    mode: 'text',
    status: 'completed',
    createdAt: Date.now() - 1000 * 60 * 18,
    summary:
      'Scheduler workflow completed across frontend, API, storage, validation, and PR handoff.',
    blockedReason: '',
    prUrl: 'https://github.com/Psp32/Turtle/compare/sammy?expand=1',
    voiceText:
      'Scheduler workflow finished successfully. Frontend, backend, storage, and validation steps completed, and a review-ready branch is prepared on sammy.',
    tags: ['frontend', 'backend', 'database', 'email', 'git'],
    clarification:
      'Provider locked to Gmail SMTP and outputs remain inside repo scope for review.',
    tasks: [
      {
        id: 'starter-1',
        title: 'Compose mobile scheduler form',
        detail: 'Create the user-facing form and success states.',
        capability: 'frontend',
        nodeId: 'node-alpha',
        status: 'completed',
      },
      {
        id: 'starter-2',
        title: 'Expose scheduler API route',
        detail: 'Create a backend route to accept and validate submissions.',
        capability: 'backend',
        nodeId: 'node-beta',
        status: 'completed',
      },
      {
        id: 'starter-3',
        title: 'Persist scheduler responses',
        detail: 'Update storage layer and capture metadata for later review.',
        capability: 'database',
        nodeId: 'node-gamma',
        status: 'completed',
      },
      {
        id: 'starter-4',
        title: 'Trigger Gmail delivery + validation',
        detail: 'Run a lightweight validation and package the branch for review.',
        capability: 'validation',
        nodeId: 'node-alpha',
        status: 'completed',
      },
    ],
    logs: [
      {
        id: 'starter-log-1',
        line: 'Command normalized and sent to Gemini planner.',
        level: 'info',
        timestamp: Date.now() - 1000 * 60 * 17,
      },
      {
        id: 'starter-log-2',
        line: 'Workflow pinned to Alpha/Beta/Gamma to avoid merge contention.',
        level: 'success',
        timestamp: Date.now() - 1000 * 60 * 15,
      },
      {
        id: 'starter-log-3',
        line: 'Validation passed. Review branch queued on sammy.',
        level: 'success',
        timestamp: Date.now() - 1000 * 60 * 10,
      },
    ],
  },
  {
    id: 'session-blocked',
    commandText: 'Delete all project files and wipe the repo history.',
    mode: 'voice',
    status: 'blocked',
    createdAt: Date.now() - 1000 * 60 * 7,
    summary: 'ArmorClaw blocked a destructive request before execution began.',
    blockedReason: 'Delete and wipe operations fall outside the allowed repo-scoped policy.',
    prUrl: '',
    voiceText:
      'Destructive request denied. The policy layer blocked deletion and protected the repo.',
    tags: ['policy', 'safety'],
    clarification: 'None required. The command matched a destructive action rule.',
    tasks: [
      {
        id: 'blocked-1',
        title: 'ArmorClaw policy gate',
        detail: 'Evaluate destructive intent before task dispatch.',
        capability: 'policy',
        nodeId: 'node-alpha',
        status: 'blocked',
      },
    ],
    logs: [
      {
        id: 'blocked-log-1',
        line: 'Voice transcript received from mobile bridge.',
        level: 'info',
        timestamp: Date.now() - 1000 * 60 * 7,
      },
      {
        id: 'blocked-log-2',
        line: 'Policy evaluation rejected delete / wipe intent. No files touched.',
        level: 'policy',
        timestamp: Date.now() - 1000 * 60 * 6,
      },
    ],
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickNode(devices, capability) {
  const match = devices.find(
    (device) =>
      device.status !== 'offline' && device.capabilities.includes(capability)
  );

  return match ? match.id : devices.find((device) => device.status !== 'offline')?.id;
}

function buildTaskPlan(commandText, devices) {
  const text = commandText.trim();
  const lowerText = text.toLowerCase();
  const destructive = /(delete|wipe|destroy|format|drop database|erase|shutdown the whole)/i.test(
    lowerText
  );

  if (!text) {
    return {
      blocked: false,
      preview: 'Describe a workflow and Turtle will map it into execution-ready tasks.',
      completeSummary: '',
      blockedReason: '',
      clarification: '',
      tags: ['mobile', 'voice', 'text'],
      tasks: [],
    };
  }

  if (destructive) {
    return {
      blocked: true,
      preview: 'ArmorClaw will hold this request for manual review instead of executing it.',
      completeSummary:
        'Destructive request denied. No node received an execution payload.',
      blockedReason:
        'Commands involving deletion, wiping, or unrestricted destructive behavior are blocked by policy.',
      clarification: 'Request a scoped file change or review workflow instead.',
      tags: ['policy', 'safety', 'blocked'],
      tasks: [
        {
          id: createId('task'),
          title: 'ArmorClaw policy review',
          detail: 'Detect destructive intent and stop the workflow before dispatch.',
          capability: 'policy',
          nodeId: pickNode(devices, 'validation'),
          status: 'queued',
        },
      ],
    };
  }

  const tasks = [];
  const tags = new Set(['orchestration']);

  if (/(dashboard|ui|frontend|form|page|mobile|react)/i.test(lowerText)) {
    tags.add('frontend');
    tasks.push({
      id: createId('task'),
      title: 'Shape mobile UI experience',
      detail: 'Update the user-facing surface, layouts, and interaction states.',
      capability: 'frontend',
      nodeId: pickNode(devices, 'frontend'),
      status: 'queued',
    });
  }

  if (/(api|backend|service|server|endpoint|nodemailer|email|gmail)/i.test(lowerText)) {
    tags.add('backend');
    tasks.push({
      id: createId('task'),
      title: 'Wire orchestration service',
      detail: 'Create or update the backend path that executes the requested flow.',
      capability: 'backend',
      nodeId: pickNode(devices, 'backend'),
      status: 'queued',
    });
  }

  if (/(db|database|schema|store|persist|queue|responses|log)/i.test(lowerText)) {
    tags.add('database');
    tasks.push({
      id: createId('task'),
      title: 'Persist workflow state',
      detail: 'Store results, logs, or metadata so the command stays reviewable.',
      capability: 'database',
      nodeId: pickNode(devices, 'database'),
      status: 'queued',
    });
  }

  if (/(upload|cloud|deploy|bucket|storage|aws|gcp)/i.test(lowerText)) {
    tags.add('cloud');
    tasks.push({
      id: createId('task'),
      title: 'Execute cloud handoff',
      detail: 'Upload artifacts or trigger the cloud-side action.',
      capability: 'cloud',
      nodeId: pickNode(devices, 'cloud'),
      status: 'queued',
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      id: createId('task'),
      title: 'Interpret general workflow request',
      detail: 'Break the command into a repo-scoped execution plan.',
      capability: 'frontend',
      nodeId: pickNode(devices, 'frontend'),
      status: 'queued',
    });
  }

  tasks.push({
    id: createId('task'),
    title: 'Run lightweight validation',
    detail: 'Check the result before human review.',
    capability: 'validation',
    nodeId: pickNode(devices, 'validation'),
    status: 'queued',
  });

  tasks.push({
    id: createId('task'),
    title: 'Package branch + PR artifact',
    detail: 'Prepare the review surface with git metadata and summary output.',
    capability: 'git',
    nodeId: pickNode(devices, 'git'),
    status: 'queued',
  });

  let clarification = '';
  if (/(email|gmail|nodemailer)/i.test(lowerText) && !/(gmail|sendgrid|ses|mailgun)/i.test(lowerText)) {
    clarification = 'Clarify the email provider before final execution.';
  }

  if (/(upload|cloud)/i.test(lowerText) && !/(aws|gcp|azure|s3|bucket)/i.test(lowerText)) {
    clarification = clarification
      ? `${clarification} Also confirm the cloud destination.`
      : 'Confirm the cloud destination before the upload step runs.';
  }

  return {
    blocked: false,
    preview:
      'Gemini will decompose this into repo-scoped subtasks and pin each step to the best available node.',
    completeSummary:
      'Workflow completed and packaged for review. Live task output is ready for the console and voice relay.',
    blockedReason: '',
    clarification,
    tags: Array.from(tags),
    tasks,
  };
}

export function ControlCenterProvider({ children }) {
  const [devices, setDevices] = useState(baseDevices);
  const [sessions, setSessions] = useState(starterSessions);
  const [currentSessionId, setCurrentSessionId] = useState(starterSessions[0].id);
  const [commandDraft, setCommandDraft] = useState('');
  const scheduledTimers = useRef([]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDevices((currentDevices) =>
        currentDevices.map((device) => {
          if (device.status === 'offline') {
            return device;
          }

          const cpuDrift = device.status === 'busy' ? 8 : 4;
          const memoryDrift = device.status === 'busy' ? 4 : 2;

          return {
            ...device,
            cpu: clamp(device.cpu + (Math.random() * cpuDrift - cpuDrift / 2), 9, 92),
            memory: clamp(
              device.memory + (Math.random() * memoryDrift - memoryDrift / 2),
              18,
              88
            ),
            latency: clamp(device.latency + Math.round(Math.random() * 10 - 5), 12, 88),
            lastSeen: Date.now() - Math.round(Math.random() * 9000),
          };
        })
      );
    }, 3200);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return () => {
      scheduledTimers.current.forEach((timerId) => clearTimeout(timerId));
    };
  }, []);

  function queueTimer(callback, delay) {
    const timerId = window.setTimeout(callback, delay);
    scheduledTimers.current.push(timerId);
  }

  function selectSession(sessionId) {
    setCurrentSessionId(sessionId);
  }

  function updateSession(sessionId, update) {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId ? { ...session, ...update } : session
      )
    );
  }

  function updateTask(sessionId, taskId, update) {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              tasks: session.tasks.map((task) =>
                task.id === taskId ? { ...task, ...update } : task
              ),
            }
          : session
      )
    );
  }

  function appendLog(sessionId, line, level = 'info') {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              logs: [
                ...session.logs,
                {
                  id: createId('log'),
                  line,
                  level,
                  timestamp: Date.now(),
                },
              ],
            }
          : session
      )
    );
  }

  function setNodeStatus(nodeId, status, activeTask) {
    setDevices((currentDevices) =>
      currentDevices.map((device) =>
        device.id === nodeId
          ? {
              ...device,
              status,
              activeTask,
              cpu: status === 'busy' ? clamp(device.cpu + 10, 12, 96) : clamp(device.cpu - 8, 10, 72),
              lastSeen: Date.now(),
            }
          : device
      )
    );
  }

  function inspectCommand(commandText) {
    return buildTaskPlan(commandText, devices);
  }

  function launchCommand(commandText, inputMode = 'text') {
    const trimmed = commandText.trim();

    if (!trimmed) {
      return null;
    }

    const plan = buildTaskPlan(trimmed, devices);
    const sessionId = createId('session');
    const commandSession = {
      id: sessionId,
      commandText: trimmed,
      mode: inputMode,
      status: plan.blocked ? 'policy' : 'queued',
      createdAt: Date.now(),
      summary: plan.preview,
      blockedReason: plan.blockedReason,
      prUrl: plan.blocked ? '' : 'https://github.com/Psp32/Turtle/compare/sammy?expand=1',
      voiceText: plan.completeSummary,
      tags: plan.tags,
      clarification: plan.clarification,
      tasks: plan.tasks,
      logs: [
        {
          id: createId('log'),
          line: `Received ${inputMode} command from mobile bridge.`,
          level: 'info',
          timestamp: Date.now(),
        },
      ],
    };

    setSessions((currentSessions) => [commandSession, ...currentSessions]);
    setCurrentSessionId(sessionId);
    setCommandDraft('');

    if ('vibrate' in navigator) {
      navigator.vibrate([18, 24, 18]);
    }

    if (plan.blocked) {
      queueTimer(() => {
        updateTask(sessionId, plan.tasks[0].id, { status: 'blocked' });
        updateSession(sessionId, {
          status: 'blocked',
          summary: plan.completeSummary,
          voiceText:
            'Request denied. ArmorClaw blocked a destructive action before any node could begin execution.',
        });
        appendLog(
          sessionId,
          'ArmorClaw blocked the request. No repo or system action was dispatched.',
          'policy'
        );
      }, 900);

      return sessionId;
    }

    queueTimer(() => {
      updateSession(sessionId, {
        status: 'routing',
        summary: 'Gemini decomposed the request and assigned a live execution plan.',
      });
      appendLog(
        sessionId,
        'Planner generated an ordered workflow and selected the best available nodes.',
        'success'
      );
    }, 700);

    let cursor = 1400;

    plan.tasks.forEach((task, index) => {
      queueTimer(() => {
        updateTask(sessionId, task.id, { status: 'running' });
        updateSession(sessionId, { status: 'running' });
        setNodeStatus(task.nodeId, 'busy', task.title);
        appendLog(
          sessionId,
          `${task.title} started on ${devices.find((device) => device.id === task.nodeId)?.name ?? 'fleet node'}.`,
          'info'
        );
      }, cursor);

      cursor += 1300;

      queueTimer(() => {
        updateTask(sessionId, task.id, { status: 'completed' });
        setNodeStatus(task.nodeId, 'online', `Idle after ${task.title}`);
        appendLog(sessionId, `${task.title} finished successfully.`, 'success');

        if (index === plan.tasks.length - 1) {
          updateSession(sessionId, {
            status: 'completed',
            summary: plan.completeSummary,
            voiceText:
              'Workflow completed successfully. Task output, validation, and review packaging are ready in the console.',
          });
          appendLog(sessionId, 'Workflow complete. Review artifact ready for human approval.', 'success');

          if ('vibrate' in navigator) {
            navigator.vibrate([28, 40, 28]);
          }
        }
      }, cursor);

      cursor += 950;
    });

    return sessionId;
  }

  const activeSession =
    sessions.find((session) => session.id === currentSessionId) ?? sessions[0] ?? null;
  const onlineDevices = devices.filter((device) => device.status !== 'offline');
  const busyDevices = devices.filter((device) => device.status === 'busy');

  return (
    <ControlCenterContext.Provider
      value={{
        activeSession,
        busyDevices,
        commandDraft,
        devices,
        inspectCommand,
        launchCommand,
        onlineDevices,
        quickCommands,
        selectSession,
        sessions,
        setCommandDraft,
      }}
    >
      {children}
    </ControlCenterContext.Provider>
  );
}

export function useControlCenter() {
  const context = useContext(ControlCenterContext);

  if (!context) {
    throw new Error('useControlCenter must be used inside ControlCenterProvider');
  }

  return context;
}
