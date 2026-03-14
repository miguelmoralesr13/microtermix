use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as AsyncMutex;

/// Handle para un servidor Axum con apagado ordenado.
pub struct ServerHandle {
    pub shutdown_tx: tokio::sync::oneshot::Sender<()>,
    pub join: tokio::task::JoinHandle<()>,
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
    pub processes: Arc<AsyncMutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    pub pipelines: Arc<AsyncMutex<HashMap<String, PipelineState>>>,
    /// PIDs of active child processes — uses a std Mutex so it can be read synchronously on exit.
    pub process_pids: Arc<std::sync::Mutex<HashMap<String, u32>>>,
    pub stdin_senders: Arc<AsyncMutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<String>>>>,
    pub pty_resizers: Arc<AsyncMutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<(u16, u16)>>>>,
    pub proxy_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub file_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub coverage_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub pending_workspace_by_label: Arc<AsyncMutex<HashMap<String, String>>>,
    pub git_watchers: Arc<AsyncMutex<HashMap<String, Box<dyn std::any::Any + Send + Sync>>>>,
    pub git_fetch_worker_started: Arc<AsyncMutex<bool>>,
    pub active_git_projects: Arc<AsyncMutex<HashMap<String, String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(AsyncMutex::new(HashMap::new())),
            pipelines: Arc::new(AsyncMutex::new(HashMap::new())),
            process_pids: Arc::new(std::sync::Mutex::new(HashMap::new())),
            stdin_senders: Arc::new(AsyncMutex::new(HashMap::new())),
            pty_resizers: Arc::new(AsyncMutex::new(HashMap::new())),
            proxy_abort: Arc::new(AsyncMutex::new(None)),
            file_server_abort: Arc::new(AsyncMutex::new(None)),
            coverage_server_abort: Arc::new(AsyncMutex::new(None)),
            pending_workspace_by_label: Arc::new(AsyncMutex::new(HashMap::new())),
            git_watchers: Arc::new(AsyncMutex::new(HashMap::new())),
            git_fetch_worker_started: Arc::new(AsyncMutex::new(false)),
            active_git_projects: Arc::new(AsyncMutex::new(HashMap::new())),
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
        for notify in procs.values() {
            notify.notify_waiters();
        }
        procs.clear();
    }
}

/// Kill all tracked child processes synchronously (safe to call from non-async exit handlers).
pub fn kill_all_pids_sync(state: &AppState) {
    let pids: Vec<u32> = state.process_pids
        .lock()
        .map(|g| g.values().copied().collect())
        .unwrap_or_default();
    for pid in pids {
        crate::processes::kill_tree_unix_pub(pid);
    }
}

