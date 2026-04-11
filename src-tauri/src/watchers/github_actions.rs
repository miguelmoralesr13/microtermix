use std::collections::HashMap;
use std::sync::Arc;

use crate::app_logs;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Mutex as AsyncMutex;

/// Config passed from frontend. Owner/repo are pre-resolved on the frontend
/// using the cached `getOwnerRepo` helper to avoid a `git remote get-url` call in Rust.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubActionsWatcherConfig {
    pub token: String,
    /// GitHub API base URL (e.g. "https://api.github.com" or a GHE endpoint).
    pub api_url: String,
    pub owner: String,
    pub repo: String,
    /// Account ID — echoed back in the event payload for frontend matching.
    pub account_id: String,
}

/// Internal snapshot for change detection — never serialized.
#[derive(Debug, Clone, PartialEq)]
struct RunSnapshot {
    status: String,
    conclusion: Option<String>,
    updated_at: String,
}

/// Per-run entry in the emitted event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunUpdate {
    pub id: i64,
    pub status: String,
    pub conclusion: Option<String>,
    pub updated_at: String,
}

/// Emitted to frontend when any run's status or conclusion changes.
/// Event name: `github-actions-update::{watcher_id}`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubActionsUpdateEvent {
    pub watcher_id: String,
    pub account_id: String,
    /// Only runs that changed since the last poll.
    pub changed_runs: Vec<WorkflowRunUpdate>,
}

/// Spawns a background GitHub Actions watcher task.
pub async fn spawn(
    app: tauri::AppHandle,
    watchers: Arc<AsyncMutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    watcher_id: String,
    config: GitHubActionsWatcherConfig,
    interval_ms: u64,
) -> Result<(), String> {
    app_logs::log_info(
        "github-actions-watcher",
        &format!("Starting watcher for {}/{}", config.owner, config.repo),
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Microtermix/1.0.0")
        .build()
        .map_err(|e| e.to_string())?;

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut w = watchers.lock().await;
        w.insert(watcher_id.clone(), stop_tx);
    }

    let api_base = config.api_url.trim_end_matches('/').to_string();
    let runs_url = format!(
        "{}/repos/{}/{}/actions/runs?per_page=30",
        api_base, config.owner, config.repo
    );
    // Switch back to "token" to match frontend and classic PATs
    let auth_header = format!("token {}", config.token);

    tokio::spawn(async move {
        let mut snapshot: HashMap<i64, RunSnapshot> = HashMap::new();
        let mut poll_count = 0;

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            poll_count += 1;
            if poll_count % 10 == 0 {
                app_logs::log_debug(
                    "github-actions-watcher",
                    &format!("Heartbeat for {}/{} (poll #{})", config.owner, config.repo, poll_count),
                );
            }

            let response_result = client
                .get(&runs_url)
                .header("Authorization", &auth_header)
                .header("Accept", "application/vnd.github.v3+json")
                .send()
                .await;

            let sleep_ms = match response_result {
                Err(e) => {
                    app_logs::log_error("github-actions-watcher", &format!("Request failed: {}", e));
                    interval_ms.saturating_mul(3).min(60_000)
                }
                Ok(response) => {
                    // Check rate limit headers
                    if let Some(remaining) = response.headers().get("x-ratelimit-remaining") {
                        if let Ok(val) = remaining.to_str() {
                            if let Ok(num) = val.parse::<i32>() {
                                if num < 50 {
                                    app_logs::log_warn("github-actions-watcher", &format!("Low rate limit: {} remaining", num));
                                }
                            }
                        }
                    }

                    if !response.status().is_success() {
                        let status = response.status();
                        app_logs::log_error("github-actions-watcher", &format!("GitHub API error: {} - {}", status, runs_url));
                        interval_ms.saturating_mul(3).min(60_000)
                    } else {
                        let json_result = response
                            .json::<serde_json::Value>()
                            .await
                            .map_err(|e| e.to_string());

                        match json_result {
                            Err(e) => {
                                app_logs::log_error("github-actions-watcher", &format!("JSON parse failed: {}", e));
                                interval_ms.saturating_mul(3).min(60_000)
                            }
                            Ok(json) => {
                                let mut changed: Vec<WorkflowRunUpdate> = Vec::new();
                                let mut has_active_runs = false;

                                if let Some(runs) = json["workflow_runs"].as_array() {
                                    for run in runs {
                                        let id = match run["id"].as_i64() {
                                            Some(v) => v,
                                            None => continue,
                                        };
                                        let status = run["status"]
                                            .as_str()
                                            .unwrap_or("unknown")
                                            .to_string();
                                        
                                        if status == "in_progress" || status == "queued" || status == "waiting" {
                                            has_active_runs = true;
                                        }

                                        let conclusion = run["conclusion"]
                                            .as_str()
                                            .map(String::from);
                                        let updated_at = run["updated_at"]
                                            .as_str()
                                            .unwrap_or("")
                                            .to_string();

                                        let current = RunSnapshot {
                                            status: status.clone(),
                                            conclusion: conclusion.clone(),
                                            updated_at: updated_at.clone(),
                                        };

                                        let is_changed =
                                            snapshot.get(&id).map_or(true, |p| p != &current);

                                        if is_changed {
                                            snapshot.insert(id, current);
                                            changed.push(WorkflowRunUpdate {
                                                id,
                                                status,
                                                conclusion,
                                                updated_at,
                                            });
                                        }
                                    }
                                }

                                let any_changed = !changed.is_empty();

                                if any_changed {
                                    let event_name = format!("github-actions-update::{}", watcher_id);
                                    app_logs::log_info(
                                        "github-actions-watcher",
                                        &format!("Detected {} changed runs. Emitting: {}", changed.len(), event_name),
                                    );
                                    let event = GitHubActionsUpdateEvent {
                                        watcher_id: watcher_id.clone(),
                                        account_id: config.account_id.clone(),
                                        changed_runs: changed,
                                    };
                                    let _ = app.emit(&event_name, &event);
                                }

                                // Adaptive sleep: 3s if active/changed, 20s if idle.
                                if has_active_runs || any_changed {
                                    3_000
                                } else {
                                    20_000
                                }
                            }
                        }
                    }
                }
            };

            tokio::select! {
                _ = &mut stop_rx => break,
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)) => {}
            }
        }
        app_logs::log_info("github-actions-watcher", "Watcher stopped.");
    });

    Ok(())
}
