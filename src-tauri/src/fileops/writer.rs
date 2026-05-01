use std::path::Path;
use std::fs;

/// Ensures a directory exists at the given path relative to base.
#[tauri::command]
pub fn ensure_directory(base: String, path: String) -> Result<(), String> {
    let full_path = Path::new(&base).join(&path);
    println!("[ensure_directory] Creating: {:?}", full_path);
    fs::create_dir_all(full_path).map_err(|e| e.to_string())
}

/// Writes content to a file relative to a base path.
#[tauri::command]
pub fn write_file_content(base: String, file: String, content: String) -> Result<(), String> {
    let path = Path::new(&base).join(&file);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}
