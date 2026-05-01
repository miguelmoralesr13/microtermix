use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as AsyncMutex;

/// Handle para un servidor Axum con apagado ordenado.
pub struct ServerHandle {
    pub shutdown_tx: tokio::sync::oneshot::Sender<()>,
    pub join: tokio::task::JoinHandle<()>,
}

/// Atomic process tracking: combines notify handle + PID in a single struct
/// to eliminate the race condition between separate maps.
pub struct TrackedProcess {
    pub notify: Arc<tokio::sync::Notify>,
    pub pid: u32,
    pub started_at: std::time::Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineStepCondition {
    WaitPort(u16),
    WaitLog(String), // Regex pattern
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStep {
    pub service_id: String,
    pub condition: Option<PipelineStepCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineStatus {
    Running,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineState {
    pub status: PipelineStatus,
    pub current_step: usize,
    pub total_steps: usize,
}

/// Estado compartido de la aplicación backend.
pub struct AppState {
    /// Active child processes — single map with atomic tracking (notify + pid).
    pub processes: Arc<AsyncMutex<HashMap<String, TrackedProcess>>>,
    pub pipelines: Arc<AsyncMutex<HashMap<String, PipelineState>>>,
    pub stdin_senders: Arc<AsyncMutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<String>>>>,
    pub pty_resizers: Arc<AsyncMutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<(u16, u16)>>>>,
    pub proxy_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub file_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub coverage_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub pending_workspace_by_label: Arc<AsyncMutex<HashMap<String, String>>>,
    pub git_watchers: Arc<AsyncMutex<HashMap<String, Box<dyn std::any::Any + Send + Sync>>>>,
    pub git_fetch_worker_started: Arc<AsyncMutex<bool>>,
    pub active_git_projects: Arc<AsyncMutex<HashMap<String, String>>>,
    pub cw_workers: Arc<AsyncMutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    pub watchers: Arc<AsyncMutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    pub sys_monitor: Arc<std::sync::Mutex<sysinfo::System>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(AsyncMutex::new(HashMap::new())),
            pipelines: Arc::new(AsyncMutex::new(HashMap::new())),
            stdin_senders: Arc::new(AsyncMutex::new(HashMap::new())),
            pty_resizers: Arc::new(AsyncMutex::new(HashMap::new())),
            proxy_abort: Arc::new(AsyncMutex::new(None)),
            file_server_abort: Arc::new(AsyncMutex::new(None)),
            coverage_server_abort: Arc::new(AsyncMutex::new(None)),
            pending_workspace_by_label: Arc::new(AsyncMutex::new(HashMap::new())),
            git_watchers: Arc::new(AsyncMutex::new(HashMap::new())),
            git_fetch_worker_started: Arc::new(AsyncMutex::new(false)),
            active_git_projects: Arc::new(AsyncMutex::new(HashMap::new())),
            cw_workers: Arc::new(AsyncMutex::new(HashMap::new())),
            watchers: Arc::new(AsyncMutex::new(HashMap::new())),
            sys_monitor: Arc::new(std::sync::Mutex::new(sysinfo::System::new_all())),
        }
    }
}

/// Sends graceful-shutdown to a ServerHandle (best-effort; does not wait).
fn shutdown_server(handle: ServerHandle) {
    let _ = handle.shutdown_tx.send(());
    // Abort as fallback in case the graceful shutdown stalls.
    handle.join.abort();
}

/// Detiene proxy, file server y todos los servicios activos.
pub async fn stop_background_work(state: &AppState) {
    {
        let mut guard = state.proxy_abort.lock().await;
        if let Some(h) = guard.take() { shutdown_server(h); }
    }
    {
        let mut guard = state.file_server_abort.lock().await;
        if let Some(h) = guard.take() { shutdown_server(h); }
    }
    {
        let mut guard = state.coverage_server_abort.lock().await;
        if let Some(h) = guard.take() { shutdown_server(h); }
    }
    {
        let mut procs = state.processes.lock().await;
        for tracked in procs.values() {
            tracked.notify.notify_waiters();
        }
        procs.clear();
    }
    {
        let mut w = state.watchers.lock().await;
        for (_, tx) in w.drain() {
            let _ = tx.send(());
        }
    }
}

/// Kill all tracked child processes synchronously (safe to call from non-async exit handlers).
pub fn kill_all_pids_sync(state: &AppState) {
    // Collect PIDs from the processes map (best-effort via try_lock)
    let pids: Vec<u32> = state.processes
        .try_lock()
        .ok()
        .map(|g| g.values().map(|tp| tp.pid).collect())
        .unwrap_or_default();
    for pid in pids {
        crate::system::process_killer::kill_tree_unix_pub(pid);
    }
}

