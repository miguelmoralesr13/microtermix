use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::Serialize;

/// Represents a discovered project in the workspace.
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

/// Detects Python framework by checking marker files and dependencies.
pub fn detect_python_framework(path: &Path) -> Option<String> {
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

/// Detects Java framework by checking build files.
pub fn detect_java_framework(path: &Path) -> Option<String> {
    if let Ok(c) = fs::read_to_string(path.join("pom.xml")) {
        if c.contains("spring-boot") { return Some("spring-boot".to_string()); }
    }
    if let Ok(c) = fs::read_to_string(path.join("build.gradle")) {
        if c.contains("org.springframework.boot") { return Some("spring-boot".to_string()); }
    }
    None
}

/// Detects the project type in a given path by checking for marker files.
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
    } else if path.join(".git").exists() {
        p_type = "git-repo".to_string(); 
        build_system = Some("git".to_string());
    }

    if p_type != "unknown" {
        Some(Project { name, path: path_str, project_type: p_type, framework, build_system, package_manager, scripts })
    } else { None }
}

/// Scans a path for projects. If root is a project, returns just it.
/// Otherwise scans immediate children for projects.
#[tauri::command]
pub fn scan_path(path: String) -> Result<Vec<Project>, String> {
    let root = Path::new(&path);
    let mut projects: Vec<Project> = Vec::new();
    let mut seen_paths = HashSet::new();

    // Check root itself first
    if let Some(p) = detect_project_in_path(root) {
        seen_paths.insert(p.path.clone());
        projects.push(p);
        return Ok(projects);
    }

    // Root is NOT a project — scan immediate children
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let dir_name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if dir_name.starts_with('.') 
                || dir_name == "node_modules" 
                || dir_name == "target" 
                || dir_name == "dist" 
                || dir_name == ".git" 
            {
                continue;
            }
            if let Some(p) = detect_project_in_path(&entry_path) {
                if seen_paths.insert(p.path.clone()) {
                    projects.push(p);
                }
            }
        }
    }

    Ok(projects)
}

/// Tauri command: scan projects in root path.
#[tauri::command]
pub fn scan_projects(root_path: String) -> Result<Vec<Project>, String> { scan_path(root_path) }

/// Returns the raw script body strings from package.json scripts object.
#[tauri::command]
pub fn get_project_script_bodies(project_path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&project_path).join("package.json");
    let c = fs::read_to_string(p).map_err(|e| e.to_string())?;
    let j: serde_json::Value = serde_json::from_str(&c).map_err(|e| e.to_string())?;
    Ok(j.get("scripts").and_then(|s| s.as_object()).map(|o| o.values().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default())
}

/// Walks directory tree to find test files by language convention.
#[tauri::command]
pub fn list_test_files(project_path: String, language: String) -> Result<Vec<String>, String> {
    use walkdir::WalkDir;
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
