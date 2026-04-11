use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine as _;
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Mutex as AsyncMutex;

/// Config passed from frontend as the `config` param to `start_watcher`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsWatcherConfig {
    pub base_url: String,
    pub user: String,
    pub token: String,
    /// Full job URLs (e.g. "https://jenkins.example.com/job/my-pipeline/")
    pub job_urls: Vec<String>,
    /// Account ID from Jenkins store
    pub account_id: String,
}

/// Internal snapshot for change detection — never leaves the Rust process.
#[derive(Debug, Clone, PartialEq)]
struct JenkinsJobSnapshot {
    color: String,
    last_build_number: Option<i64>,
    building: bool,
}

/// Per-job entry in the emitted event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobStatus {
    pub url: String,
    pub color: String,
    pub last_build_number: Option<i64>,
    pub last_build_result: Option<String>,
    pub building: bool,
    pub estimated_duration: Option<i64>,
    pub timestamp: Option<i64>,
}

/// Emitted to frontend when any job state changes.
/// Event name: `jenkins-status-update::{watcher_id}`
/// Only `changed_jobs` is populated — unchanged jobs are omitted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsStatusUpdateEvent {
    pub watcher_id: String,
    pub account_id: String,
    pub changed_jobs: Vec<JenkinsJobStatus>,
}

/// Spawns a background Jenkins watcher task.
/// The cancel sender is stored in the `watchers` map under `watcher_id`.
pub async fn spawn(
    app: tauri::AppHandle,
    watchers: Arc<AsyncMutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    watcher_id: String,
    config: JenkinsWatcherConfig,
    interval_ms: u64,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut w = watchers.lock().await;
        w.insert(watcher_id.clone(), stop_tx);
    }

    let auth_value = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", config.user, config.token))
    );

    let tree = "url,color,_class,lastBuild[number,url,result,duration,timestamp,building,estimatedDuration]";

    tokio::spawn(async move {
        let mut snapshot: HashMap<String, JenkinsJobSnapshot> = HashMap::new();

        loop {
            // Check stop signal before doing any work.
            if stop_rx.try_recv().is_ok() {
                break;
            }

            // Build and execute all fetch futures in parallel.
            let fetches: Vec<_> = config.job_urls.iter().map(|url| {
                let client = client.clone();
                let auth = auth_value.clone();
                // Ensure exactly one trailing slash before appending api/json.
                let api_url = format!(
                    "{}/api/json?tree={}",
                    url.trim_end_matches('/'),
                    tree
                );
                async move {
                    client
                        .get(&api_url)
                        .header("Authorization", auth)
                        .send()
                        .await
                        .map_err(|e| e.to_string())?
                        .json::<serde_json::Value>()
                        .await
                        .map_err(|e| e.to_string())
                }
            }).collect();

            let results = join_all(fetches).await;

            let mut all_ok = true;
            let mut changed: Vec<JenkinsJobStatus> = Vec::new();

            for result in results {
                match result {
                    Ok(json) => {
                        // Normalize URL: ensure trailing slash.
                        let raw_url = json["url"].as_str().unwrap_or_default().to_string();
                        let url = if raw_url.ends_with('/') {
                            raw_url
                        } else {
                            raw_url + "/"
                        };

                        let color = json["color"].as_str().unwrap_or("grey").to_string();
                        let last_build = &json["lastBuild"];
                        let last_build_number = last_build["number"].as_i64();
                        let building = last_build["building"].as_bool().unwrap_or(false);

                        let current = JenkinsJobSnapshot {
                            color: color.clone(),
                            last_build_number,
                            building,
                        };

                        // First-seen jobs are always included (prev is None → is_changed = true).
                        let is_changed = snapshot.get(&url).map_or(true, |p| p != &current);

                        if is_changed {
                            snapshot.insert(url.clone(), current);
                            changed.push(JenkinsJobStatus {
                                url,
                                color,
                                last_build_number,
                                last_build_result: last_build["result"]
                                    .as_str()
                                    .map(String::from),
                                building,
                                estimated_duration: last_build["estimatedDuration"].as_i64(),
                                timestamp: last_build["timestamp"].as_i64(),
                            });
                        }
                    }
                    Err(_) => {
                        all_ok = false;
                    }
                }
            }

            let sleep_ms = if !all_ok {
                // Error backoff: 3× interval, capped at 60 seconds. Emit nothing.
                interval_ms.saturating_mul(3).min(60_000)
            } else {
                if !changed.is_empty() {
                    let event = JenkinsStatusUpdateEvent {
                        watcher_id: watcher_id.clone(),
                        account_id: config.account_id.clone(),
                        changed_jobs: changed,
                    };
                    let event_name = format!("jenkins-status-update::{}", watcher_id);
                    let _ = app.emit(&event_name, &event);
                }
                interval_ms
            };

            tokio::select! {
                _ = &mut stop_rx => break,
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)) => {}
            }
        }
    });

    Ok(())
}
