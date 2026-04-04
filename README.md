# 🚀 Autonomous Fleet Control System

A real-time multi-device orchestration system: a **mobile-friendly web app** (responsive browser UI on your phone) for controlling multiple PCs with natural language commands.

## ⚙️ Features

- 🧠 AI command processing using Gemini
- 🔄 Real-time sync via SpacetimeDB
- 🤖 Remote execution using OpenClaw agents
- 🔊 Voice feedback using ElevenLabs
- 🛡️ Safety enforcement with ArmorClaw
- ⚡ Parallel task execution across multiple systems

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

Status strings are stored as plain text (e.g. `online`, `pending`, `blocked`, `allowed`) so the web client stays simple.

## Gemini command decomposition

Service: `mobile/src/services/gemini.ts` — `decomposeCommand(input, fleetStatus)` uses a **fleet profile** (CPU %, memory %, `installed_apps`, online/offline) so Gemini picks **`target_pc_id` per sub-task**. `synthesizeResults(results[])` turns multi-PC execution snippets into one short summary (structured JSON `{ summary }` from Gemini). `buildSynthesisPrompt(results)` is exposed for tests/debugging.

```bash
npm install
npm test                    # always runs (Gemini is mocked; no API key required)
npm run test:live           # optional: real Gemini (`vitest.live.config.ts`); needs GEMINI_API_KEY
npm run gemini:demo -- "your command"
```

Test sources under `mobile/src/**/__tests__/` and `*.test.ts` are **committed**; `.gitignore` only drops **coverage** and **build** folders (e.g. `dist/`, `.next/`, `out/`).

`FleetPcSnapshot` (`mobile/src/types/fleet.ts`) matches `PcAgent` fields; map rows from the SpacetimeDB client when you connect the UI.

## 📦 Setup

1. Clone the repo
```bash
git clone https://github.com/Psp32/Turtle.git
cd Turtle