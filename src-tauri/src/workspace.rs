use std::path::Path;
use tauri::{AppHandle, Manager};
use crate::{AppState, app_logs};

/// Abre un nuevo workspace en una ventana separada y registra el path
/// para que la nueva ventana lo pueda recuperar al montar el frontend.
#[tauri::command]
pub async fn open_new_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    // More robust window label
    let window_label = format!("microtermix-ws-{}", timestamp);

    app_logs::log_info("Workspace", &format!("Registering path for window {}: {}", window_label, path));

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_workspace_by_label.lock().await;
        pending.insert(window_label.clone(), path.clone());
    }

    let title = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path.as_str());
    
    app_logs::log_info("Workspace", "Building window...");

    let res = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(format!("Microtermix — {}", title))
    .inner_size(1280.0, 800.0) // Bigger default size
    .build();

    match res {
        Ok(_) => {
            app_logs::log_info("Workspace", "Window created successfully");
            Ok(())
        },
        Err(e) => {
            let err_msg = format!("Failed to build window: {}", e);
            app_logs::log_error("Workspace", &err_msg);
            Err(err_msg)
        }
    }
}

/// La nueva ventana llama esto al cargar para obtener el path del workspace asociado.
#[tauri::command]
pub async fn get_initial_workspace_for_window(
    app: AppHandle,
    window_label: String,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let mut pending = state.pending_workspace_by_label.lock().await;
    let res = pending.remove(&window_label);
    if res.is_none() {
        app_logs::log_warn("Workspace", &format!("No initial workspace found for window: {}", window_label));
    }
    Ok(res)
}

