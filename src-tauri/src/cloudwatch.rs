use serde::{Deserialize, Serialize};

// ── Credentials ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct CwCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub session_token: Option<String>,
}

// ── Client helpers ────────────────────────────────────────────────────────────

async fn logs_client(c: &CwCredentials) -> aws_sdk_cloudwatchlogs::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_cloudwatchlogs::Client::new(&cfg)
}

async fn metrics_client(c: &CwCredentials) -> aws_sdk_cloudwatch::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_cloudwatch::Client::new(&cfg)
}

// ── Placeholder command (replaced in Task 2) ─────────────────────────────────

#[tauri::command]
pub async fn cw_ping() -> &'static str {
    "ok"
}
