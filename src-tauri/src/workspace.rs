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
    // More robust window label
    let window_label = format!("nexus-ws-{}", timestamp);

    println!("[open_new_workspace] Registering path for window {}: {}", window_label, path);

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_workspace_by_label.lock().await;
        pending.insert(window_label.clone(), path.clone());
    }

    let title = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path.as_str());
    
    println!("[open_new_workspace] Building window...");

    let res = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(format!("Nexus — {}", title))
    .inner_size(1280.0, 800.0) // Bigger default size
    .build();

    match res {
        Ok(_) => {
            println!("[open_new_workspace] Window created successfully");
            Ok(())
        },
        Err(e) => {
            let err_msg = format!("Failed to build window: {}", e);
            eprintln!("[open_new_workspace] Error: {}", err_msg);
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
    Ok(pending.remove(&window_label))
}

