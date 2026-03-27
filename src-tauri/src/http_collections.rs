use std::fs;
use std::path::Path;

/// Lee la carpeta `.microtermix/http-collections/` en el workspace y devuelve el contenido de todos los .json
#[tauri::command]
pub fn list_http_collections(workspace_path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&workspace_path).join(".microtermix").join("http-collections");
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut collections = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    collections.push(content);
                }
            }
        }
    }
    Ok(collections)
}

/// Escribe un archivo .json en `.microtermix/http-collections/`
#[tauri::command]
pub fn write_http_collection(workspace_path: String, filename: String, content: String) -> Result<(), String> {
    let dir = Path::new(&workspace_path).join(".microtermix").join("http-collections");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    
    // Evitar salto de directorios malicioso
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }

    let file_path = dir.join(filename);
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

/// Elimina un archivo .json de `.microtermix/http-collections/`
#[tauri::command]
pub fn delete_http_collection(workspace_path: String, filename: String) -> Result<(), String> {
    let dir = Path::new(&workspace_path).join(".microtermix").join("http-collections");
    
    // Evitar salto de directorios
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }

    let file_path = dir.join(filename);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
