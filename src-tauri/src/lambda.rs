use serde::{Deserialize, Serialize};
use aws_sdk_lambda::primitives::Blob;
use aws_sdk_lambda::types::{InvocationType, LogType};
use base64::{engine::general_purpose, Engine};
use crate::ec2::Ec2Credentials;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LambdaFunction {
    pub function_name: String,
    pub function_arn: String,
    pub runtime: Option<String>,
    pub role: String,
    pub handler: Option<String>,
    pub code_size: i64,
    pub description: Option<String>,
    pub timeout: Option<i32>,
    pub memory_size: Option<i32>,
    pub last_modified: String,
    pub state: Option<String>,
    pub version: String,
    pub environment: Vec<(String, String)>,
}

async fn lambda_client(c: &Ec2Credentials) -> aws_sdk_lambda::Client {
    let config = crate::ec2::aws_config(c).await;
    aws_sdk_lambda::Client::new(&config)
}

// Standard list functions with local filter

#[tauri::command]
pub async fn lambda_list_functions(
    credentials: Ec2Credentials,
    search_term: Option<String>,
) -> Result<Vec<LambdaFunction>, String> {
    crate::app_logs::log_info("Lambda", "Listando funciones de AWS...");

    // Fallback path: Standard paginated list (Optimized without heavy fields) 
    let client = lambda_client(&credentials).await;
    
    let mut functions = Vec::new();
    let max_to_fetch = if search_term.is_some() { 1000 } else { 50 };
    let st_lower = search_term.as_ref().map(|s| s.to_lowercase());

    let mut pager = client.list_functions()
        .max_items(50)
        .into_paginator()
        .items()
        .send();

    while let Some(item) = pager.next().await {
        let f = item.map_err(|e| {
            let msg = format!("Lambda: Error paginando funciones: {}", e);
            crate::app_logs::log_error("Lambda", &msg);
            msg
        })?;

        let name = f.function_name().unwrap_or_default();
        
        // Filter by search term if provided
        if let Some(st) = &st_lower {
            if !name.to_lowercase().contains(st) {
                continue;
            }
        }

        functions.push(LambdaFunction {
            function_name: name.to_string(),
            function_arn: f.function_arn().unwrap_or_default().to_string(),
            runtime: f.runtime().map(|r| r.as_str().to_string()),
            role: f.role().unwrap_or_default().to_string(),
            handler: f.handler().map(|h| h.to_string()),
            code_size: f.code_size(),
            description: f.description().map(|d| d.to_string()),
            timeout: f.timeout(),
            memory_size: f.memory_size(),
            last_modified: f.last_modified().unwrap_or_default().to_string(),
            state: f.state().map(|s| s.as_str().to_string()),
            version: f.version().unwrap_or_default().to_string(),
            environment: vec![], // Exclude for performance, fetched via GetFunction
        });

        if functions.len() >= max_to_fetch {
            break;
        }
    }

    Ok(functions)
}

#[tauri::command]
pub async fn lambda_get_function(
    credentials: Ec2Credentials,
    function_name: String,
) -> Result<LambdaFunction, String> {
    let client = lambda_client(&credentials).await;
    
    let resp = client.get_function().function_name(&function_name).send().await.map_err(|e| {
        let msg = format!("Lambda: Error obteniendo función {}: {}", function_name, e);
        crate::app_logs::log_error("Lambda", &msg);
        msg
    })?;

    let f = resp.configuration().ok_or_else(|| "No se encontró la configuración de la función".to_string())?;
    
    let env_vars = f.environment().and_then(|e| e.variables()).map(|vars| {
        vars.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }).unwrap_or_default();

    Ok(LambdaFunction {
        function_name: f.function_name().unwrap_or_default().to_string(),
        function_arn: f.function_arn().unwrap_or_default().to_string(),
        runtime: f.runtime().map(|r| r.as_str().to_string()),
        role: f.role().unwrap_or_default().to_string(),
        handler: f.handler().map(|h| h.to_string()),
        code_size: f.code_size(),
        description: f.description().map(|d| d.to_string()),
        timeout: f.timeout(),
        memory_size: f.memory_size(),
        last_modified: f.last_modified().unwrap_or_default().to_string(),
        state: f.state().map(|s| s.as_str().to_string()),
        version: f.version().unwrap_or_default().to_string(),
        environment: env_vars,
    })
}

// ─── Invoke ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LambdaInvokeResult {
    pub status_code: i32,
    pub function_error: Option<String>,
    pub log_tail: Option<String>,
    pub payload: String,
    pub executed_version: Option<String>,
    /// Parsed from log tail REPORT line
    pub duration_ms: Option<f64>,
    pub billed_duration_ms: Option<f64>,
    pub max_memory_used_mb: Option<f64>,
}

fn parse_report_metrics(log: &str) -> (Option<f64>, Option<f64>, Option<f64>) {
    // REPORT RequestId: xxx  Duration: 12.34 ms  Billed Duration: 13 ms  Memory Size: 128 MB  Max Memory Used: 67 MB
    let get = |key: &str, suffix: &str| -> Option<f64> {
        let start = log.find(key)? + key.len();
        let rest = log[start..].trim_start();
        let end = rest.find(suffix)?.min(rest.find('\t').unwrap_or(usize::MAX));
        rest[..end].trim().parse::<f64>().ok()
    };
    (
        get("Duration: ", " ms"),
        get("Billed Duration: ", " ms"),
        get("Max Memory Used: ", " MB"),
    )
}

#[tauri::command]
pub async fn lambda_invoke(
    credentials: Ec2Credentials,
    function_name: String,
    payload: String,
    invocation_type: Option<String>,
) -> Result<LambdaInvokeResult, String> {
    let client = lambda_client(&credentials).await;

    let inv_type = match invocation_type.as_deref().unwrap_or("RequestResponse") {
        "Event"  => InvocationType::Event,
        "DryRun" => InvocationType::DryRun,
        _        => InvocationType::RequestResponse,
    };

    let resp = client.invoke()
        .function_name(&function_name)
        .payload(Blob::new(payload.as_bytes()))
        .invocation_type(inv_type)
        .log_type(LogType::Tail)
        .send()
        .await
        .map_err(|e| format!("Lambda invoke error: {e:?}"))?;

    let payload_bytes = resp.payload().map(|b| b.as_ref().to_vec()).unwrap_or_default();
    let payload_str   = String::from_utf8_lossy(&payload_bytes).to_string();

    let log_tail = resp.log_result()
        .and_then(|b64| general_purpose::STANDARD.decode(b64).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok());

    let (duration_ms, billed_duration_ms, max_memory_used_mb) = log_tail
        .as_deref()
        .map(parse_report_metrics)
        .unwrap_or((None, None, None));

    Ok(LambdaInvokeResult {
        status_code: resp.status_code(),
        function_error: resp.function_error().map(String::from),
        log_tail,
        payload: payload_str,
        executed_version: resp.executed_version().map(String::from),
        duration_ms,
        billed_duration_ms,
        max_memory_used_mb,
    })
}

/// Invokes a Lambda through a local endpoint (SAM local / LocalStack / any AWS-compatible endpoint).
#[tauri::command]
pub async fn lambda_invoke_local(
    function_name: String,
    payload: String,
    endpoint_url: Option<String>,
    invocation_type: Option<String>,
) -> Result<LambdaInvokeResult, String> {
    use aws_config::Region;
    use aws_credential_types::Credentials;

    let endpoint = endpoint_url.unwrap_or_else(|| "http://localhost:3001".to_string());

    let creds = Credentials::new("test", "test", None, None, "local");
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new("us-east-1"))
        .endpoint_url(&endpoint)
        .behavior_version(aws_config::BehaviorVersion::latest())
        .load()
        .await;
    let client = aws_sdk_lambda::Client::new(&cfg);

    let inv_type = match invocation_type.as_deref().unwrap_or("RequestResponse") {
        "Event"  => InvocationType::Event,
        "DryRun" => InvocationType::DryRun,
        _        => InvocationType::RequestResponse,
    };

    let resp = client.invoke()
        .function_name(&function_name)
        .payload(Blob::new(payload.as_bytes()))
        .invocation_type(inv_type)
        .log_type(LogType::Tail)
        .send()
        .await
        .map_err(|e| format!("Lambda local invoke error: {e:?}"))?;

    let payload_bytes = resp.payload().map(|b| b.as_ref().to_vec()).unwrap_or_default();
    let payload_str   = String::from_utf8_lossy(&payload_bytes).to_string();

    let log_tail = resp.log_result()
        .and_then(|b64| general_purpose::STANDARD.decode(b64).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok());

    let (duration_ms, billed_duration_ms, max_memory_used_mb) = log_tail
        .as_deref()
        .map(parse_report_metrics)
        .unwrap_or((None, None, None));

    Ok(LambdaInvokeResult {
        status_code: resp.status_code(),
        function_error: resp.function_error().map(String::from),
        log_tail,
        payload: payload_str,
        executed_version: resp.executed_version().map(String::from),
        duration_ms,
        billed_duration_ms,
        max_memory_used_mb,
    })
}
