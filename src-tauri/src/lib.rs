mod git_diff;
mod state;
mod projects;
mod processes;
mod proxy;
mod file_server;
mod workspace;

use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

// Re-export tipos de diff/git para usarlos en comandos Tauri.
pub use crate::git_diff::{DiffHunksResult, GitResult, HunkInfo};
pub use crate::state::AppState;
pub use crate::projects::{get_project_script_bodies, read_project_envs, scan_projects, Project};
pub use crate::processes::{
    execute_service_script, get_listening_processes, kill_all_services, kill_process_by_pid,
    kill_service, read_file_at_path, read_file_content, write_file_content, ListeningProcess,
    LogEvent,
};
pub use crate::proxy::{
    get_proxy_candidates, has_vite_config, parse_vite_federation, start_proxy, stop_proxy,
    ProxyCandidate, ProxyRoute, ViteFederationInfo, ViteRemoteEntry,
};
pub use crate::file_server::{
    is_file_server_running, start_coverage_server, start_file_server, stop_coverage_server,
    stop_file_server, FileServerRoute,
};
pub use crate::workspace::{get_initial_workspace_for_window, open_new_workspace};

// Deleted proxy, file_server, and processes modules (moved to their respective files)

// 3. Persistence
fn sanitize_path(path: &str) -> String {
    path.replace('/', "_").replace('\\', "_").replace(':', "_")
}

#[tauri::command]
fn save_workspace_settings(
    app: AppHandle,
    workspace_path: String,
    settings: String,
) -> Result<(), String> {
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let safe_path = sanitize_path(&workspace_path);
    let settings_path = app_dir.join(format!("{}.json", safe_path));
    fs::write(settings_path, settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_workspace_settings(app: AppHandle, workspace_path: String) -> Result<String, String> {
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let safe_path = sanitize_path(&workspace_path);
    let settings_path = app_dir.join(format!("{}.json", safe_path));
    if settings_path.exists() {
        fs::read_to_string(settings_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

/// Nombre del archivo de config del workspace dentro de la carpeta del workspace.
const WORKSPACE_CONFIG_FILENAME: &str = "nexus-workspace.json";

/// Lee la config del workspace desde un archivo en la carpeta del workspace (nexus-workspace.json).
#[tauri::command]
fn read_workspace_config_in_folder(workspace_path: String) -> Result<String, String> {
    let path = Path::new(&workspace_path).join(WORKSPACE_CONFIG_FILENAME);
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

/// Escribe la config del workspace en un archivo en la carpeta del workspace (nexus-workspace.json).
#[tauri::command]
fn write_workspace_config_in_folder(workspace_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&workspace_path).join(WORKSPACE_CONFIG_FILENAME);
    fs::write(&path, content).map_err(|e| e.to_string())
}

// Deleted execution helpers (moved to processes.rs)

#[tauri::command]
fn compute_unified_diff(
    original: String,
    modified: String,
    file_path: String,
) -> Result<String, String> {
    git_diff::compute_unified_diff_impl(original, modified, file_path)
}

#[tauri::command]
fn compute_diff_hunks(
    original: String,
    modified: String,
    file_path: String,
) -> Result<DiffHunksResult, String> {
    git_diff::compute_diff_hunks_impl(original, modified, file_path)
}

/// Aplica rechazos: devuelve el contenido "modified" con los hunks indicados revertidos (usando original).
/// reject_indices: índices de hunks a rechazar (deben coincidir con los hunks devueltos por compute_diff_hunks).
#[tauri::command]
fn apply_rejected_hunks(
    original: String,
    modified: String,
    hunks: Vec<HunkInfo>,
    reject_indices: Vec<usize>,
) -> Result<String, String> {
    git_diff::apply_rejected_hunks_impl(original, modified, hunks, reject_indices)
}

#[tauri::command]
async fn git_execute(
    app_handle: AppHandle,
    project_path: String,
    args: Vec<String>,
) -> Result<GitResult, String> {
    git_diff::git_execute_impl(app_handle, project_path, args).await
}

/// Reword the message of any local commit (HEAD or older) non-interactively.
/// Strategy:
///   1. Write the new message to a temp file.
///   2. Run `git rebase -i HASH^` with:
///        GIT_SEQUENCE_EDITOR = cmd that replaces "pick SHORTHASH" with "reword SHORTHASH"
///        GIT_EDITOR          = cmd that overwrites the COMMIT_EDITMSG with the temp file
#[tauri::command]
async fn git_reword_commit(
    app_handle: AppHandle,
    project_path: String,
    commit_hash: String,
    new_message: String,
) -> Result<GitResult, String> {
    git_diff::git_reword_commit_impl(app_handle, project_path, commit_hash, new_message).await
}

#[tauri::command]
async fn git_apply_patch(
    app_handle: AppHandle,
    project_path: String,
    patch_content: String,
    reverse: bool,
    target: Option<String>,
) -> Result<GitResult, String> {
    git_diff::git_apply_patch_impl(app_handle, project_path, patch_content, reverse, target).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let app_state = app_handle.state::<AppState>();
                    state::stop_background_work(&app_state).await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_new_workspace,
            get_initial_workspace_for_window,
            scan_projects,
            save_workspace_settings,
            load_workspace_settings,
            read_workspace_config_in_folder,
            write_workspace_config_in_folder,
            execute_service_script,
            kill_service,
            kill_all_services,
            read_file_content,
            read_file_at_path,
            write_file_content,
            compute_unified_diff,
            compute_diff_hunks,
            apply_rejected_hunks,
            git_execute,
            git_apply_patch,
            git_reword_commit,
            read_project_envs,
            get_project_script_bodies,
            get_listening_processes,
            kill_process_by_pid,
            has_vite_config,
            parse_vite_federation,
            get_proxy_candidates,
            start_proxy,
            stop_proxy,
            start_file_server,
            stop_file_server,
            is_file_server_running,
            start_coverage_server,
            stop_coverage_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
