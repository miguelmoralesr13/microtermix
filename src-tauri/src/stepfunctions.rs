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
// EXPRESS LOGS PARSING (CloudWatch -> SFN)
// ==========================================

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ExpressLogEvent {
    #[serde(rename = "type")]
    _event_type: String,
    _details: Option<serde_json::Value>,
    #[serde(alias = "execution_arn")]
    execution_arn: Option<String>,
    #[serde(alias = "event_timestamp")]
    event_timestamp: i64,
}

async fn cw_logs_client(c: &CwCredentials) -> aws_sdk_cloudwatchlogs::Client {
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

#[tauri::command]
pub async fn sfn_list_express_executions_from_logs(
    credentials: CwCredentials, 
    log_group: String
) -> Result<Vec<SfnExecution>, String> {
    let client = cw_logs_client(&credentials).await;
    
    // Buscamos eventos de inicio de ejecución en los últimos 7 días (aumentado de 24h)
    let start_time = (chrono::Utc::now() - chrono::Duration::days(7)).timestamp_millis();

    // Intentamos un patrón más flexible: que contenga ExecutionStarted o simplemente que tenga executionArn
    let res = client.filter_log_events()
        .log_group_name(log_group)
        .filter_pattern("ExecutionStarted") 
        .start_time(start_time)
        .limit(50)
        .send()
        .await
        .map_err(|e| format!("CW Logs Filter Error: {:?}", e))?;

    let mut executions = Vec::new();
    for event in res.events.unwrap_or_default() {
        if let Some(msg) = event.message {
            match serde_json::from_str::<ExpressLogEvent>(&msg) {
                Ok(log) => {
                    if let Some(arn) = log.execution_arn {
                        executions.push(SfnExecution {
                            execution_arn: arn.clone(),
                            name: arn.split(':').last().unwrap_or("ExpressExec").to_string(),
                            status: "EXPRESS".to_string(),
                            start_date: log.event_timestamp,
                            stop_date: None,
                        });
                    }
                },
                Err(e) => {
                    // Si falla el parseo estructural, intentamos una búsqueda manual simple
                    if msg.contains("executionArn") || msg.contains("execution_arn") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&msg) {
                             let arn = val["executionArn"].as_str()
                                .or_else(|| val["execution_arn"].as_str())
                                .map(|s| s.to_string());
                             
                             let ts = val["event_timestamp"].as_i64()
                                .or_else(|| val["eventTimestamp"].as_i64())
                                .unwrap_or_else(|| event.timestamp.unwrap_or(0));

                             if let Some(a) = arn {
                                executions.push(SfnExecution {
                                    execution_arn: a.clone(),
                                    name: a.split(':').last().unwrap_or("ExpressExec").to_string(),
                                    status: "EXPRESS".to_string(),
                                    start_date: ts,
                                    stop_date: None,
                                });
                             }
                        }
                    }
                    eprintln!("Failed to parse express log event: {:?}. Msg: {}", e, msg);
                }
            }
        }
    }

    // Dedup por ARN
    executions.sort_by_key(|e| e.start_date);
    executions.reverse();
    executions.dedup_by(|a, b| a.execution_arn == b.execution_arn);

    Ok(executions)
}

#[tauri::command]
pub async fn sfn_get_express_execution_history_from_logs(
    credentials: CwCredentials, 
    log_group: String,
    execution_arn: String
) -> Result<Vec<SfnStep>, String> {
    let client = cw_logs_client(&credentials).await;
    
    // Buscamos TODOS los eventos de esa ejecución específica
    // El patrón puede ser executionArn o execution_arn
    let pattern = format!("\"{}\"", execution_arn);

    let res = client.filter_log_events()
        .log_group_name(log_group)
        .filter_pattern(pattern)
        .limit(100)
        .send()
        .await
        .map_err(|e| format!("CW Logs History Error: {:?}", e))?;

    let mut steps_map: HashMap<String, SfnStep> = HashMap::new();
    let mut steps_order: Vec<String> = Vec::new();

    for event in res.events.unwrap_or_default() {
        if let Some(msg) = event.message {
            if let Ok(log) = serde_json::from_str::<serde_json::Value>(&msg) {
                let event_type = log["type"].as_str().unwrap_or("");
                let timestamp = log["event_timestamp"]
                    .as_i64()
                    .or_else(|| log["eventTimestamp"].as_i64())
                    .unwrap_or_else(|| event.timestamp.unwrap_or(0));
                
                let details = &log["details"];

                match event_type {
                    "TaskStateEntered" | "MapStateEntered" | "ParallelStateEntered" | "PassStateEntered" | "WaitStateEntered" | "ChoiceStateEntered" => {
                        let name = details["name"].as_str().unwrap_or("Unknown").to_string();
                        let input = details["input"].as_str()
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| details["input"].to_string());
                        
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
                        steps_order.push(name);
                    },
                    "TaskStateExited" | "MapStateExited" | "ParallelStateExited" | "PassStateExited" | "WaitStateExited" | "ChoiceStateExited" => {
                        let name = details["name"].as_str().unwrap_or("Unknown").to_string();
                        if let Some(step) = steps_map.get_mut(&name) {
                            step.status = "succeeded".to_string();
                            step.exited_at = Some(timestamp);
                            if timestamp >= step.entered_at {
                                step.duration_ms = Some(timestamp - step.entered_at);
                            }
                            step.output = Some(details["output"].as_str()
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| details["output"].to_string()));
                        }
                    },
                    "ExecutionFailed" | "TaskFailed" => {
                        // Si falla la ejecución o una tarea, intentamos marcar el último paso como fallido
                        if let Some(last_name) = steps_order.last() {
                             if let Some(step) = steps_map.get_mut(last_name) {
                                step.status = "failed".to_string();
                                step.error = details["error"].as_str().map(|s| s.to_string());
                                step.cause = details["cause"].as_str().map(|s| s.to_string());
                             }
                        }
                    },
                    _ => {}
                }
            }
        }
    }

    let result: Vec<SfnStep> = steps_order.into_iter()
        .filter_map(|name| steps_map.remove(&name))
        .collect();

    Ok(result)
}

// ==========================================
// COMMANDS
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SfnMachineDetails {
    pub definition: String,
    pub log_group_name: Option<String>,
}

#[tauri::command]
pub async fn sfn_describe_state_machine(credentials: CwCredentials, machine_arn: String) -> Result<SfnMachineDetails, String> {
    let client = sfn_client(&credentials).await;
    let res = client.describe_state_machine()
        .state_machine_arn(machine_arn)
        .send()
        .await
        .map_err(|e| format!("SFN Describe Error: {:?}", e))?;
    
    let state_machine_name = res.name.clone();
    let is_express = matches!(res.r#type, aws_sdk_sfn::types::StateMachineType::Express);

    let mut log_group_name = res.logging_configuration
        .and_then(|log_cfg| log_cfg.destinations)
        .and_then(|destinations| destinations.into_iter().next()) // Tomamos el primer destino
        .and_then(|dest| dest.cloud_watch_logs_log_group)
        .and_then(|cw_log| cw_log.log_group_arn)
        .map(|arn| {
            // El ARN de Log Group suele ser arn:aws:logs:region:account:log-group:NAME:*
            // O arn:aws:logs:region:account:log-group:NAME
            if let Some(pos) = arn.find(":log-group:") {
                let after_log_group = &arn[pos + 11..];
                // Si termina en :*, lo quitamos
                if let Some(star_pos) = after_log_group.find(":*") {
                    after_log_group[..star_pos].to_string()
                } else {
                    after_log_group.to_string()
                }
            } else {
                arn // Fallback
            }
        });

    // Fallback: si es Express y no tiene log group configurado explícitamente, 
    // intentamos con el nombre estándar de vendedlogs
    if log_group_name.is_none() && is_express {
        log_group_name = Some(format!("/aws/vendedlogs/states/{}-Logs", state_machine_name));
    }

    Ok(SfnMachineDetails {
        definition: res.definition,
        log_group_name,
    })
}

#[tauri::command]
pub async fn sfn_list_state_machines(credentials: CwCredentials) -> Result<Vec<SfnMachine>, String> {
    let client = sfn_client(&credentials).await;
    let res = client.list_state_machines()
        .max_results(50)
        .send()
        .await
        .map_err(|e| format!("SFN List Machines Error: {:?}", e))?;

    let machines = res.state_machines.into_iter().map(|m| SfnMachine {
        arn: m.state_machine_arn,
        name: m.name,
        machine_type: format!("{:?}", m.r#type).to_uppercase(),
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
        .map_err(|e| {
            let err_str = format!("{:?}", e);
            if err_str.contains("StateMachineTypeNotSupported") {
                "Execution history is not available for EXPRESS state machines via API. Check CloudWatch Logs.".to_string()
            } else {
                format!("SFN List Executions Error: {}", err_str)
            }
        })?;

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

        let res = req.send().await.map_err(|e| format!("SFN Get History Error: {:?}", e))?;
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
        let timestamp = event.timestamp.to_millis().unwrap_or(0);
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
                if timestamp >= step.entered_at {
                    step.duration_ms = Some(timestamp - step.entered_at);
                }
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
                    step.exited_at = Some(timestamp);
                    if timestamp >= step.entered_at {
                        step.duration_ms = Some(timestamp - step.entered_at);
                    }
                }
            }
        } else if let Some(details) = event.task_failed_event_details {
             if let Some(state_name) = id_to_state.get(&event.previous_event_id) {
                if let Some(step) = steps_map.get_mut(state_name) {
                    step.status = "failed".to_string();
                    step.error = details.error;
                    step.cause = details.cause;
                    step.exited_at = Some(timestamp);
                    if timestamp >= step.entered_at {
                        step.duration_ms = Some(timestamp - step.entered_at);
                    }
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
        .map_err(|e| format!("SFN Start Execution Error: {:?}", e))?;

    Ok(res.execution_arn)
}
