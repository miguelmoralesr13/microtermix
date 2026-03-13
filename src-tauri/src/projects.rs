use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use serde::Serialize;

/// Proyecto descubierto en el workspace.
#[derive(Serialize)]
pub struct Project {
    pub name: String,
    pub path: String,
    pub project_type: String, // "node" | "go" | "rust" | "unknown"
    pub scripts: Vec<String>,
}

/// Escanea proyectos hijos directos del directorio raíz.
#[tauri::command]
pub fn scan_projects(root_path: String) -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();
    let root = Path::new(&root_path);

    if !root.is_dir() {
        return Err("Root path is not a directory".to_string());
    }

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                let path_str = path.to_string_lossy().to_string();
                let mut p_type = "unknown".to_string();
                let mut scripts = Vec::new();

                if path.join("package.json").exists() {
                    p_type = "node".to_string();
                    if let Ok(content) = fs::read_to_string(path.join("package.json")) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(scripts_obj) =
                                json.get("scripts").and_then(|s| s.as_object())
                            {
                                for key in scripts_obj.keys() {
                                    scripts.push(format!("npm run {}", key));
                                }
                            }
                        }
                    }
                } else if path.join("go.mod").exists() {
                    p_type = "go".to_string();
                    scripts.push("go run .".to_string());
                } else if path.join("Cargo.toml").exists() {
                    p_type = "rust".to_string();
                    scripts.push("cargo run".to_string());
                }

                if p_type != "unknown" {
                    projects.push(Project {
                        name,
                        path: path_str,
                        project_type: p_type,
                        scripts,
                    });
                }
            }
        }
    }
    Ok(projects)
}

/// Lee todas las `.env*` de un proyecto y devuelve un mapa por entorno.
#[tauri::command]
pub fn read_project_envs(
    project_path: String,
) -> Result<HashMap<String, HashMap<String, String>>, String> {
    // .env file name → env label
    let env_files: &[(&str, &str)] = &[
        (".env", "dev"),
        (".env.local", "local"),
        (".env.dev", "dev"),
        (".env.development", "dev"),
        (".env.qa", "qa"),
        (".env.uat", "uat"),
        (".env.staging", "staging"),
        (".env.production", "production"),
        (".env.prod", "production"),
        (".env.test", "test"),
    ];

    let mut result: HashMap<String, HashMap<String, String>> = HashMap::new();

    for (filename, label) in env_files {
        let file_path = Path::new(&project_path).join(filename);
        if !file_path.exists() {
            continue;
        }
        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let env_map = result.entry(label.to_string()).or_insert_with(HashMap::new);
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim().to_string();
                // Strip surrounding quotes from value
                let val = val.trim();
                let val = val.trim_matches('"').trim_matches('\'').to_string();
                if !key.is_empty() {
                    env_map.insert(key, val);
                }
            }
        }
    }

    // Siempre garantizar al menos una entrada "dev".
    result.entry("dev".to_string()).or_insert_with(HashMap::new);

    Ok(result)
}

/// Devuelve los comandos reales de package.json (valores de "scripts") para poder parsear envs inline.
#[tauri::command]
pub fn get_project_script_bodies(project_path: String) -> Result<Vec<String>, String> {
    let pkg_path = Path::new(&project_path).join("package.json");
    if !pkg_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let scripts_obj = match json.get("scripts").and_then(|s| s.as_object()) {
        Some(o) => o,
        None => return Ok(Vec::new()),
    };
    let bodies: Vec<String> = scripts_obj
        .values()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    Ok(bodies)
}

#[tauri::command]
pub fn list_test_files(project_path: String, language: String) -> Result<Vec<String>, String> {
    let root = Path::new(&project_path);
    if !root.exists() || !root.is_dir() {
        return Err("Project path not found".to_string());
    }

    let mut files = Vec::new();
    let walker = WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target" && name != "dist" && name != "venv" && name != "__pycache__"
        });

    for entry in walker.flatten() {
        if entry.file_type().is_file() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy();
            let rel_path = path.strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            let is_test = match language.as_str() {
                "node" => {
                    name.ends_with(".test.ts") || name.ends_with(".test.js") ||
                    name.ends_with(".spec.ts") || name.ends_with(".spec.js") ||
                    name.ends_with(".test.tsx") || name.ends_with(".spec.tsx")
                },
                "python" => {
                    (name.starts_with("test_") && name.ends_with(".py")) ||
                    name.ends_with("_test.py")
                },
                "java" => {
                    name.ends_with("Test.java") || name.ends_with("Tests.java") ||
                    name.ends_with("IT.java")
                },
                "go" => {
                    name.ends_with("_test.go")
                },
                _ => {
                    let n = name.to_lowercase();
                    n.contains("test") || n.contains("spec")
                }
            };

            if is_test {
                files.push(rel_path);
            }
        }
    }

    files.sort();
    Ok(files)
}

