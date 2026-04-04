import 'dotenv/config';
import http from 'node:http';
import type { FleetPcSnapshot } from '../mobile/src/types/fleet.js';
import {
  runSessionSynthesis,
  type SessionPcRow,
  type SessionTaskResultRow,
  type SessionTaskRow,
} from '../mobile/src/services/sessionSynthesis.js';
import { submitFleetCommandFlow } from '../mobile/src/services/submitFleetCommand.js';

const port = Number(process.env.PLANNER_PORT || 8787);

function setCors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = req.url?.split('?')[0] ?? '';
  if (req.method !== 'POST' || (path !== '/plan' && path !== '/synthesize')) {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  for await (const chunk of req) {
    body += String(chunk);
  }

  try {
    if (path === '/plan') {
      const parsed = JSON.parse(body) as { rawInput?: unknown; fleet?: unknown };
      const rawInput = typeof parsed.rawInput === 'string' ? parsed.rawInput : '';
      const fleet = Array.isArray(parsed.fleet) ? (parsed.fleet as FleetPcSnapshot[]) : [];
      const { plan, planJson } = await submitFleetCommandFlow(rawInput, fleet);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plan, planJson }));
      return;
    }

    const s = JSON.parse(body) as {
      sessionId?: unknown;
      tasks?: unknown;
      results?: unknown;
      agents?: unknown;
    };
    const sessionId = typeof s.sessionId === 'number' ? s.sessionId : Number(s.sessionId);
    if (!Number.isFinite(sessionId)) {
      throw new Error('sessionId is required');
    }
    if (!Array.isArray(s.tasks) || !Array.isArray(s.results) || !Array.isArray(s.agents)) {
      throw new Error('tasks, results, and agents must be arrays');
    }
    const summary = await runSessionSynthesis(
      sessionId,
      s.tasks as SessionTaskRow[],
      s.results as SessionTaskResultRow[],
      s.agents as SessionPcRow[]
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use (another planner or app). Stop that process or set PLANNER_PORT to a free port.`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(
    `Planner: http://localhost:${port}  POST /plan  POST /synthesize  (GEMINI_API_KEY in .env)`
  );
});
