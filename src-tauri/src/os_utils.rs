use std::process::Command as StdCommand;
use tokio::process::Command as AsyncCommand;
use serde_json::Value;

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn silent_command(program: &str) -> StdCommand {
    #[allow(unused_mut)]
    let mut cmd = StdCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn silent_async_command(program: &str) -> AsyncCommand {
    #[allow(unused_mut)]
    let mut cmd = AsyncCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// On non-Windows, tries to load the user's shell PATH.
pub fn fix_path_env() {
    #[cfg(not(target_os = "windows"))]
    {
        use std::env;
        
        // If we already have a reasonably long PATH, maybe it's already set (e.g. running from terminal)
        if let Ok(current_path) = env::var("PATH") {
            if current_path.split(':').count() > 5 {
                return;
            }
        }

        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        
        // Use a unique delimiter to find the path in case the shell config prints other stuff
        let cmd_str = "printf \"__MTX_PATH__%s__MTX_PATH__\" \"$PATH\"";
        
        let output = StdCommand::new(&shell)
            .args(["-l", "-i", "-c", cmd_str])
            .output();

        let mut extracted_path = None;

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Some(start) = stdout.find("__MTX_PATH__") {
                if let Some(end) = stdout.rfind("__MTX_PATH__") {
                    if start < end {
                        let path = &stdout[start + 12..end];
                        if !path.is_empty() && path.contains(':') {
                            extracted_path = Some(path.to_string());
                        }
                    }
                }
            }
        }

        if extracted_path.is_none() {
            // Try simpler login shell without interactive mode
            let output_simple = StdCommand::new(&shell)
                .args(["-l", "-c", cmd_str])
                .output();
            if let Ok(out) = output_simple {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if let Some(start) = stdout.find("__MTX_PATH__") {
                    if let Some(end) = stdout.rfind("__MTX_PATH__") {
                        if start < end {
                            let path = &stdout[start + 12..end];
                            if !path.is_empty() && path.contains(':') {
                                extracted_path = Some(path.to_string());
                            }
                        }
                    }
                }
            }
        }

        if let Some(path) = extracted_path {
            env::set_var("PATH", &path);
            // We can't use crate::app_logs here yet as it might not be initialized, 
            // but we can print to stderr which Tauri's log system might catch if started.
            eprintln!("[Microtermix] Fixed PATH: {}", path);
        } else {
            eprintln!("[Microtermix] Failed to fix PATH environment.");
        }
    }
}

#[tauri::command]
pub async fn check_command_installed(command: String) -> Result<bool, String> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = silent_command("cmd");
        c.args(["/c", &format!("where {}", command)]);
        c
    } else {
        let mut c = silent_command("sh");
        c.args(["-c", &format!("command -v {}", command)]);
        c
    };
    
    match cmd.output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

pub fn get_command_full_path(command: &str) -> Option<String> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = StdCommand::new("cmd");
        c.args(["/c", &format!("where {}", command)]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x08000000);
        }
        c
    } else {
        let mut c = StdCommand::new("sh");
        c.args(["-c", &format!("command -v {}", command)]);
        c
    };
    
    match cmd.output() {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Take the first one if multiple
            Some(path.lines().next().unwrap_or("").to_string())
        },
        _ => None,
    }
}

#[tauri::command]
pub fn get_available_editors() -> Vec<Value> {
    let mut editors_to_check = vec![
        ("Visual Studio Code", "code"),
        ("VS Code Insiders", "code-insiders"),
        ("Cursor", "cursor"),
        ("VSCodium", "codium"),
        ("Antigravity", "antigravity"),
        ("Microtermix Edit", "microtermix"), // maybe it's in path?
        ("Zed", "zed"),
        ("Sublime Text", "subl"),
        ("Atom", "atom"),
        ("Helix", "hx"),
        ("Micro", "micro"),
        ("Emacs", "emacs"),
        ("IntelliJ IDEA", "idea"),
        ("PyCharm", "pycharm"),
        ("WebStorm", "webstorm"),
        ("GoLand", "goland"),
        ("RustRover", "rustrover"),
        ("Vim", "vim"),
        ("Nano", "nano"),
    ];
    
    #[cfg(target_os = "macos")]
    {
        editors_to_check.push(("TextEdit", "open -e"));
        editors_to_check.push(("Xcode", "xed"));
    }

    let mut available = Vec::new();
    for (label, cmd_str) in editors_to_check {
        let cmd_to_test = cmd_str.split_whitespace().next().unwrap_or(cmd_str);
        if let Some(full_path) = get_command_full_path(cmd_to_test) {
            // Keep the arguments if it was a complex command like "open -e"
            let final_cmd = if cmd_str.contains(" ") {
                cmd_str.to_string() 
            } else {
                full_path
            };
            
            available.push(serde_json::json!({
                "label": label,
                "cmd": final_cmd
            }));
        }
    }
    available
}

#[tauri::command]
pub fn rust_copy_to_clipboard(text: String) -> Result<(), String> {
    use arboard::Clipboard;
    let mut clipboard = Clipboard::new().map_err(|e| format!("No se pudo inicializar el portapapeles: {e}"))?;
    clipboard.set_text(text).map_err(|e| format!("No se pudo copiar al portapapeles: {e}"))?;
    Ok(())
}
