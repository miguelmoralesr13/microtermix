/// Kills a process by PID (taskkill on Windows, kill -9 on Unix).
#[tauri::command]
pub fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use crate::os_utils::silent_command;
        let mut cmd = silent_command("taskkill");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        let status = cmd.status().map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill failed with code {:?}", status.code()))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("kill failed with code {:?}", status.code()))
        }
    }
}

/// Recursively kills a process tree on Unix by sending signals to its process group (PGID).
/// Kills children first (depth-first), then the process itself.
#[cfg(not(target_os = "windows"))]
pub fn kill_tree_unix(pid: u32, sig: nix::sys::signal::Signal) {
    use nix::sys::signal::kill;
    use nix::unistd::Pid;
    use sysinfo::{System, Pid as SysPid};

    let target_pid = Pid::from_raw(pid as i32);

    // 1. Try to kill the whole process group first
    let _ = kill(Pid::from_raw(-(pid as i32)), sig);

    // 2. Fallback: Manual walk
    let mut s = System::new();
    s.refresh_processes();

    fn kill_recursive(s: &System, pid: u32, sig: nix::sys::signal::Signal) {
        let pids: Vec<u32> = s.processes()
            .iter()
            .filter(|(_, p)| p.parent() == Some(SysPid::from(pid as usize)))
            .map(|(p, _)| p.as_u32())
            .collect();

        for child_pid in pids {
            kill_recursive(s, child_pid, sig);
        }
        let _ = kill(Pid::from_raw(pid as i32), sig);
    }

    kill_recursive(&s, pid, sig);
    
    // Final blow to the top process
    let _ = kill(target_pid, sig);
}

/// Public wrapper called from state.rs on app exit.
#[cfg(not(target_os = "windows"))]
pub fn kill_tree_unix_pub(pid: u32) {
    kill_tree_unix(pid, nix::sys::signal::Signal::SIGKILL);
}
#[cfg(target_os = "windows")]
pub fn kill_tree_unix_pub(_pid: u32) {}
