//! Fleet control schema: agents, task queue, results, command sessions, enforcement audit.

use spacetimedb::{ReducerContext, ScheduleAt, Table, Timestamp};
use std::time::Duration;

const FIVE_MINUTES: Duration = Duration::from_secs(5 * 60);
const RATE_WINDOW_MICROS: i64 = 60_000_000;
const RATE_MAX_SUBMITS: u32 = 10;
const MAX_RAW_INPUT_LEN: usize = 16_384;
const MAX_PLAN_JSON_LEN: usize = 512 * 1024;
const MAX_COMMAND_TEXT_LEN: usize = 32_768;
const MAX_SUMMARY_LEN: usize = 32_768;
const MAX_LOG_FIELD_LEN: usize = 8_192;

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
    /// Parent user command (all sub-tasks from one Gemini plan share this).
    pub command_session_id: Option<u64>,
    pub command_text: String,
    pub intent_json: String,
    /// Set when a PC claims the task.
    pub assigned_pc_id: Option<u64>,
    /// `pending` | `assigned` | `running` | `completed` | `failed` | `blocked` | `timed_out`
    pub status: String,
    pub priority: u32,
    pub depends_on: Option<u64>,
    pub created_at: Timestamp,
    /// Set when `status` becomes `running` (for timeout detection).
    pub running_since: Option<Timestamp>,
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

/// Per-identity sliding window for `submit_command` / `submit_planned_session`.
#[spacetimedb::table(accessor = command_rate_bucket, public)]
pub struct CommandRateBucket {
    #[primary_key]
    pub client_identity: String,
    pub window_start_micros: i64,
    pub count: u32,
}

/// Periodic scan for tasks stuck in `running` past the timeout.
#[spacetimedb::table(
    accessor = task_timeout_schedule,
    scheduled(check_running_task_timeouts)
)]
pub struct TaskTimeoutSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Lifecycle ---

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!(target: "fleet_reducer", "reducer=init");
    if ctx.db.task_timeout_schedule().count() == 0 {
        ctx.db.task_timeout_schedule().insert(TaskTimeoutSchedule {
            scheduled_id: 0,
            scheduled_at: Duration::from_secs(60).into(),
        });
    }
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    log_reducer("identity_connected", ctx);
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    log_reducer("identity_disconnected", ctx);
}

fn log_reducer(name: &'static str, ctx: &ReducerContext) {
    log::info!(
        target: "fleet_reducer",
        "reducer={} sender={} conn={:?}",
        name,
        ctx.sender(),
        ctx.connection_id()
    );
}

fn clamp_str(s: String, max: usize, label: &str) -> Result<String, String> {
    if s.len() > max {
        return Err(format!("{} exceeds max length {}", label, max));
    }
    Ok(s)
}

fn validate_task_queue_status(status: &str) -> Result<(), String> {
    match status {
        "pending" | "assigned" | "running" | "completed" | "failed" | "blocked" | "timed_out" => Ok(()),
        _ => Err(format!("invalid task status: {}", status)),
    }
}

fn validate_pc_agent_status(status: &str) -> Result<(), String> {
    match status {
        "online" | "offline" | "busy" => Ok(()),
        _ => Err(format!("invalid agent status: {}", status)),
    }
}

fn validate_enforcement_decision(d: &str) -> Result<(), String> {
    match d {
        "allowed" | "blocked" => Ok(()),
        _ => Err(format!("decision must be allowed or blocked, got {}", d)),
    }
}

/// Max `submit_command` + `submit_planned_session` per client per rolling minute (connection clients only).
fn enforce_command_submit_rate(ctx: &ReducerContext) -> Result<(), String> {
    if ctx.connection_id().is_none() {
        return Ok(());
    }
    let key = format!("{}", ctx.sender());
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let handle = ctx.db.command_rate_bucket();
    if let Some(bucket) = handle.client_identity().find(&key) {
        if now.saturating_sub(bucket.window_start_micros) > RATE_WINDOW_MICROS {
            handle.client_identity().update(CommandRateBucket {
                window_start_micros: now,
                count: 1,
                ..bucket
            });
        } else if bucket.count >= RATE_MAX_SUBMITS {
            return Err(format!(
                "rate limit: max {} command submissions per {}s",
                RATE_MAX_SUBMITS,
                RATE_WINDOW_MICROS / 1_000_000
            ));
        } else {
            handle.client_identity().update(CommandRateBucket {
                count: bucket.count + 1,
                ..bucket
            });
        }
    } else {
        handle.insert(CommandRateBucket {
            client_identity: key,
            window_start_micros: now,
            count: 1,
        });
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn check_running_task_timeouts(ctx: &ReducerContext, _arg: TaskTimeoutSchedule) -> Result<(), String> {
    log_reducer("check_running_task_timeouts", ctx);
    let now = ctx.timestamp;
    for task in ctx.db.task_queue().iter() {
        if task.status != "running" {
            continue;
        }
        let Some(since) = task.running_since else {
            continue;
        };
        let elapsed = now.duration_since(since).unwrap_or(Duration::ZERO);
        if elapsed > FIVE_MINUTES {
            log::warn!(
                target: "fleet_reducer",
                "task {} timed out after {:?}",
                task.id,
                elapsed
            );
            ctx.db.task_queue().id().update(TaskQueue {
                status: "timed_out".into(),
                running_since: None,
                ..task
            });
        }
    }
    Ok(())
}

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
    log_reducer("register_agent", ctx);
    let hostname = hostname.trim().to_string();
    if hostname.is_empty() || hostname.len() > 256 {
        return Err("hostname is required (max 256 chars)".into());
    }
    let ip = ip.trim().to_string();
    if ip.is_empty() || ip.len() > 64 {
        return Err("ip is required (max 64 chars)".into());
    }
    let installed_apps = clamp_str(installed_apps, MAX_PLAN_JSON_LEN, "installed_apps")?;
    if !cpu_load.is_finite() || cpu_load < 0.0 || cpu_load > 100.0 {
        return Err("cpu_load must be between 0 and 100".into());
    }
    if !memory_usage.is_finite() || memory_usage < 0.0 || memory_usage > 100.0 {
        return Err("memory_usage must be between 0 and 100".into());
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
    log_reducer("send_heartbeat", ctx);
    let status = status.trim().to_string();
    if status.is_empty() {
        return Err("status is required".into());
    }
    validate_pc_agent_status(&status)?;
    if !cpu_load.is_finite() || cpu_load < 0.0 || cpu_load > 100.0 {
        return Err("cpu_load must be between 0 and 100".into());
    }
    if !memory_usage.is_finite() || memory_usage < 0.0 || memory_usage > 100.0 {
        return Err("memory_usage must be between 0 and 100".into());
    }
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
    log_reducer("submit_command", ctx);
    enforce_command_submit_rate(ctx)?;
    let raw_input = clamp_str(raw_input.trim().to_string(), MAX_RAW_INPUT_LEN, "raw_input")?;
    if raw_input.is_empty() {
        return Err("command cannot be empty".into());
    }
    let now = ctx.timestamp;

    let session = ctx.db.command_session().insert(CommandSession {
        id: 0,
        raw_input: raw_input.clone(),
        decomposed_intents: "{}".into(),
        synthesis_summary: String::new(),
        status: "pending".into(),
        created_at: now,
    });

    ctx.db.task_queue().insert(TaskQueue {
        id: 0,
        command_session_id: Some(session.id),
        command_text: raw_input,
        intent_json: "{}".into(),
        assigned_pc_id: None,
        status: "pending".into(),
        priority: 0,
        depends_on: None,
        created_at: now,
        running_since: None,
    });

    Ok(())
}

fn task_has_any_result(ctx: &ReducerContext, task_id: u64) -> bool {
    ctx.db
        .task_result()
        .iter()
        .any(|r| r.task_id == task_id)
}

/// Every row in `task_queue` for this session has at least one `task_result`.
fn session_all_tasks_have_results(ctx: &ReducerContext, session_id: u64) -> bool {
    let mut any = false;
    for t in ctx.db.task_queue().iter() {
        if t.command_session_id != Some(session_id) {
            continue;
        }
        any = true;
        if !task_has_any_result(ctx, t.id) {
            return false;
        }
    }
    any
}

fn maybe_mark_session_awaiting_synthesis(ctx: &ReducerContext, session_id: u64) {
    let Some(session) = ctx.db.command_session().id().find(&session_id) else {
        return;
    };
    if !session.synthesis_summary.is_empty() || session.status == "synthesized" {
        return;
    }
    if session.status == "awaiting_synthesis" {
        return;
    }
    if !session_all_tasks_have_results(ctx, session_id) {
        return;
    }
    ctx.db.command_session().id().update(CommandSession {
        status: "awaiting_synthesis".into(),
        ..session
    });
}

#[spacetimedb::reducer]
pub fn set_synthesis_summary(
    ctx: &ReducerContext,
    session_id: u64,
    summary: String,
) -> Result<(), String> {
    log_reducer("set_synthesis_summary", ctx);
    let summary = clamp_str(summary.trim().to_string(), MAX_SUMMARY_LEN, "summary")?;
    if summary.is_empty() {
        return Err("summary cannot be empty".into());
    }
    let Some(session) = ctx.db.command_session().id().find(&session_id) else {
        return Err("unknown session_id".into());
    };

    ctx.db.command_session().id().update(CommandSession {
        synthesis_summary: summary,
        status: "synthesized".into(),
        ..session
    });

    Ok(())
}

fn json_u64(v: &serde_json::Value) -> Option<u64> {
    match v {
        serde_json::Value::Null => None,
        serde_json::Value::Number(n) => n
            .as_u64()
            .or_else(|| n.as_f64().map(|f| f.trunc() as u64)),
        _ => None,
    }
}

fn json_dep_index(v: &serde_json::Value) -> Option<usize> {
    json_u64(v).map(|u| u as usize)
}

/// Gemini (or planner) output: `{ "tasks": [ { type, target_pc_id, command, params, depends_on? } ] }`.
/// `depends_on` is the **index** of a prior task in that array; stored as `TaskQueue.depends_on` = that row's id.
#[spacetimedb::reducer]
pub fn submit_planned_session(
    ctx: &ReducerContext,
    raw_input: String,
    plan_json: String,
) -> Result<(), String> {
    log_reducer("submit_planned_session", ctx);
    enforce_command_submit_rate(ctx)?;
    let raw_input = clamp_str(raw_input.trim().to_string(), MAX_RAW_INPUT_LEN, "raw_input")?;
    if raw_input.is_empty() {
        return Err("raw_input cannot be empty".into());
    }
    let plan_json = clamp_str(plan_json, MAX_PLAN_JSON_LEN, "plan_json")?;

    let root: serde_json::Value =
        serde_json::from_str(&plan_json).map_err(|e| format!("invalid plan JSON: {}", e))?;
    let tasks = root
        .get("tasks")
        .and_then(|t| t.as_array())
        .ok_or_else(|| "plan_json must contain a tasks array".to_string())?;

    if tasks.is_empty() {
        return Err("tasks array must not be empty".into());
    }

    let now = ctx.timestamp;
    let session_row = ctx.db.command_session().insert(CommandSession {
        id: 0,
        raw_input: raw_input.clone(),
        decomposed_intents: plan_json.clone(),
        synthesis_summary: String::new(),
        status: "planned".into(),
        created_at: now,
    });
    let session_id = session_row.id;

    let mut inserted_ids: Vec<u64> = Vec::new();

    for (i, task_val) in tasks.iter().enumerate() {
        let obj = task_val
            .as_object()
            .ok_or_else(|| format!("tasks[{}] must be an object", i))?;
        let command = obj
            .get("command")
            .and_then(|c| c.as_str())
            .ok_or_else(|| format!("tasks[{}].command required", i))?
            .to_string();
        let command = clamp_str(command, MAX_COMMAND_TEXT_LEN, "task.command")?;
        let intent_json = serde_json::to_string(task_val).map_err(|e| e.to_string())?;
        let intent_json = clamp_str(intent_json, MAX_PLAN_JSON_LEN, "intent_json")?;

        let target_pc = obj.get("target_pc_id").and_then(json_u64);
        if let Some(pc) = target_pc {
            ctx.db
                .pc_agent()
                .id()
                .find(&pc)
                .ok_or_else(|| format!("tasks[{}]: unknown target_pc_id {}", i, pc))?;
        }

        let dep_idx = obj.get("depends_on").and_then(json_dep_index);
        let depends_on_id = if let Some(idx) = dep_idx {
            if idx >= i {
                return Err(format!(
                    "tasks[{}]: depends_on must reference an earlier task index",
                    i
                ));
            }
            Some(*inserted_ids.get(idx).ok_or_else(|| {
                format!("tasks[{}]: depends_on index {} out of range", i, idx)
            })?)
        } else {
            None
        };

        let (assigned_pc_id, status) = match target_pc {
            Some(pc) => (Some(pc), "assigned".to_string()),
            None => (None, "pending".to_string()),
        };

        let row = ctx.db.task_queue().insert(TaskQueue {
            id: 0,
            command_session_id: Some(session_id),
            command_text: command,
            intent_json,
            assigned_pc_id,
            status,
            priority: i as u32,
            depends_on: depends_on_id,
            created_at: now,
            running_since: None,
        });
        inserted_ids.push(row.id);
    }

    let current = ctx
        .db
        .command_session()
        .id()
        .find(&session_id)
        .ok_or_else(|| "session disappeared".to_string())?;
    ctx.db.command_session().id().update(CommandSession {
        status: "queued".into(),
        ..current
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn assign_task(ctx: &ReducerContext, task_id: u64, pc_id: u64) -> Result<(), String> {
    log_reducer("assign_task", ctx);
    ctx.db
        .pc_agent()
        .id()
        .find(&pc_id)
        .ok_or_else(|| "unknown pc_id".to_string())?;
    let Some(task) = ctx.db.task_queue().id().find(&task_id) else {
        return Err("unknown task_id".into());
    };
    if task.status != "pending" {
        return Err("only pending tasks can be assigned".into());
    }

    ctx.db.task_queue().id().update(TaskQueue {
        assigned_pc_id: Some(pc_id),
        status: "assigned".into(),
        ..task
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn update_task_status(ctx: &ReducerContext, task_id: u64, status: String) -> Result<(), String> {
    log_reducer("update_task_status", ctx);
    let status = status.trim().to_string();
    if status.is_empty() {
        return Err("status is required".into());
    }
    validate_task_queue_status(&status)?;
    let Some(task) = ctx.db.task_queue().id().find(&task_id) else {
        return Err("unknown task_id".into());
    };

    let running_since = if status == "running" {
        Some(ctx.timestamp)
    } else {
        None
    };

    ctx.db.task_queue().id().update(TaskQueue {
        status,
        running_since,
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
    log_reducer("report_result", ctx);
    let Some(task) = ctx.db.task_queue().id().find(&task_id) else {
        return Err("unknown task_id".into());
    };
    ctx.db
        .pc_agent()
        .id()
        .find(&pc_id)
        .ok_or_else(|| "unknown pc_id".to_string())?;
    let stdout = clamp_str(stdout, MAX_PLAN_JSON_LEN, "stdout")?;
    let stderr = clamp_str(stderr, MAX_PLAN_JSON_LEN, "stderr")?;
    let file_diffs = clamp_str(file_diffs, MAX_PLAN_JSON_LEN, "file_diffs")?;
    let enforcement_decision =
        clamp_str(enforcement_decision.trim().to_string(), MAX_LOG_FIELD_LEN, "enforcement_decision")?;
    let verification_token =
        clamp_str(verification_token, MAX_LOG_FIELD_LEN, "verification_token")?;
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

    if let Some(sid) = task.command_session_id {
        maybe_mark_session_awaiting_synthesis(ctx, sid);
    }

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
    log_reducer("log_enforcement", ctx);
    ctx.db
        .task_queue()
        .id()
        .find(&task_id)
        .ok_or_else(|| "unknown task_id".to_string())?;
    ctx.db
        .pc_agent()
        .id()
        .find(&pc_id)
        .ok_or_else(|| "unknown pc_id".to_string())?;
    let action_type = clamp_str(action_type.trim().to_string(), MAX_LOG_FIELD_LEN, "action_type")?;
    if action_type.is_empty() {
        return Err("action_type is required".into());
    }
    let decision = decision.trim().to_lowercase();
    validate_enforcement_decision(&decision)?;
    let reason = clamp_str(reason.trim().to_string(), MAX_LOG_FIELD_LEN, "reason")?;
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