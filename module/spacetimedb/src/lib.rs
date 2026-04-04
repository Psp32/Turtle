//! Fleet control schema: agents, task queue, results, command sessions, enforcement audit.

use spacetimedb::{ReducerContext, Timestamp, Table};

// --- Fleet registry & live status ---

#[spacetimedb::table(accessor = pc_agent, public)]
pub struct PcAgent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[unique]
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

#[spacetimedb::table(
    accessor = task_result,
    public,
    index(name = "by_task", accessor = by_task, btree(columns = [task_id]))
)]
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

#[spacetimedb::table(
    accessor = enforcement_log,
    public,
    index(name = "by_task_enf", accessor = by_task_enf, btree(columns = [task_id]))
)]
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

// --- Lifecycle ---

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(_ctx: &ReducerContext) {}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(_ctx: &ReducerContext) {}

// --- Reducers ---

#[spacetimedb::reducer]
pub fn register_agent(
    ctx: &ReducerContext,
    hostname: String,
    ip: String,
    installed_apps: String,
    cpu_load: f32,
    memory_usage: f32,
) -> Result<(), String> {
    if hostname.trim().is_empty() {
        return Err("hostname is required".into());
    }

    let now = ctx.timestamp;

    let row = PcAgent {
        id: 0,
        hostname: hostname.clone(),
        ip,
        status: "online".into(),
        cpu_load,
        memory_usage,
        installed_apps,
        last_heartbeat: now,
    };

    if let Some(existing) = ctx.db.pc_agent().hostname().find(&hostname) {
        ctx.db.pc_agent().id().update(PcAgent {
            id: existing.id,
            ..row
        });
    } else {
        ctx.db.pc_agent().insert(row);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn send_heartbeat(
    ctx: &ReducerContext,
    pc_id: u64,
    cpu_load: f32,
    memory_usage: f32,
    status: String,
) -> Result<(), String> {
    let Some(agent) = ctx.db.pc_agent().id().find(&pc_id) else {
        return Err("unknown pc_id".into());
    };

    ctx.db.pc_agent().id().update(PcAgent {
        cpu_load,
        memory_usage,
        status,
        last_heartbeat: ctx.timestamp,
        ..agent
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn submit_command(ctx: &ReducerContext, raw_input: String) -> Result<(), String> {
    let now = ctx.timestamp;

    ctx.db.command_session().insert(CommandSession {
        id: 0,
        raw_input: raw_input.clone(),
        decomposed_intents: "{}".into(),
        synthesis_summary: String::new(),
        status: "pending".into(),
        created_at: now,
    });

    ctx.db.task_queue().insert(TaskQueue {
        id: 0,
        command_text: raw_input,
        intent_json: "{}".into(),
        assigned_pc_id: None,
        status: "pending".into(),
        priority: 0,
        depends_on: None,
        created_at: now,
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn assign_task(ctx: &ReducerContext, task_id: u64, pc_id: u64) -> Result<(), String> {
    let Some(task) = ctx.db.task_queue().id().find(&task_id) else {
        return Err("unknown task_id".into());
    };

    ctx.db.task_queue().id().update(TaskQueue {
        assigned_pc_id: Some(pc_id),
        status: "assigned".into(),
        ..task
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn update_task_status(ctx: &ReducerContext, task_id: u64, status: String) -> Result<(), String> {
    let Some(task) = ctx.db.task_queue().id().find(&task_id) else {
        return Err("unknown task_id".into());
    };

    ctx.db.task_queue().id().update(TaskQueue {
        status,
        ..task
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn report_result(
    ctx: &ReducerContext,
    task_id: u64,
    pc_id: u64,
    stdout: String,
    stderr: String,
    exit_code: i32,
    file_diffs: String,
    enforcement_decision: String,
    verification_token: String,
) -> Result<(), String> {
    ctx.db.task_result().insert(TaskResult {
        id: 0,
        task_id,
        pc_id,
        stdout,
        stderr,
        exit_code,
        file_diffs,
        enforcement_decision,
        verification_token,
        completed_at: ctx.timestamp,
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn log_enforcement(
    ctx: &ReducerContext,
    task_id: u64,
    pc_id: u64,
    action_type: String,
    decision: String,
    reason: String,
) -> Result<(), String> {
    ctx.db.enforcement_log().insert(EnforcementLog {
        id: 0,
        task_id,
        pc_id,
        action_type,
        decision,
        reason,
        timestamp: ctx.timestamp,
    });

    Ok(())
}