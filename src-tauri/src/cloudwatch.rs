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
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        c.session_token.clone(), None, "microtermix",
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
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        c.session_token.clone(), None, "microtermix",
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

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cw_get_log_groups(
    credentials: CwCredentials,
    prefix: Option<String>,
) -> Result<Vec<LogGroup>, String> {
    let client = logs_client(&credentials).await;
    let mut req = client.describe_log_groups().limit(50);
    if let Some(p) = prefix.filter(|s| !s.is_empty()) {
        req = req.log_group_name_prefix(p);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
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
        .order_by(OrderBy::LastEventTime)
        .descending(true)
        .limit(50);
    if let Some(p) = prefix.filter(|s| !s.is_empty()) {
        req = req.log_stream_name_prefix(p);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
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
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let events = resp.events().iter()
        .filter_map(|e| e.message().map(|m| LogEvent {
            timestamp: e.timestamp().unwrap_or(0),
            message: m.trim_end_matches('\n').to_string(),
        }))
        .collect();
    Ok(LogEventsResult {
        events,
        next_forward_token: resp.next_forward_token().map(|t| t.to_string()),
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
    let resp = req.send().await.map_err(|e| e.to_string())?;
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
        .map_err(|e| e.to_string())?;

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
