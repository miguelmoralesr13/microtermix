use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Reads .env, .env.local, .env.production files and parses KEY=VALUE pairs.
#[tauri::command]
pub fn read_project_envs(project_path: String) -> Result<HashMap<String, HashMap<String, String>>, String> {
    let mut result: HashMap<String, HashMap<String, String>> = HashMap::new();
    let files = [(".env", "dev"), (".env.local", "local"), (".env.production", "production")];
    for (f, l) in files {
        if let Ok(c) = fs::read_to_string(Path::new(&project_path).join(f)) {
            let map = result.entry(l.to_string()).or_insert_with(HashMap::new);
            for line in c.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once('=') {
                    let key = k.trim().to_string();
                    if key.is_empty() || key.contains('#') {
                        continue;
                    }
                    map.insert(key, v.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }
    result.entry("dev".to_string()).or_insert_with(HashMap::new);
    Ok(result)
}
