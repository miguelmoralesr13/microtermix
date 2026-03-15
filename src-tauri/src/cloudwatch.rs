use serde::{Deserialize, Serialize};

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct CwCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

async fn logs_client(c: &CwCredentials) -> aws_sdk_cloudwatchlogs::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        token, None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load().await;
    aws_sdk_cloudwatchlogs::Client::new(&cfg)
}

async fn metrics_client(c: &CwCredentials) -> aws_sdk_cloudwatch::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        token, None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load().await;
    aws_sdk_cloudwatch::Client::new(&cfg)
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LogGroup {
    pub name: String,
    pub stored_bytes: i64,
}

#[derive(Debug, Serialize)]
pub struct LogStream {
    pub name: String,
    pub last_event_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct LogEvent {
    pub timestamp: i64,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct LogEventsResult {
    pub events: Vec<LogEvent>,
    pub next_forward_token: Option<String>,
    pub next_backward_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DimensionItem {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct MetricItem {
    pub namespace: String,
    pub metric_name: String,
    pub dimensions: Vec<DimensionItem>,
}

#[derive(Debug, Serialize)]
pub struct MetricDatapoint {
    pub timestamp: i64,
    pub value: f64,
}

// ── Error Formatters ──────────────────────────────────────────────────────────

fn format_logs_err<E, R>(e: aws_sdk_cloudwatchlogs::error::SdkError<E, R>) -> String
where
    E: aws_sdk_cloudwatchlogs::error::ProvideErrorMetadata,
{
    match e.as_service_error() {
        Some(err) => {
            let code = err.code().unwrap_or("UnknownAWSCode");
            let msg = err.message().unwrap_or("No detailed message from AWS");
            format!("{}: {}", code, msg)
        }
        None => e.to_string(),
    }
}

fn format_metrics_err<E, R>(e: aws_sdk_cloudwatch::error::SdkError<E, R>) -> String
where
    E: aws_sdk_cloudwatch::error::ProvideErrorMetadata,
{
    match e.as_service_error() {
        Some(err) => {
            let code = err.code().unwrap_or("UnknownAWSCode");
            let msg = err.message().unwrap_or("No detailed message from AWS");
            format!("{}: {}", code, msg)
        }
        None => e.to_string(),
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cw_get_log_groups(
    credentials: CwCredentials,
    pattern: Option<String>,
) -> Result<Vec<LogGroup>, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.describe_log_groups().limit(50);
    if let Some(p) = pattern.filter(|s| !s.is_empty()) {
        req = req.log_group_name_pattern(p);
    }
    let resp = req.send().await.map_err(format_logs_err)?;
    Ok(resp.log_groups().iter()
        .filter_map(|g| g.log_group_name().map(|n| LogGroup {
            name: n.to_string(),
            stored_bytes: g.stored_bytes().unwrap_or(0),
        }))
        .collect())
}

#[tauri::command]
pub async fn cw_get_log_streams(
    credentials: CwCredentials,
    log_group: String,
    prefix: Option<String>,
) -> Result<Vec<LogStream>, String> {
    use aws_sdk_cloudwatchlogs::types::OrderBy;
    let client = logs_client(&credentials).await;
    let mut req = client.describe_log_streams()
        .log_group_name(&log_group)
        .limit(50);
    
    if let Some(p) = prefix.filter(|s| !s.is_empty()) {
        req = req.log_stream_name_prefix(p);
    } else {
        req = req.order_by(OrderBy::LastEventTime).descending(true);
    }
    
    let resp = req.send().await.map_err(format_logs_err)?;
    Ok(resp.log_streams().iter()
        .filter_map(|s| s.log_stream_name().map(|n| LogStream {
            name: n.to_string(),
            last_event_ms: s.last_event_timestamp(),
        }))
        .collect())
}

#[tauri::command]
pub async fn cw_get_log_events(
    credentials: CwCredentials,
    log_group: String,
    stream: String,
    next_token: Option<String>,
    start_ms: Option<i64>,
) -> Result<LogEventsResult, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.get_log_events()
        .log_group_name(&log_group)
        .log_stream_name(&stream)
        .start_from_head(false)
        .limit(200);
    if let Some(t) = next_token {
        req = req.next_token(t);
    } else if let Some(ms) = start_ms {
        req = req.start_time(ms);
    }
    let resp = req.send().await.map_err(format_logs_err)?;
    let events = resp.events().iter()
        .filter_map(|e| e.message().map(|m| LogEvent {
            timestamp: e.timestamp().unwrap_or(0),
            message: m.trim_end_matches('\n').to_string(),
        }))
        .collect();
    Ok(LogEventsResult {
        events,
        next_forward_token: resp.next_forward_token().map(|t| t.to_string()),
        next_backward_token: resp.next_backward_token().map(|t| t.to_string()),
    })
}

#[tauri::command]
pub async fn cw_filter_log_events(
    credentials: CwCredentials,
    log_group: String,
    filter_pattern: Option<String>,
    next_token: Option<String>,
    start_ms: Option<i64>,
) -> Result<LogEventsResult, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.filter_log_events()
        .log_group_name(&log_group)
        .limit(100);
    
    if let Some(p) = filter_pattern.filter(|s| !s.is_empty()) {
        req = req.filter_pattern(p);
    }
    if let Some(t) = next_token {
        req = req.next_token(t);
    } else if let Some(ms) = start_ms {
        req = req.start_time(ms);
    }

    let resp = req.send().await.map_err(format_logs_err)?;
    let events = resp.events().iter()
        .filter_map(|e| e.message().map(|m| LogEvent {
            timestamp: e.timestamp().unwrap_or(0),
            message: m.trim_end_matches('\n').to_string(),
        }))
        .collect();
    
    Ok(LogEventsResult {
        events,
        next_forward_token: resp.next_token().map(|t| t.to_string()), // In FilterLogEvents it's just 'next_token' (bidirectional depending on start_time)
        next_backward_token: None, // Simplified for now
    })
}

#[tauri::command]
pub async fn cw_list_metrics(
    credentials: CwCredentials,
    namespace: Option<String>,
    metric_name: Option<String>,
) -> Result<Vec<MetricItem>, String> {
    let client = metrics_client(&credentials).await;
    let mut req = client.list_metrics();
    if let Some(ns) = namespace.filter(|s| !s.is_empty()) {
        req = req.namespace(ns);
    }
    if let Some(mn) = metric_name.filter(|s| !s.is_empty()) {
        req = req.metric_name(mn);
    }
    let resp = req.send().await.map_err(format_metrics_err)?;
    Ok(resp.metrics().iter()
        .filter_map(|m| {
            let ns = m.namespace()?.to_string();
            let name = m.metric_name()?.to_string();
            let dims = m.dimensions().iter()
                .map(|d| DimensionItem {
                    name: d.name().unwrap_or_default().to_string(),
                    value: d.value().unwrap_or_default().to_string(),
                })
                .collect();
            Some(MetricItem { namespace: ns, metric_name: name, dimensions: dims })
        })
        .collect())
}

#[tauri::command]
pub async fn cw_get_metric_data(
    credentials: CwCredentials,
    namespace: String,
    metric_name: String,
    dimensions: Vec<DimensionItem>,
    stat: String,
    period_secs: i32,
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<MetricDatapoint>, String> {
    use aws_sdk_cloudwatch::types::{Dimension, Metric, MetricDataQuery, MetricStat};
    use aws_sdk_cloudwatch::primitives::DateTime;

    let client = metrics_client(&credentials).await;

    let dims: Vec<Dimension> = dimensions.iter()
        .map(|d| Dimension::builder().name(&d.name).value(&d.value).build())
        .collect();

    let metric = Metric::builder()
        .namespace(&namespace)
        .metric_name(&metric_name)
        .set_dimensions(Some(dims))
        .build();

    let metric_stat = MetricStat::builder()
        .metric(metric)
        .period(period_secs)
        .stat(&stat)
        .build();

    let query = MetricDataQuery::builder()
        .id("m1")
        .metric_stat(metric_stat)
        .return_data(true)
        .build();

    let resp = client.get_metric_data()
        .start_time(DateTime::from_millis(start_ms))
        .end_time(DateTime::from_millis(end_ms))
        .metric_data_queries(query)
        .send()
        .await
        .map_err(format_metrics_err)?;

    let points = resp.metric_data_results()
        .first()
        .map(|r| {
            let mut pairs: Vec<_> = r.timestamps().iter()
                .zip(r.values().iter())
                .map(|(t, v)| MetricDatapoint {
                    timestamp: t.to_millis().unwrap_or(0),
                    value: *v,
                })
                .collect();
            pairs.sort_by_key(|p| p.timestamp);
            pairs
        })
        .unwrap_or_default();

    Ok(points)
}

// ── Smart Live Tail Worker ────────────────────────────────────────────────────

#[tauri::command]
pub async fn cw_stop_tail(
    state: tauri::State<'_, crate::AppState>,
    worker_id: String,
) -> Result<(), String> {
    let mut workers = state.cw_workers.lock().await;
    if let Some(tx) = workers.remove(&worker_id) {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn cw_start_tail(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    credentials: CwCredentials,
    log_group: String,
    filter_pattern: Option<String>,
    worker_id: String,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::sync::oneshot;
    use std::collections::HashSet;

    // 1. Kill existing worker with same ID
    {
        let mut workers = state.cw_workers.lock().await;
        if let Some(tx) = workers.remove(&worker_id) {
            let _ = tx.send(());
        }
    }

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    {
        let mut workers = state.cw_workers.lock().await;
        workers.insert(worker_id.clone(), stop_tx);
    }

    let app_handle = app.clone();
    let wid = worker_id.clone();
    let lg = log_group.clone();
    let fp = filter_pattern.clone();

    tokio::spawn(async move {
        let client = logs_client(&credentials).await;
        let mut last_timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64 - 5000; // Start from 5 seconds ago

        let mut sleep_ms = 1000;
        let mut seen_ids = HashSet::new();
        let mut no_data_ticks = 0;

        loop {
            // Check for stop signal
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let mut req = client.filter_log_events()
                .log_group_name(&lg)
                .start_time(last_timestamp + 1)
                .limit(100);

            if let Some(p) = &fp {
                if !p.is_empty() {
                    req = req.filter_pattern(p);
                }
            }

            match req.send().await {
                Ok(resp) => {
                    let events: Vec<LogEvent> = resp.events().iter()
                        .filter_map(|e| {
                            let id = e.event_id().unwrap_or_default().to_string();
                            if id.is_empty() || seen_ids.contains(&id) {
                                return None;
                            }
                            
                            // Keep last 200 IDs for deduplication
                            seen_ids.insert(id);
                            if seen_ids.len() > 200 {
                                // Simple way to clear oldest: if it grows too much, reset.
                                // A VecDeque would be better for a proper sliding window.
                                if seen_ids.len() > 500 { seen_ids.clear(); }
                            }

                            let ts = e.timestamp().unwrap_or(0);
                            if ts > last_timestamp {
                                last_timestamp = ts;
                            }

                            Some(LogEvent {
                                timestamp: ts,
                                message: e.message().map(|m| m.trim_end_matches('\n').to_string()).unwrap_or_default(),
                            })
                        })
                        .collect();

                    if !events.is_empty() {
                        let _ = app_handle.emit(&format!("cw-logs-{}", wid), &events);
                        sleep_ms = 1000; // Reset to fast polling
                        no_data_ticks = 0;
                    } else {
                        no_data_ticks += 1;
                        // Adaptive Decay
                        if no_data_ticks > 120 { // 2 mins at 1s
                            sleep_ms = 5000;
                        }
                        if no_data_ticks > 600 { // 10 mins (approx)
                            sleep_ms = 30000;
                        }
                    }
                }
                Err(e) => {
                    let err_msg = format_logs_err(e);
                    let _ = app_handle.emit(&format!("cw-logs-error-{}", wid), err_msg);
                    tokio::time::sleep(tokio::time::Duration::from_millis(5000)).await;
                    continue;
                }
            }

            tokio::select! {
                _ = &mut stop_rx => break,
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)) => {}
            }
        }
    });

    Ok(())
}
