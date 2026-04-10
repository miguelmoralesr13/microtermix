use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
}

#[tauri::command]
pub async fn start_docker() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let apps = ["Docker", "OrbStack", "Rancher Desktop"];
        let mut last_err = String::new();
        
        for app in apps {
            let app_path = format!("/Applications/{}.app", app);
            if std::path::Path::new(&app_path).exists() {
                let mut cmd = Command::new("open");
                cmd.args(["-a", app]);
                if let Ok(output) = cmd.output() {
                    if output.status.success() {
                        return Ok(());
                    } else {
                        last_err = String::from_utf8_lossy(&output.stderr).to_string();
                    }
                }
            }
        }
        
        // If none of the .app exists, maybe it's colima or something else
        let mut cmd = Command::new("colima");
        cmd.arg("start");
        if let Ok(status) = cmd.status() {
            if status.success() {
                return Ok(());
            }
        }

        if last_err.is_empty() {
            Err("No se detectó Docker Desktop, OrbStack o Rancher Desktop en /Applications.".to_string())
        } else {
            Err(last_err)
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", "Docker Desktop"]);
        cmd.output().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Try systemd
        let mut cmd = Command::new("systemctl");
        cmd.args(["start", "docker"]);
        if let Ok(status) = cmd.status() {
            if status.success() {
                return Ok(());
            }
        }
        Err("Could not start docker service (systemctl failed)".to_string())
    }
}

#[tauri::command]
pub fn docker_ps() -> Result<Vec<DockerContainer>, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["ps", "-a", "--format", "{{json .}}"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute docker ps: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            let id = value.get("ID").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = value.get("Names").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let image = value.get("Image").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let state = value.get("State").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let status = value.get("Status").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ports = value.get("Ports").and_then(|v| v.as_str()).unwrap_or("").to_string();

            containers.push(DockerContainer {
                id,
                name,
                image,
                state,
                status,
                ports,
            });
        }
    }

    containers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(containers)
}

#[tauri::command]
pub fn docker_action(action: String, container_id: String) -> Result<String, String> {
    let valid_actions = ["start", "stop", "restart", "rm"];
    if !valid_actions.contains(&action.as_str()) {
        return Err("Invalid docker action".to_string());
    }

    let mut cmd = Command::new("docker");
    cmd.arg(&action);

    if action == "rm" {
        cmd.arg("-f"); // Force remove for convenience
    }

    cmd.arg(&container_id);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute docker {}: {}", action, e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(format!("Container {} {}ed successfully", container_id, action))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerFileItem {
    pub name: String,
    pub size: String,
    pub is_dir: bool,
    pub permissions: String,
    pub date: String,
}

#[tauri::command]
pub fn docker_list_files(container_id: String, path: String) -> Result<Vec<DockerFileItem>, String> {
    let mut cmd = Command::new("docker");
    // Use 'ls -laF' to get file types even via symlinks
    cmd.args(["exec", &container_id, "ls", "-laF", &path]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to list files: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut items = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("total ") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        // Typically ls -la output has >= 9 parts
        if parts.len() >= 8 {
            let permissions = parts[0].to_string();
            let size = parts[4].to_string();
            
            // Date is usually indices 5, 6, 7 (Month, Day, Time/Year)
            let date = format!("{} {} {}", parts[5], parts[6], parts[7]);
            
            // Name starts at index 8 and may contain spaces
            let mut name_raw = parts[8..].join(" ");
            
            // Clean up symlink arrows if we're parsing 'ls -l'
            if let Some(idx) = name_raw.find(" -> ") {
                name_raw = name_raw[..idx].to_string();
            }

            // Determine if it's a directory
            // With -F, directories end with /
            let is_dir = permissions.starts_with('d') || name_raw.ends_with('/');
            
            // Clean the F flags from name (/, *, @, |, =)
            let mut name = name_raw.clone();
            if is_dir && name.ends_with('/') {
                name.pop();
            } else if name.ends_with('*') || name.ends_with('@') || name.ends_with('|') || name.ends_with('=') {
                name.pop();
            }
            
            if name == "." || name == ".." {
                continue;
            }

            items.push(DockerFileItem {
                name,
                size,
                is_dir,
                permissions,
                date,
            });
        }
    }

    // Sort: directories first, then alphabetical
    items.sort_by(|a, b| {
        let is_dir_a = if a.is_dir { 0 } else { 1 };
        let is_dir_b = if b.is_dir { 0 } else { 1 };
        is_dir_a.cmp(&is_dir_b).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(items)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageItem {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_since: String,
}

#[tauri::command]
pub fn docker_images() -> Result<Vec<DockerImageItem>, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["images", "--format", "{{json .}}"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to list images: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut images = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            let id = value.get("ID").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let repository = value.get("Repository").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let tag = value.get("Tag").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let size = value.get("Size").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let created_since = value.get("CreatedSince").and_then(|v| v.as_str()).unwrap_or("").to_string();

            images.push(DockerImageItem { id, repository, tag, size, created_since });
        }
    }

    Ok(images)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolumeItem {
    pub name: String,
    pub driver: String,
}

#[tauri::command]
pub fn docker_volumes() -> Result<Vec<DockerVolumeItem>, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["volume", "ls", "--format", "{{json .}}"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to list volumes: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut volumes = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            let name = value.get("Name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let driver = value.get("Driver").and_then(|v| v.as_str()).unwrap_or("").to_string();

            volumes.push(DockerVolumeItem { name, driver });
        }
    }

    Ok(volumes)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerNetworkItem {
    pub name: String,
    pub id: String,
    pub driver: String,
    pub scope: String,
}

#[tauri::command]
pub fn docker_networks() -> Result<Vec<DockerNetworkItem>, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["network", "ls", "--format", "{{json .}}"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to list networks: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            let name = value.get("Name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let id = value.get("ID").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let driver = value.get("Driver").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let scope = value.get("Scope").and_then(|v| v.as_str()).unwrap_or("").to_string();

            networks.push(DockerNetworkItem { name, id, driver, scope });
        }
    }

    Ok(networks)
}

#[tauri::command]
pub fn docker_read_file(container_id: String, path: String) -> Result<String, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["exec", &container_id, "cat", &path]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to read file: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn docker_inspect(id: String) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new("docker");
    cmd.args(["inspect", &id]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to inspect {}: {}", id, e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let value: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
    
    // docker inspect returns an array, we usually want the first element
    if let Some(first) = value.as_array().and_then(|a| a.first()) {
        Ok(first.clone())
    } else {
        Ok(value)
    }
}
