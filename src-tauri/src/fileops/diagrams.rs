use std::fs;
use std::path::Path;

/// Lists .mmd/.mermaid diagram files in a directory.
#[tauri::command]
pub fn list_diagram_files(path: String) -> Result<Vec<String>, String> {
    let diag_dir = Path::new(&path);
    if !diag_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(diag_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".mmd") || name.ends_with(".mermaid") {
                files.push(name);
            }
        }
    }
    files.sort();
    Ok(files)
}
