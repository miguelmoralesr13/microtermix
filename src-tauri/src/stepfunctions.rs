use aws_sdk_sfn::Client as SfnClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::cloudwatch::CwCredentials;

// ==========================================
// CLIENT BUILDER
// ==========================================

async fn sfn_client(c: &CwCredentials) -> SfnClient {
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
        .behavior_version(aws_config::BehaviorVersion::latest())
        .load().await;
    SfnClient::new(&cfg)
}

// ==========================================
// TYPES
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SfnMachine {
    pub arn: String,
    pub name: String,
    pub machine_type: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SfnExecution {
    pub execution_arn: String,
    pub name: String,
    pub status: String,
    pub start_date: i64,
    pub stop_date: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SfnStep {
    pub name: String,
    pub status: String, // "running", "succeeded", "failed"
    pub entered_at: i64,
    pub exited_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub cause: Option<String>,
    pub lambda_arn: Option<String>,
}

// ==========================================
// COMMANDS
// ==========================================

#[tauri::command]
pub async fn sfn_list_state_machines(credentials: CwCredentials) -> Result<Vec<SfnMachine>, String> {
    let client = sfn_client(&credentials).await;
    let res = client.list_state_machines()
        .max_results(50)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let machines = res.state_machines.into_iter().map(|m| SfnMachine {
        arn: m.state_machine_arn,
        name: m.name,
        machine_type: format!("{:?}", m.r#type),
        created_at: m.creation_date.secs() * 1000,
    }).collect();

    Ok(machines)
}

#[tauri::command]
pub async fn sfn_list_executions(credentials: CwCredentials, machine_arn: String) -> Result<Vec<SfnExecution>, String> {
    let client = sfn_client(&credentials).await;
    let res = client.list_executions()
        .state_machine_arn(machine_arn)
        .max_results(20)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let executions = res.executions.into_iter().map(|e| SfnExecution {
        execution_arn: e.execution_arn,
        name: e.name,
        status: format!("{:?}", e.status).to_uppercase(),
        start_date: e.start_date.secs() * 1000,
        stop_date: e.stop_date.map(|d| d.secs() * 1000),
    }).collect();

    Ok(executions)
}

#[tauri::command]
pub async fn sfn_get_execution_history(credentials: CwCredentials, execution_arn: String) -> Result<Vec<SfnStep>, String> {
    let client = sfn_client(&credentials).await;
    let mut history = Vec::new();
    let mut next_token: Option<String> = None;

    loop {
        let mut req = client.get_execution_history().execution_arn(&execution_arn);
        if let Some(token) = next_token {
            req = req.next_token(token);
        }

        let res = req.send().await.map_err(|e| e.to_string())?;
        history.extend(res.events);
        next_token = res.next_token;

        if next_token.is_none() {
            break;
        }
    }

    // Aggregation logic
    let mut steps_map: HashMap<String, SfnStep> = HashMap::new();
    let mut steps_order: Vec<String> = Vec::new();

    // Mapping from event ID to state name to handle task/lambda failures
    let mut id_to_state: HashMap<i64, String> = HashMap::new();

    for event in history {
        let timestamp = event.timestamp.to_millis().expect("invalid timestamp");
        let id = event.id;

        if let Some(details) = event.state_entered_event_details {
            let name = details.name;
            let input = details.input.unwrap_or_default();
            
            let step = SfnStep {
                name: name.clone(),
                status: "running".to_string(),
                entered_at: timestamp,
                exited_at: None,
                duration_ms: None,
                input,
                output: None,
                error: None,
                cause: None,
                lambda_arn: None,
            };
            steps_map.insert(name.clone(), step);
            steps_order.push(name.clone());
            id_to_state.insert(id, name);
        } else if let Some(details) = event.state_exited_event_details {
            let name = details.name;
            if let Some(step) = steps_map.get_mut(&name) {
                step.status = "succeeded".to_string();
                step.exited_at = Some(timestamp);
                step.duration_ms = Some(timestamp - step.entered_at);
                step.output = details.output;
            }
        } else if let Some(details) = event.lambda_function_scheduled_event_details {
            // Map this event to the current state
            if let Some(last_state) = steps_order.last() {
                if let Some(step) = steps_map.get_mut(last_state) {
                    step.lambda_arn = Some(details.resource);
                }
                id_to_state.insert(id, last_state.clone());
            }
        } else if let Some(details) = event.lambda_function_failed_event_details {
            // Find which state this belongs to
            if let Some(state_name) = id_to_state.get(&event.previous_event_id) {
                if let Some(step) = steps_map.get_mut(state_name) {
                    step.status = "failed".to_string();
                    step.error = details.error;
                    step.cause = details.cause;
                }
            }
        } else if let Some(details) = event.task_failed_event_details {
             if let Some(state_name) = id_to_state.get(&event.previous_event_id) {
                if let Some(step) = steps_map.get_mut(state_name) {
                    step.status = "failed".to_string();
                    step.error = details.error;
                    step.cause = details.cause;
                }
            }
        } else if let Some(details) = event.execution_failed_event_details {
            // If the whole execution failed and the last step is still "running", mark it failed
            if let Some(last_state) = steps_order.last() {
                if let Some(step) = steps_map.get_mut(last_state) {
                    if step.status == "running" {
                        step.status = "failed".to_string();
                        step.error = details.error;
                        step.cause = details.cause;
                    }
                }
            }
        }
        
        // Track ID to state for other event types if needed
        if event.previous_event_id != 0 {
            if let Some(state_name) = id_to_state.get(&event.previous_event_id).cloned() {
                id_to_state.insert(id, state_name);
            }
        }
    }

    let result: Vec<SfnStep> = steps_order.into_iter()
        .filter_map(|name| steps_map.remove(&name))
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn sfn_start_execution(credentials: CwCredentials, machine_arn: String, input: String) -> Result<String, String> {
    let client = sfn_client(&credentials).await;
    let res = client.start_execution()
        .state_machine_arn(machine_arn)
        .input(input)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(res.execution_arn)
}
