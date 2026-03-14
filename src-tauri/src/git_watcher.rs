use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config, Event};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use crate::state::AppState;

// ── Focus-Based Fetch Worker ─────────────────────────────────────────────────

#[tauri::command]
pub async fn set_active_git_project(
    state: tauri::State<'_, AppState>,
    project_path: Option<String>
) -> Result<(), String> {
    let mut p = state.active_git_project.lock().await;
    *p = project_path.clone();
    
    if let Some(path) = project_path {
        println!("[Git Worker] Focus shifted to: {}", path);
    } else {
        println!("[Git Worker] No active project (IDLE)");
    }
    Ok(())
}

async fn ensure_fetch_worker(app_handle: AppHandle) {
    let state = app_handle.state::<AppState>();
    let mut started = state.git_fetch_worker_started.lock().await;
    if *started { return; }
    *started = true;

    let active_project = state.active_git_project.clone();

    tauri::async_runtime::spawn(async move {
        // Initial wait to let the app start up
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        
        loop {
            // Get the current active project
            let current_active = {
                let p = active_project.lock().await;
                p.clone()
            };

            if let Some(path) = current_active {
                println!("[Git Worker] Fetching active project: {}", path);
                
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
                            let _ = crate::git_native::fetch_remote_native(&repo, remote_name);
                        }
                    }
                }).await;
                
                // Active polling frequency: every 5 minutes while focused
                tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            } else {
                // If no project is active, check again more frequently but do nothing
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            }
        }
    });
}

pub fn start_watching_repo(
    app_handle: AppHandle,
    project_path: String,
) -> Result<(), String> {
    let project_path_clone = project_path.clone();
    let app_handle_clone = app_handle.clone();
    
    let state = app_handle.state::<AppState>();
    let git_watchers = state.git_watchers.clone();
    let active_git_project = state.active_git_project.clone();

    // 1. Ensure worker is running (it will automatically pick up the active project)
    let app_for_worker = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        ensure_fetch_worker(app_for_worker).await;
    });

    let root_path = Path::new(&project_path);
    if !root_path.exists() {
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

    let active_project_for_notify = active_git_project.clone();
    let path_to_watch = project_path.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(_) = rx.recv().await {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            while let Ok(_) = rx.try_recv() {}
            
            // Only emit if this repository is the one currently in FOCUS
            let current_active = {
                let p = active_project_for_notify.lock().await;
                p.clone()
            };

            if let Some(active_path) = current_active {
                if active_path == path_to_watch {
                    let _ = app_handle_clone.emit("git-changed", project_path_clone.clone());
                }
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
