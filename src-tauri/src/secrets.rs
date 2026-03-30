use serde::{Deserialize, Serialize};
use crate::ec2::Ec2Credentials;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AwsSecret {
    pub name: String,
    pub description: Option<String>,
    pub last_modified: Option<i64>,
}

async fn secrets_client(c: &Ec2Credentials) -> aws_sdk_secretsmanager::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        token,
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_secretsmanager::Client::new(&cfg)
}

#[tauri::command]
pub async fn secrets_list_secrets(
    credentials: Ec2Credentials,
) -> Result<Vec<AwsSecret>, String> {
    let client = secrets_client(&credentials).await;
    let mut secrets = Vec::new();
    let mut next_token = None;

    loop {
        let mut req = client.list_secrets().max_results(50);
        if let Some(token) = next_token {
            req = req.set_next_token(Some(token));
        }

        let resp = req.send().await.map_err(|e| format!("ListSecrets: {e}"))?;
        
        for s in resp.secret_list() {
            secrets.push(AwsSecret {
                name: s.name().unwrap_or_default().to_string(),
                description: s.description().map(|d: &str| d.to_string()),
                last_modified: s.last_changed_date().or(s.last_accessed_date()).map(|d| d.secs()),
            });
        }

        next_token = resp.next_token().map(|t| t.to_string());
        if next_token.is_none() {
            break;
        }
    }

    Ok(secrets)
}

#[tauri::command]
pub async fn secrets_get_secret_value(
    credentials: Ec2Credentials,
    secret_id: String,
) -> Result<String, String> {
    let client = secrets_client(&credentials).await;
    let resp = client
        .get_secret_value()
        .secret_id(secret_id)
        .send()
        .await
        .map_err(|e| format!("GetSecretValue: {e}"))?;

    Ok(resp.secret_string().unwrap_or_default().to_string())
}
