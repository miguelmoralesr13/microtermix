use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex as AsyncMutex;

/// Estado compartido de la aplicación backend.
pub struct AppState {
    pub processes: Arc<AsyncMutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    pub proxy_abort: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>,
    pub file_server_abort: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>,
    pub coverage_server_abort: Arc<AsyncMutex<Option<tokio::task::JoinHandle<()>>>>,
    pub pending_workspace_by_label: Arc<AsyncMutex<HashMap<String, String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(AsyncMutex::new(HashMap::new())),
            proxy_abort: Arc::new(AsyncMutex::new(None)),
            file_server_abort: Arc::new(AsyncMutex::new(None)),
            coverage_server_abort: Arc::new(AsyncMutex::new(None)),
            pending_workspace_by_label: Arc::new(AsyncMutex::new(HashMap::new())),
        }
    }
}

/// Detiene proxy, file server y todos los servicios activos.
pub async fn stop_background_work(state: &AppState) {
    {
        let mut guard = state.proxy_abort.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }
    {
        let mut guard = state.file_server_abort.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }
    {
        let mut guard = state.coverage_server_abort.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }
    {
        let mut procs = state.processes.lock().await;
        for notify in procs.values() {
            notify.notify_waiters();
        }
        procs.clear();
    }
}

