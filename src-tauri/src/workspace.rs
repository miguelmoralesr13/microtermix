use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::AppState;

/// Abre un nuevo workspace en una ventana separada y registra el path
/// para que la nueva ventana lo pueda recuperar al montar el frontend.
#[tauri::command]
pub async fn open_new_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let window_label = format!("workspace-{}", timestamp);

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_workspace_by_label.lock().await;
        pending.insert(window_label.clone(), path.clone());
    }

    let title = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path.as_str());
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(format!("DevFlow Nexus — {}", title))
    .inner_size(800.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// La nueva ventana llama esto al cargar para obtener el path del workspace asociado.
#[tauri::command]
pub async fn get_initial_workspace_for_window(
    app: AppHandle,
    window_label: String,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let mut pending = state.pending_workspace_by_label.lock().await;
    Ok(pending.remove(&window_label))
}

