//! Fleet control schema: agents, task queue, results, command sessions, enforcement audit.

use spacetimedb::{ReducerContext, Timestamp};

// --- Fleet registry & live status ---

#[spacetimedb::table(accessor = pc_agent, public)]
pub struct PcAgent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub hostname: String,
    pub ip: String,
    /// `online` | `offline` | `busy`
    pub status: String,
    pub cpu_load: f32,
    pub memory_usage: f32,
    /// JSON array of app names or identifiers (single string column).
    pub installed_apps: String,
    pub last_heartbeat: Timestamp,
}

// --- Pending / active task assignments ---

#[spacetimedb::table(accessor = task_queue, public)]
pub struct TaskQueue {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub command_text: String,
    pub intent_json: String,
    /// Set when a PC claims the task.
    pub assigned_pc_id: Option<u64>,
    /// `pending` | `assigned` | `running` | `completed` | `failed` | `blocked`
    pub status: String,
    pub priority: u32,
    pub depends_on: Option<u64>,
    pub created_at: Timestamp,
}

// --- Per-task execution output ---

#[spacetimedb::table(accessor = task_result, public, index(name = by_task, btree(columns = [task_id])))]
pub struct TaskResult {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub task_id: u64,
    pub pc_id: u64,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub file_diffs: String,
    pub enforcement_decision: String,
    pub verification_token: String,
    pub completed_at: Timestamp,
}

// --- One user utterance / command batch ---

#[spacetimedb::table(accessor = command_session, public)]
pub struct CommandSession {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub raw_input: String,
    pub decomposed_intents: String,
    pub synthesis_summary: String,
    pub status: String,
    pub created_at: Timestamp,
}

// --- ArmorClaw decisions (audit trail) ---

#[spacetimedb::table(accessor = enforcement_log, public, index(name = by_task_enf, btree(columns = [task_id])))]
pub struct EnforcementLog {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub task_id: u64,
    pub pc_id: u64,
    pub action_type: String,
    /// `allowed` | `blocked`
    pub decision: String,
    pub reason: String,
    pub timestamp: Timestamp,
}

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(_ctx: &ReducerContext) {}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(_ctx: &ReducerContext) {}
