use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::{AppState, PipelineState, PipelineStatus, PipelineStep, PipelineStepCondition};
use crate::services::logs::get_service_log_path;

/// Helper to wait for a port to be open.
async fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let addr = format!("127.0.0.1:{}", port);
    while start.elapsed().as_secs() < timeout_secs {
        if tokio::net::TcpStream::connect(&addr).await.is_ok() {
            return true;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
    }
    false
}

/// Helper to wait for a log pattern in a service.
async fn wait_for_log(service_id: String, pattern: String, timeout_secs: u64) -> bool {
    use std::fs;
    let start = std::time::Instant::now();
    let log_path = get_service_log_path(&service_id);
    let regex = match regex::Regex::new(&pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };

    while start.elapsed().as_secs() < timeout_secs {
        if log_path.exists() {
            if let Ok(content) = fs::read_to_string(&log_path) {
                if regex.is_match(&content) {
                    return true;
                }
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    false
}

/// Executes a pipeline of steps with conditions (WaitPort, WaitLog).
#[tauri::command]
pub async fn execute_pipeline(
    app: AppHandle,
    state: State<'_, AppState>,
    pipeline_id: String,
    steps: Vec<PipelineStep>,
) -> Result<(), String> {
    let total_steps = steps.len();
    {
        let mut p = state.pipelines.lock().await;
        p.insert(
            pipeline_id.clone(),
            PipelineState {
                status: PipelineStatus::Running,
                current_step: 0,
                total_steps,
            },
        );
    }

    let app_clone = app.clone();
    let pipeline_id_clone = pipeline_id.clone();

    tokio::spawn(async move {
        let state_in_task = app_clone.state::<AppState>();
        for (i, step) in steps.into_iter().enumerate() {
            {
                let mut p = state_in_task.pipelines.lock().await;
                if let Some(ps) = p.get_mut(&pipeline_id_clone) {
                    ps.current_step = i + 1;
                }
            }

            if let Some(condition) = step.condition {
                let success = match condition {
                    PipelineStepCondition::WaitPort(port) => wait_for_port(port, 60).await,
                    PipelineStepCondition::WaitLog(pattern) => {
                        wait_for_log(step.service_id, pattern, 60).await
                    }
                };

                if !success {
                    let mut p = state_in_task.pipelines.lock().await;
                    p.insert(
                        pipeline_id_clone.clone(),
                        PipelineState {
                            status: PipelineStatus::Failed("Timeout waiting for condition".to_string()),
                            current_step: i + 1,
                            total_steps,
                        },
                    );
                    let _ = app_clone.emit("pipeline-status", (pipeline_id_clone, "failed"));
                    return;
                }
            }
        }

        let mut p = state_in_task.pipelines.lock().await;
        p.insert(
            pipeline_id_clone.clone(),
            PipelineState {
                status: PipelineStatus::Completed,
                current_step: total_steps,
                total_steps,
            },
        );
        let _ = app_clone.emit("pipeline-status", (pipeline_id_clone, "completed"));
    });

    Ok(())
}

/// Gets the current state of a pipeline.
#[tauri::command]
pub async fn get_pipeline_state(
    state: State<'_, AppState>,
    pipeline_id: String,
) -> Result<Option<PipelineState>, String> {
    let p = state.pipelines.lock().await;
    Ok(p.get(&pipeline_id).cloned())
}
