use serde::{Deserialize, Serialize};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedProcessInfo {
    pub service_id: String,
    pub pid: Option<u32>,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDiagnostics {
    pub pid: u32,
    pub memory_rss_bytes: u64,
    pub memory_virt_bytes: u64,
    pub cpu_usage_pct: f32,
    pub thread_count: usize,
    pub uptime_secs: u64,
    pub managed_processes: Vec<ManagedProcessInfo>,
}

#[tauri::command]
pub async fn get_microtermix_performance_data(state: tauri::State<'_, AppState>) -> Result<AppDiagnostics, String> {
    use sysinfo::{Pid, ProcessRefreshKind};

    let mut sys = state.sys_monitor.lock().map_err(|e| e.to_string())?;
    
    // Refresh only process stats (CPU/Memory).
    // In sysinfo 0.30+, this uses the existing state to calculate CPU usage over time.
    sys.refresh_processes_specifics(ProcessRefreshKind::new().with_cpu().with_memory());
    
    let current_pid = std::process::id();
    let sys_pid = Pid::from_u32(current_pid);
    
    let (mem_rss, mem_virt, cpu, threads) = if let Some(p) = sys.process(sys_pid) {
        (p.memory(), p.virtual_memory(), p.cpu_usage(), p.run_time())
    } else {
        (0, 0, 0.0, 0)
    };

    let mut managed = Vec::new();
    {
        let pids_guard = state.process_pids.lock().map_err(|e| e.to_string())?;
        for (service_id, &pid) in pids_guard.iter() {
            let mut cpu_val = 0.0;
            let mut mem_val = 0;
            if let Some(p) = sys.process(Pid::from_u32(pid)) {
                cpu_val = p.cpu_usage();
                mem_val = p.memory();
            }
            managed.push(ManagedProcessInfo {
                service_id: service_id.clone(),
                pid: Some(pid),
                cpu_usage: cpu_val,
                memory_bytes: mem_val,
            });
        }
    }

    Ok(AppDiagnostics {
        pid: current_pid,
        memory_rss_bytes: mem_rss,
        memory_virt_bytes: mem_virt,
        cpu_usage_pct: cpu,
        thread_count: sys.process(sys_pid).and_then(|p| p.tasks().map(|t| t.len())).unwrap_or(0),
        uptime_secs: threads,
        managed_processes: managed,
    })
}
