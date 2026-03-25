use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config, Event};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use crate::state::AppState;
use std::collections::HashSet;

use crate::app_logs;

// ── Multi-Window Fetch Worker ────────────────────────────────────────────────

#[tauri::command]
pub async fn set_active_git_project(
    state: tauri::State<'_, AppState>,
    window_label: String,
    project_path: Option<String>
) -> Result<(), String> {
    let mut projects = state.active_git_projects.lock().await;
    if let Some(path) = project_path {
        app_logs::log_info("Git Watcher", &format!("Focusing window '{}' on project: {}", window_label, path));
        projects.insert(window_label.clone(), path.clone());
    } else {
        app_logs::log_info("Git Watcher", &format!("Window '{}' is now IDLE (no project focused)", window_label));
        projects.remove(&window_label);
    }
    Ok(())
}

async fn ensure_fetch_worker(app_handle: AppHandle) {
    let state = app_handle.state::<AppState>();
    let mut started = state.git_fetch_worker_started.lock().await;
    if *started { return; }
    *started = true;
    
    app_logs::log_info("Git Worker", "Multi-window fetch worker started.");

    let active_projects_map = state.active_git_projects.clone();

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        
        loop {
            // Get unique set of paths currently active in any window
            let paths_to_fetch: HashSet<String> = {
                let map = active_projects_map.lock().await;
                map.values().cloned().collect()
            };

            if !paths_to_fetch.is_empty() {
                app_logs::log_debug("Git Worker", &format!("Starting fetch cycle for {} unique projects", paths_to_fetch.len()));
                
                for path in paths_to_fetch {
                    let p = path.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        if let Ok(repo) = git2::Repository::discover(&p) {
                            let remote_names = repo.remotes().ok();
                            let origin = remote_names.as_ref().and_then(|r| {
                                r.iter().flatten()
                                    .find(|&name| name == "origin")
                                    .or_else(|| r.iter().flatten().next())
                            });

                            if let Some(remote_name) = origin {
                                let account = crate::workspace_config::get_account_for_project(&p);
                                let _ = crate::git_native::fetch_remote_native(&repo, remote_name, account);
                            }
                        }
                    }).await;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
                
                tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            }
        }
    });
}

pub fn start_watching_repo(
    app_handle: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let app_handle_clone = app_handle.clone();
    
    app_logs::log_info("Git Watcher", &format!("Starting watcher for: {}", project_path));

    let state = app_handle.state::<AppState>();
    let git_watchers = state.git_watchers.clone();
    let active_projects_map = state.active_git_projects.clone();

    // Ensure worker is running
    let app_for_worker = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        ensure_fetch_worker(app_for_worker).await;
    });

    let root_path = Path::new(&project_path);
    if !root_path.exists() {
        app_logs::log_error("Git Watcher", &format!("Path does not exist: {}", project_path));
        return Err("Project path does not exist".to_string());
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel(10);

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let should_notify = event.paths.iter().any(|p| {
                    let s = p.to_string_lossy();
                    if s.contains(".git/HEAD") || s.contains(".git/index") || s.contains(".git/refs") {
                        return !s.ends_with(".lock");
                    }
                    if s.contains("node_modules") || s.contains("target") || s.contains(".next") || s.contains(".dist") || s.contains(".git") {
                        return false;
                    }
                    !s.ends_with(".lock") && !s.ends_with("~")
                });
                if should_notify {
                    let _ = tx.blocking_send(());
                }
            }
        },
        Config::default(),
    ).map_err(|e| e.to_string())?;

    watcher.watch(root_path, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

    let project_path_for_store = project_path.clone();
    let watchers_for_store = git_watchers.clone();
    tauri::async_runtime::spawn(async move {
        let mut watchers = watchers_for_store.lock().await;
        watchers.insert(project_path_for_store, Box::new(watcher));
    });

    let active_projects_for_notify = active_projects_map.clone();
    let path_to_watch = project_path.clone();
    let app_handle_for_event = app_handle_clone.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(_) = rx.recv().await {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            while let Ok(_) = rx.try_recv() {}
            
            // Check if this project is active in ANY window
            let is_active = {
                let map = active_projects_for_notify.lock().await;
                map.values().any(|v| v == &path_to_watch)
            };

            if is_active {
                app_logs::log_debug("Git Watcher", &format!("Change detected in focused project: {}", path_to_watch));
                app_logs::log_info("Git Watcher", &format!("Notifying frontend of changes in {}", path_to_watch));
                let _ = app_handle_for_event.emit("git-changed", path_to_watch.clone());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_watching_repo(
    state: tauri::State<'_, AppState>,
    project_path: String,
) -> Result<(), String> {
    app_logs::log_info("Git Watcher", &format!("Stopping watcher for: {}", project_path));
    let mut watchers = state.git_watchers.lock().await;
    watchers.remove(&project_path);
    Ok(())
}

#[tauri::command]
pub async fn watch_repo(
    app_handle: AppHandle,
    project_path: String,
) -> Result<(), String> {
    start_watching_repo(app_handle, project_path)
}
