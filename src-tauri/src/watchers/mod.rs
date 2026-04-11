pub mod jenkins;
pub mod github_actions;

use serde_json::Value;
use tauri::State;

use crate::state::AppState;

/// Starts a background watcher that polls an external service on a configurable interval
/// and pushes state changes to the frontend via Tauri events.
///
/// Idempotent: if a watcher with the same `watcher_id` is already running, it is stopped
/// before the new one is started.
///
/// `watcher_id` format: `"{type}::{account_id}"` e.g. `"jenkins_favorites::uuid"`
#[tauri::command]
pub async fn start_watcher(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    watcher_id: String,
    watcher_type: String,
    config: Value,
    interval_ms: u64,
) -> Result<(), String> {
    // Kill existing worker with same ID (idempotent restart).
    {
        let mut watchers = state.watchers.lock().await;
        if let Some(tx) = watchers.remove(&watcher_id) {
            let _ = tx.send(());
        }
    }

    match watcher_type.as_str() {
        "jenkins" => {
            let cfg: jenkins::JenkinsWatcherConfig =
                serde_json::from_value(config).map_err(|e| e.to_string())?;
            jenkins::spawn(app, state.watchers.clone(), watcher_id, cfg, interval_ms).await
        }
        "github_actions" => {
            let cfg: github_actions::GitHubActionsWatcherConfig =
                serde_json::from_value(config).map_err(|e| e.to_string())?;
            github_actions::spawn(app, state.watchers.clone(), watcher_id, cfg, interval_ms).await
        }
        // Future watcher types: add a new file + one arm here.
        // e.g. "git_status" => git_status::spawn(...).await,
        _ => Err(format!("Unknown watcher type: {}", watcher_type)),
    }
}

/// Stops a running watcher by ID. No-op if the watcher is not found.
#[tauri::command]
pub async fn stop_watcher(
    state: State<'_, AppState>,
    watcher_id: String,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().await;
    if let Some(tx) = watchers.remove(&watcher_id) {
        let _ = tx.send(());
    }
    Ok(())
}

/// Stops all active watchers. Called on workspace close or account reset.
#[tauri::command]
pub async fn stop_all_watchers(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut watchers = state.watchers.lock().await;
    for (_, tx) in watchers.drain() {
        let _ = tx.send(());
    }
    Ok(())
}
