use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::os_utils::silent_command;
use crate::state::AppState;

/// Entry for a listening process (from netstat/lsof/ss).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningProcess {
    pub proto: String,
    pub local_address: String,
    pub foreign_address: String,
    pub state: String,
    pub pid: u32,
    pub name: String,
    pub path: String,
    pub service_id: Option<String>,
}

/// Helper to get process name and executable path from a PID.
fn resolve_process_info(pid: u32) -> (String, String) {
    if pid == 0 { return ("System".to_string(), "kernel".to_string()); }

    use sysinfo::{System, Pid};
    let mut s = System::new();
    s.refresh_processes();

    if let Some(process) = s.process(Pid::from(pid as usize)) {
        let name = process.name().to_string();
        let exe = process.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "unknown".to_string());
        (name, exe)
    } else {
        ("unknown".to_string(), "unknown".to_string())
    }
}

/// Returns all TCP listening processes detected via netstat/lsof/ss.
#[tauri::command]
pub fn get_listening_processes(state: State<'_, AppState>) -> Result<Vec<ListeningProcess>, String> {
    // Build reverse map: pid -> service_id from tracked processes
    let pid_to_service: HashMap<u32, String> = state
        .processes
        .try_lock()
        .ok()
        .map(|procs| {
            procs
                .iter()
                .filter_map(|(sid, tp)| {
                    if tp.pid > 0 {
                        Some((tp.pid, sid.clone()))
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    {
        let mut process_names = HashMap::new();
        let tasklist_out = silent_command("tasklist")
            .args(["/NH", "/FO", "CSV"])
            .output();
        
        if let Ok(out) = tasklist_out {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim_matches('"')).collect();
                if parts.len() >= 2 {
                    if let Ok(pid) = parts[1].parse::<u32>() {
                        process_names.insert(pid, parts[0].to_string());
                    }
                }
            }
        }

        let mut cmd = silent_command("netstat");
        cmd.args(["-ano"]);
        
        let output = cmd.output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut rows = Vec::new();
        
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Active") || line.starts_with("Proto") {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let state_str = parts[3].to_uppercase();
                if state_str == "LISTENING" {
                    let pid: u32 = parts[4].parse().unwrap_or(0);
                    if pid > 0 {
                        let name = process_names.get(&pid).cloned().unwrap_or_else(|| "unknown".to_string());
                        let service_id = pid_to_service.get(&pid).cloned();
                        
                        rows.push(ListeningProcess {
                            proto: parts[0].to_string(),
                            local_address: parts[1].to_string(),
                            foreign_address: parts[2].to_string(),
                            state: parts[3].to_string(),
                            pid,
                            name,
                            path: "unknown".to_string(),
                            service_id,
                        });
                    }
                }
            }
        }
        Ok(rows)
    }

    #[cfg(not(target_os = "windows"))]
    {
        #[cfg(target_os = "macos")]
        {
            let output = silent_command("lsof")
                .args(["-iTCP", "-sTCP:LISTEN", "-P", "-n"])
                .output()
                .map_err(|e| e.to_string())?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut rows = Vec::new();

            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let pid: u32 = parts[1].parse().unwrap_or(0);
                    let name = parts[0].to_string();
                    let local = parts[8].to_string();
                    
                    let service_id = if pid > 0 { pid_to_service.get(&pid).cloned() } else { None };

                    rows.push(ListeningProcess {
                        proto: "tcp".to_string(),
                        local_address: local,
                        foreign_address: "*:*".to_string(),
                        state: "LISTEN".to_string(),
                        pid,
                        name,
                        path: "unknown".to_string(),
                        service_id,
                    });
                }
            }
            return Ok(rows);
        }

        #[cfg(not(target_os = "macos"))]
        {
            let (output, use_ss) = std::process::Command::new("ss")
                .args(["-tlnp"])
                .output()
                .map(|o| (o, true))
                .or_else(|_| std::process::Command::new("netstat").args(["-tlnp"]).output().map(|o| (o, false)))
                .map_err(|e| e.to_string())?;

            let stdout = String::from_utf8_lossy(&output.stdout);

            let ss_has_netid = use_ss && stdout.lines().any(|l| {
                let f = l.trim().split_whitespace().next().unwrap_or("");
                matches!(f, "tcp" | "tcp6" | "udp" | "udp6")
            });

            let mut rows = Vec::new();

            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty()
                    || line.starts_with("Proto")
                    || line.starts_with("State")
                    || line.starts_with("Netid")
                    || line.starts_with("Local")
                    || line.starts_with("Active")
                {
                    continue;
                }
                let parts: Vec<&str> = line.split_whitespace().collect();

                let (proto, local, foreign, pid) = if use_ss && ss_has_netid {
                    if parts.len() < 6 { continue; }
                    let pid = parts.get(6..).map(|p| p.join(" ")).and_then(|s| {
                        let idx = s.find("pid=")?;
                        let rest = &s[idx + 4..];
                        let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
                        rest[..end].parse::<u32>().ok()
                    }).unwrap_or(0);
                    (parts[0].to_string(), parts[4].to_string(), parts[5].to_string(), pid)
                } else if use_ss {
                    if parts.len() < 5 { continue; }
                    let pid = parts.get(5..).map(|p| p.join(" ")).and_then(|s| {
                        let idx = s.find("pid=")?;
                        let rest = &s[idx + 4..];
                        let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
                        rest[..end].parse::<u32>().ok()
                    }).unwrap_or(0);
                    ("tcp".to_string(), parts[3].to_string(), parts[4].to_string(), pid)
                } else {
                    if parts.len() < 4 { continue; }
                    let pid = parts.get(6)
                        .and_then(|s| s.split('/').next())
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(0);
                    let foreign = parts.get(4).map(|s| s.to_string()).unwrap_or_default();
                    (parts[0].to_string(), parts[3].to_string(), foreign, pid)
                };

                let (name, path) = if pid > 0 {
                    resolve_process_info(pid)
                } else {
                    ("unknown".to_string(), "unknown".to_string())
                };

                let service_id = if pid > 0 { pid_to_service.get(&pid).cloned() } else { None };

                rows.push(ListeningProcess {
                    proto,
                    local_address: local,
                    foreign_address: foreign,
                    state: "LISTEN".to_string(),
                    pid,
                    name,
                    path,
                    service_id,
                });
            }
            Ok(rows)
        }
    }
}
