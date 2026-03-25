use std::collections::HashMap;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PypiSearchResult {
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MavenSearchResult {
    pub group: String,
    pub artifact: String,
    pub version: String,
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
pub async fn maven_search(query: String) -> Result<Vec<MavenSearchResult>, String> {
    let url = format!("https://search.maven.org/solrsearch/select?q={}&rows=30&wt=json", urlencoding::encode(&query));
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", "Microtermix/1.0.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    if let Some(docs) = data["response"]["docs"].as_array() {
        for doc in docs {
            results.push(MavenSearchResult {
                group: doc["g"].as_str().unwrap_or_default().to_string(),
                artifact: doc["a"].as_str().unwrap_or_default().to_string(),
                version: doc["latestVersion"].as_str().unwrap_or_default().to_string(),
            });
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_python_packages(project_path: String) -> Result<Vec<PythonPackage>, String> {
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

#[derive(Serialize)]
pub struct Project {
    pub name: String,
    pub path: String,
    pub project_type: String,
    pub framework: Option<String>,
    pub build_system: Option<String>,
    pub package_manager: Option<String>,
    pub scripts: Vec<String>,
}

fn detect_python_framework(path: &Path) -> Option<String> {
    if path.join("manage.py").exists() { return Some("django".to_string()); }
    let files = ["requirements.txt", "pyproject.toml", "Pipfile"];
    for file in files {
        if let Ok(c) = fs::read_to_string(path.join(file)) {
            let clc = c.to_lowercase();
            if clc.contains("fastapi") { return Some("fastapi".to_string()); }
            if clc.contains("flask") { return Some("flask".to_string()); }
        }
    }
    None
}

fn detect_java_framework(path: &Path) -> Option<String> {
    if let Ok(c) = fs::read_to_string(path.join("pom.xml")) {
        if c.contains("spring-boot") { return Some("spring-boot".to_string()); }
    }
    if let Ok(c) = fs::read_to_string(path.join("build.gradle")) {
        if c.contains("org.springframework.boot") { return Some("spring-boot".to_string()); }
    }
    None
}

pub fn detect_project_in_path(path: &Path) -> Option<Project> {
    if !path.is_dir() { return None; }
    let name = path.file_name()?.to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();
    let mut p_type = "unknown".to_string();
    let mut framework = None;
    let mut build_system = None;
    let mut package_manager = None;
    let mut scripts = Vec::new();

    if path.join("package.json").exists() {
        let runner = if path.join("bun.lockb").exists() || path.join("bun.lock").exists() { "bun" } 
                    else if path.join("pnpm-lock.yaml").exists() { "pnpm" }
                    else if path.join("yarn.lock").exists() { "yarn" }
                    else { "npm" };
        p_type = (if runner == "bun" { "bun" } else { "node" }).to_string();
        build_system = Some(runner.to_string());
        package_manager = Some(runner.to_string());
        if let Ok(content) = fs::read_to_string(path.join("package.json")) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(scripts_obj) = json.get("scripts").and_then(|s| s.as_object()) {
                    for key in scripts_obj.keys() {
                        let cmd = if runner == "npm" { format!("npm run {}", key) } else { format!("{} {}", runner, key) };
                        scripts.push(cmd);
                    }
                }
            }
        }
    } else if path.join("go.mod").exists() {
        p_type = "go".to_string(); build_system = Some("go".to_string()); package_manager = Some("go".to_string());
        scripts.push("go run .".to_string());
    } else if path.join("Cargo.toml").exists() {
        p_type = "rust".to_string(); build_system = Some("cargo".to_string()); package_manager = Some("cargo".to_string());
        scripts.push("cargo run".to_string());
    } else if path.join("requirements.txt").exists() || 
            path.join("pyproject.toml").exists() || 
            path.join("Pipfile").exists() ||
            path.join("setup.py").exists() ||
            path.join("manage.py").exists() ||
            path.join("main.py").exists() ||
            path.join("app.py").exists() ||
            path.join("environment.yml").exists() ||
            path.join(".python-version").exists() ||
            path.join("venv").is_dir() ||
            path.join(".venv").is_dir() {
        
        p_type = "python".to_string();
        let manager = if path.join("pyproject.toml").exists() { "poetry" } else if path.join("Pipfile").exists() { "pipenv" } else { "pip" };
        build_system = Some(manager.to_string());
        package_manager = Some(manager.to_string());
        framework = detect_python_framework(path);
        let py = if cfg!(target_os = "windows") { "python" } else { "python3" };
        
        match framework.as_deref() {
            Some("django") => {
                scripts.push(format!("{} manage.py runserver", py));
                scripts.push(format!("{} manage.py migrate", py));
            },
            Some("fastapi") => {
                scripts.push("uvicorn main:app --reload".to_string());
            },
            Some("flask") => {
                scripts.push(format!("{} -m flask run", py));
            },
            _ => {
                if path.join("main.py").exists() {
                    scripts.push(format!("{} main.py", py));
                } else if path.join("app.py").exists() {
                    scripts.push(format!("{} app.py", py));
                }
            }
        }
        scripts.push(format!("{} -m pytest", py));
    } else if path.join("pom.xml").exists() {
        p_type = "java".to_string(); build_system = Some("maven".to_string()); package_manager = Some("mvn".to_string());
        framework = detect_java_framework(path);
        scripts.push("mvn clean install".to_string());
    } else if path.join("build.gradle").exists() {
        p_type = "java".to_string(); build_system = Some("gradle".to_string()); package_manager = Some("gradle".to_string());
        framework = detect_java_framework(path);
        let cmd = if cfg!(target_os = "windows") { "gradlew.bat" } else { "./gradlew" };
        scripts.push(format!("{} build", if path.join(cmd).exists() { cmd } else { "gradle" }));
    }

    if p_type != "unknown" {
        Some(Project { name, path: path_str, project_type: p_type, framework, build_system, package_manager, scripts })
    } else { None }
}

#[tauri::command]
pub fn scan_path(path: String) -> Result<Vec<Project>, String> {
    let root = Path::new(&path);
    if let Some(p) = detect_project_in_path(root) { return Ok(vec![p]); }
    let mut projects = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            if let Some(p) = detect_project_in_path(&entry.path()) { projects.push(p); }
        }
    }
    Ok(projects)
}

#[tauri::command]
pub fn scan_projects(root_path: String) -> Result<Vec<Project>, String> { scan_path(root_path) }

#[tauri::command]
pub fn read_project_envs(project_path: String) -> Result<HashMap<String, HashMap<String, String>>, String> {
    let mut result: HashMap<String, HashMap<String, String>> = HashMap::new();
    let files = [(".env", "dev"), (".env.local", "local"), (".env.production", "production")];
    for (f, l) in files {
        if let Ok(c) = fs::read_to_string(Path::new(&project_path).join(f)) {
            let map = result.entry(l.to_string()).or_insert_with(HashMap::new);
            for line in c.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    map.insert(k.trim().to_string(), v.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }
    result.entry("dev".to_string()).or_insert_with(HashMap::new);
    Ok(result)
}

#[tauri::command]
pub fn get_project_script_bodies(project_path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&project_path).join("package.json");
    let c = fs::read_to_string(p).map_err(|e| e.to_string())?;
    let j: serde_json::Value = serde_json::from_str(&c).map_err(|e| e.to_string())?;
    Ok(j.get("scripts").and_then(|s| s.as_object()).map(|o| o.values().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default())
}

#[tauri::command]
pub fn list_test_files(project_path: String, language: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let root = Path::new(&project_path);
    for entry in WalkDir::new(root).into_iter().flatten() {
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy();
            let is_test = match language.as_str() {
                "node" => name.ends_with(".test.ts") || name.ends_with(".spec.ts"),
                "python" => name.starts_with("test_") && name.ends_with(".py"),
                "java" => name.ends_with("Test.java"),
                "go" => name.ends_with("_test.go"),
                _ => name.to_lowercase().contains("test")
            };
            if is_test { files.push(entry.path().strip_prefix(root).unwrap().to_string_lossy().to_string()); }
        }
    }
    files.sort(); Ok(files)
}
