use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct NoteEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<NoteEntry>,
}

// Escanea un directorio y devuelve árbol de carpetas + archivos .md
#[tauri::command]
pub fn notes_scan_dir(base_path: String) -> Result<Vec<NoteEntry>, String> {
    let path = Path::new(&base_path);
    if !path.exists() {
        fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    scan_recursive(path)
}

fn scan_recursive(dir: &Path) -> Result<Vec<NoteEntry>, String> {
    let mut entries: Vec<NoteEntry> = Vec::new();

    let mut read = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect::<Vec<_>>();

    // Directorios primero, luego archivos, ambos ordenados por nombre
    read.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in read {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Ignorar archivos ocultos
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = scan_recursive(&path)?;
            entries.push(NoteEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children,
            });
        } else if path.extension().map_or(false, |ext| ext == "md") {
            entries.push(NoteEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: vec![],
            });
        }
    }

    Ok(entries)
}

// Escribe contenido en un archivo (por ruta absoluta)
#[tauri::command]
pub fn notes_write_file(path: String, content: String) -> Result<(), String> {
    // Asegurar que el directorio padre existe
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// Crea un nuevo archivo .md vacío (falla si ya existe)
#[tauri::command]
pub fn notes_create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("Ya existe: {}", path));
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

// Crea una carpeta (y sus padres si faltan)
#[tauri::command]
pub fn notes_create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

// Borra un archivo o carpeta (recursivo)
#[tauri::command]
pub fn notes_delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

// Renombra/mueve una entrada
#[tauri::command]
pub fn notes_rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err(format!("Ya existe: {}", new_path));
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}
