use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PypiSearchResult {
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PythonPackage {
    pub name: String,
    pub version: String,
}

#[tauri::command]
pub async fn pypi_search(query: String) -> Result<Vec<PypiSearchResult>, String> {
    let query_lower = query.to_lowercase();
    let url = "https://pypi.org/simple/";
    
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", "pip/24.0")
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let html = response.text().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    
    for line in html.lines() {
        if line.to_lowercase().contains(&query_lower) {
            if let (Some(start), Some(end)) = (line.find('>'), line.rfind('<')) {
                let name = &line[start+1..end];
                let name_lower = name.to_lowercase();
                if name_lower.starts_with(&query_lower) || (results.len() < 10 && name_lower.contains(&query_lower)) {
                    results.push(PypiSearchResult {
                        name: name.to_string(),
                        version: None,
                        description: None,
                    });
                }
            }
        }
        if results.len() >= 30 { break; }
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_python_packages(project_path: String) -> Result<Vec<PythonPackage>, String> {
    use std::path::Path;
    let root = Path::new(&project_path);
    let venv_paths = ["venv/bin/pip", ".venv/bin/pip", "venv/Scripts/pip.exe", ".venv/Scripts/pip.exe"];
    let mut pip_exe = "pip".to_string(); 
    for p in venv_paths {
        let full_p = root.join(p);
        if full_p.exists() {
            pip_exe = full_p.to_string_lossy().to_string();
            break;
        }
    }
    let output = std::process::Command::new(pip_exe)
        .arg("list")
        .arg("--format=json")
        .current_dir(root)
        .output()
        .map_err(|e| format!("Failed to execute pip: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let packages: Vec<PythonPackage> = serde_json::from_str(&stdout).unwrap_or_default();
    Ok(packages)
}
