# 🚀 Autonomous Fleet Control System

A real-time multi-device orchestration system: a **mobile-friendly web app** (responsive browser UI on your phone) for controlling multiple PCs with natural language commands.

## ⚙️ Features

- 🧠 AI command processing using Gemini
- 🔄 Real-time sync via SpacetimeDB
- 🤖 Remote execution using OpenClaw agents
- 🔊 Voice feedback using ElevenLabs
- 🛡️ Safety enforcement with ArmorClaw
- ⚡ Parallel task execution across multiple systems

Git workflow (commits, push, what not to track): **[GIT.md](GIT.md)**.

## Prerequisites (global tooling)

| Tool | Version | Notes |
|------|---------|--------|
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org/) — `node -v` |
| **Rust** | stable | [rustup.rs](https://rustup.rs/) — `rustc -V`, `cargo -V` |
| **SpacetimeDB CLI** | latest | See [Install SpacetimeDB](https://spacetimedb.com/install). Windows: run the PowerShell one-liner from that page, then `spacetime --version` (new terminal if needed). |
| **OpenClaw CLI** | latest | e.g. `npm install -g openclaw@latest` — `openclaw --version` |

## SpacetimeDB schema

Rust module: `module/spacetimedb`. From `module/`, run `spacetime build` (on Windows, Rust needs the **Visual Studio Build Tools** with the **Desktop development with C++** workload so `link.exe` is available).

Commit `module/spacetime.json` and the Rust sources; do **not** commit `module/spacetime.local.json` or `module/spacetimedb/target/` (both are listed in `.gitignore`).

| Table | Role |
|--------|------|
| `pc_agent` | Fleet registry and live status |
| `task_queue` | Command / intent assignments |
| `task_result` | stdout, stderr, exit code, diffs, enforcement summary |
| `command_session` | One user command: raw input, intents JSON, synthesis |
| `enforcement_log` | ArmorClaw allow/block audit rows |
| `command_rate_bucket` | Per-client rolling window for command submission rate limits |
| `task_timeout_schedule` | Scheduled reducer every 60s to mark long-running tasks `timed_out` |

**Policies:** `task_queue.status` includes **`timed_out`** if **`running`** for **> 5 minutes** (checked by scheduled **`check_running_task_timeouts`**). **`submit_command`** and **`submit_planned_session`** are rate-limited to **10 per client per rolling 60s** (clients with a connection only). Reducers validate enums, string lengths, and numeric ranges; each invocation logs at **`info`** to target **`fleet_reducer`** (sender + connection id).

**Frontend:** `frontend/src/components/ErrorBoundary.jsx` wraps the app in `main.jsx` to catch render errors. **`stressCommands.test.ts`** runs **10 parallel** `submitFleetCommandFlow` calls (mocked Gemini).

Status strings stay plain text (`online`, `pending`, `timed_out`, `allowed`, …).

## Gemini command decomposition

Service: `mobile/src/services/gemini.ts` — `decomposeCommand` / `synthesizeResults` use **`GeminiClientOptions`**: **3 attempts** with exponential backoff, **per-request timeout** (default 60s), **lenient JSON** (fences / first balanced `{`…`}` or `[`…`]`), then a **safe fallback** (single-task plan or deterministic synthesis string). Non-retryable errors (e.g. auth) still throw.

SpacetimeDB: `mobile/src/services/spacetimeReconnect.ts` — **`createSpacetimeReconnect({ uri, databaseName, token?, onConnected? })`** wraps the generated **`DbConnection.builder()`** with **exponential backoff reconnect** after disconnect or connect error; call **`stop()`** to close cleanly.

```bash
npm install
npm test                    # always runs (Gemini is mocked; no API key required)
npm run test:live           # optional: real Gemini (`vitest.live.config.ts`); needs GEMINI_API_KEY
npm run gemini:demo -- "your command"
```

Test sources under `mobile/src/**/__tests__/` and `*.test.ts` are **committed**; `.gitignore` only drops **coverage** and **build** folders (e.g. `dist/`, `.next/`, `out/`).

`FleetPcSnapshot` (`mobile/src/types/fleet.ts`) matches `PcAgent` fields; map rows from the SpacetimeDB client when you connect the UI.

## Submit command pipeline (Mobile → Gemini → SpacetimeDB)

1. **Gemini + wire shape** — `submitFleetCommandFlow` in `mobile/src/services/submitFleetCommand.ts` runs `decomposeCommand` → `routePlanThroughSuperPlane` (pass-through stub) → `stabilizePlanForStdb` so JSON matches the Rust reducer `submit_planned_session` (`tasks[]` with `type`, `target_pc_id`, `command`, `params`, optional `depends_on` as an **index** into that array).
2. **Planner HTTP** — From the repo root, with `GEMINI_API_KEY` in `.env`: `npm run planner:dev` serves `POST /plan` with body `{ "rawInput": "...", "fleet": [ ...FleetPcSnapshot ] }` and returns `{ plan, planJson }`.
3. **Web UI** — The Vite app uses `VITE_ORCHESTRATOR_API` (see `frontend/.env.example`) to call that planner when dispatching a command; sub-tasks are mapped onto the session timeline. If the planner is down, the existing local heuristic plan is used.
4. **SpacetimeDB** — After `spacetime build` in `module/`, run `spacetime generate` so client bindings include `submit_planned_session` and `command_session_id` on `task_queue`; then call the reducer with `raw_input` and `plan_json` (same string as `planJson` from the planner).

## Result synthesis (TaskResult → Gemini → CommandSession)

- After each `report_result`, the module checks whether **every** `task_queue` row for that `command_session_id` has at least one `task_result`. If so, `command_session.status` becomes **`awaiting_synthesis`** (and `synthesis_summary` is still empty until you store it).
- **`mobile/src/services/sessionSynthesis.ts`** — `sessionAllTasksHaveResults`, `buildSnippetsForSession`, `runSessionSynthesis` (calls `synthesizeResults`). Then call reducer **`set_synthesis_summary(session_id, summary)`** from your client so `CommandSession.synthesis_summary` is filled and status becomes **`synthesized`**.
- **`POST /synthesize`** on the planner server accepts JSON `{ sessionId, tasks, results, agents }` (same camelCase shapes as `SessionTaskRow` / `SessionTaskResultRow` / `SessionPcRow`) and returns `{ summary }` for you to pass into `set_synthesis_summary`.

## 📦 Setup

1. Clone the repo
```bash
git clone https://github.com/Psp32/Turtle.git
cd Turtle