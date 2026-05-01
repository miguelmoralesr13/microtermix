use std::path::Path;
use std::fs;

use tauri_plugin_opener;

use crate::os_utils::silent_command;

/// Reads a file relative to a base path.
#[tauri::command]
pub fn read_file_content(base: String, file: String) -> Result<String, String> {
    let path = Path::new(&base).join(&file);
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Reads a file by absolute path.
#[tauri::command]
pub fn read_file_at_path(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Opens a file in an editor with optional line/column.
#[tauri::command]
pub async fn open_in_editor(
    path: String, 
    editor_cmd: Option<String>,
    line: Option<u32>, 
    column: Option<u32>
) -> Result<(), String> {
    println!("[Editor] >>> ATTEMPTING TO OPEN: {}", path);
    if let Some(ref ed) = editor_cmd {
        println!("[Editor] >>> TARGET EDITOR: {}", ed);
    } else {
        println!("[Editor] >>> TARGET: Default/VSCode");
    }

    // Try specific editor if provided
    if let Some(editor) = editor_cmd {
        let mut cmd = if editor.contains(" ") {
            if cfg!(target_os = "windows") {
                let mut c = silent_command("cmd");
                c.args(["/C", &editor, &path]);
                c
            } else {
                let mut c = silent_command("sh");
                c.args(["-c", &format!("{} \"{}\"", editor, path)]);
                c
            }
        } else {
            let mut c = silent_command(&editor);
            c.arg(&path);
            c
        };

        match cmd.status() {
            Ok(status) if status.success() => {
                println!("[Editor] SUCCESS: {}", editor);
                return Ok(());
            },
            Ok(status) => println!("[Editor] FAIL: {} (status: {})", editor, status),
            Err(e) => println!("[Editor] ERROR: {} (err: {})", editor, e),
        }
    }

    // VSCode fallback
    println!("[Editor] Trying VS Code fallback...");
    let mut cmd_code = if cfg!(target_os = "windows") {
        silent_command("cmd")
    } else {
        silent_command("sh")
    };

    let goto_arg = match (line, column) {
        (Some(l), Some(c)) => format!("{}:{}:{}", path, l, c),
        (Some(l), None) => format!("{}:{}", path, l),
        _ => path.clone(),
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_code.args(["/C", "code", "--goto", &goto_arg]).creation_flags(0x08000000);
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd_code.args(["-c", &format!("code --goto {}", goto_arg)]);
    }

    if let Ok(status) = cmd_code.status() {
        if status.success() {
            println!("[Editor] SUCCESS: VSCode");
            return Ok(());
        }
    }

    // Default fallback: system opener
    println!("[Editor] Final fallback: system opener");
    tauri_plugin_opener::open_path(path, None::<String>).map_err(|e| {
        println!("[Editor] CRITICAL FAIL: {}", e);
        e.to_string()
    })
}
