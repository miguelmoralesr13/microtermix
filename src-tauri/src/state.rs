use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex as AsyncMutex;

/// Handle para un servidor Axum con apagado ordenado.
pub struct ServerHandle {
    pub shutdown_tx: tokio::sync::oneshot::Sender<()>,
    pub join: tokio::task::JoinHandle<()>,
}

/// Estado compartido de la aplicación backend.
pub struct AppState {
    pub processes: Arc<AsyncMutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    pub stdin_senders: Arc<AsyncMutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<String>>>>,
    pub proxy_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub file_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub coverage_server_abort: Arc<AsyncMutex<Option<ServerHandle>>>,
    pub pending_workspace_by_label: Arc<AsyncMutex<HashMap<String, String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(AsyncMutex::new(HashMap::new())),
            stdin_senders: Arc::new(AsyncMutex::new(HashMap::new())),
            proxy_abort: Arc::new(AsyncMutex::new(None)),
            file_server_abort: Arc::new(AsyncMutex::new(None)),
            coverage_server_abort: Arc::new(AsyncMutex::new(None)),
            pending_workspace_by_label: Arc::new(AsyncMutex::new(HashMap::new())),
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

