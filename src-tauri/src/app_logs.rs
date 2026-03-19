use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};
use std::sync::OnceLock;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppEventLevel {
    Info,
    Warn,
    Error,
    Debug,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLog {
    pub level: AppEventLevel,
    pub source: String, // e.g., "git-watcher", "proxy", "service-executor"
    pub message: String,
    pub timestamp: u128,
}

pub fn init_app_logs(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

pub fn log_internal(level: AppEventLevel, source: &str, message: &str) {
    if let Some(handle) = APP_HANDLE.get() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let log = AppLog {
            level,
            source: source.to_string(),
            message: message.to_string(),
            timestamp,
        };

        let _ = handle.emit("app-log-event", log);
    }
}

pub fn log_info(source: &str, message: &str) {
    log_internal(AppEventLevel::Info, source, message);
}

pub fn log_warn(source: &str, message: &str) {
    log_internal(AppEventLevel::Warn, source, message);
}

pub fn log_error(source: &str, message: &str) {
    log_internal(AppEventLevel::Error, source, message);
}

pub fn log_debug(source: &str, message: &str) {
    log_internal(AppEventLevel::Debug, source, message);
}
