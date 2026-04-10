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
pub struct CargoDetails {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub readme: Option<String>,
    pub repository: Option<String>,
    pub homepage: Option<String>,
    pub documentation: Option<String>,
    pub license: Option<String>,
}

#[tauri::command]
pub async fn get_cargo_details(name: String) -> Result<CargoDetails, String> {
    println!("[Rust] Fetching Crates.io details for: {}", name);
    
    let client = reqwest::Client::new();
    let url = format!("https://crates.io/api/v1/crates/{}", name);
    
    let response = client
        .get(url)
        .header("User-Agent", "Microtermix/1.0.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Crates.io Error: {}", response.status()));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let krate = &data["crate"];
    
    // El README en la API principal a veces viene truncado o como link.
    // Intentamos obtener el README completo desde el endpoint de la última versión
    let version = krate["max_version"].as_str().unwrap_or("latest").to_string();
    let readme_url = format!("https://crates.io/api/v1/crates/{}/{}/readme", name, version);
    
    let readme_content = match client.get(readme_url).header("User-Agent", "Microtermix/1.0.0").send().await {
        Ok(res) if res.status().is_success() => res.text().await.ok(),
        _ => krate["description"].as_str().map(|s| s.to_string()),
    };

    Ok(CargoDetails {
        name: krate["name"].as_str().unwrap_or(&name).to_string(),
        version,
        description: krate["description"].as_str().map(|s| s.to_string()),
        readme: readme_content,
        repository: krate["repository"].as_str().map(|s| s.to_string()),
        homepage: krate["homepage"].as_str().map(|s| s.to_string()),
        documentation: krate["documentation"].as_str().map(|s| s.to_string()),
        license: krate["license"].as_str().map(|s| s.to_string()),
    })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoDetails {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub readme: Option<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
}

#[tauri::command]
pub async fn get_go_details(name: String) -> Result<GoDetails, String> {
    println!("[Rust] Fetching Go details for: {}", name);
    
    let client = reqwest::Client::new();
    let mut readme = None;
    let mut description = None;
    let mut repository = None;
    let mut version = "latest".to_string();

    // 0. Intentar obtener la versión REAL desde el proxy de Go
    let proxy_url = format!("https://proxy.golang.org/{}/@latest", name);
    if let Ok(res) = client.get(&proxy_url).header("User-Agent", "Microtermix/1.0.0").send().await {
        if res.status().is_success() {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(v) = json["Version"].as_str() {
                    version = v.to_string();
                }
            }
        }
    }
    
    // 1. Intentar obtener de GitHub si es un repo de GitHub
    if name.starts_with("github.com/") {
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() >= 3 {
            let user = parts[1];
            let repo = parts[2];
            repository = Some(format!("https://github.com/{}/{}", user, repo));
            
            // Intentar README.md en main o master
            for branch in ["main", "master"] {
                let raw_url = format!("https://raw.githubusercontent.com/{}/{}/{}/README.md", user, repo, branch);
                if let Ok(res) = client.get(&raw_url).header("User-Agent", "Microtermix/1.0.0").send().await {
                    if res.status().is_success() {
                        if let Ok(text) = res.text().await {
                            readme = Some(text);
                            break;
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback o complemento vía pkg.go.dev para metadatos
    let url = format!("https://pkg.go.dev/{}", name);
    if let Ok(res) = client.get(&url).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36").send().await {
        if res.status().is_success() {
            if let Ok(html) = res.text().await {
                // Extraer descripción básica si no tenemos nada
                if readme.is_none() {
                    let re_desc = regex::Regex::new(r#"(?s)<div class="UnitReadme-content".*?>(.*?)</div>"#).unwrap();
                    if let Some(cap) = re_desc.captures(&html) {
                        readme = Some(cap[1].trim().to_string());
                    }
                }
                
                let re_meta = regex::Regex::new(r#"<meta name="description" content="(.*?)">"#).unwrap();
                if let Some(cap) = re_meta.captures(&html) {
                    description = Some(cap[1].to_string());
                }
            }
        }
    }

    Ok(GoDetails {
        name: name.clone(),
        version,
        description,
        readme,
        homepage: Some(format!("https://pkg.go.dev/{}", name)),
        repository,
        license: Some("See pkg.go.dev".to_string()),
    })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoSearchResult {
    pub name: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn go_search(query: String) -> Result<Vec<GoSearchResult>, String> {
    println!("[Rust] Go Scraper Search: {}", query);
    
    let url = format!("https://pkg.go.dev/search?q={}", urlencoding::encode(&query));
    
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let html = response.text().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    // El nombre del paquete está en <span class="SearchSnippet-header-path">(github.com/...)</span>
    // o en el href de los enlaces de resultado.
    let re_path = regex::Regex::new(r#"<span class="SearchSnippet-header-path">\((.*?)\)</span>"#).unwrap();
    let re_desc = regex::Regex::new(r#"(?s)<p class="SearchSnippet-synopsis".*?>(.*?)</p>"#).unwrap();

    let mut paths = Vec::new();
    for cap in re_path.captures_iter(&html) {
        paths.push(cap[1].to_string());
    }

    let mut descs = Vec::new();
    for cap in re_desc.captures_iter(&html) {
        descs.push(cap[1].trim().to_string());
    }

    for (i, path) in paths.into_iter().enumerate() {
        if i >= 20 { break; }
        let description = descs.get(i).cloned();
        results.push(GoSearchResult {
            name: path,
            description,
        });
    }
    
    if results.is_empty() {
        println!("[Rust] Scraper found no results, trying secondary pattern...");
        // Fallback: buscar hrefs que empiecen por /
        let re_link = regex::Regex::new(r#"<a href="/(github\.com/.*?)"#).unwrap();
        for cap in re_link.captures_iter(&html) {
            let name = cap[1].to_string();
            if !results.iter().any(|r| r.name == name) {
                results.push(GoSearchResult { name, description: None });
            }
            if results.len() >= 20 { break; }
        }
    }

    println!("[Rust] Go search found {} results", results.len());
    Ok(results)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CargoSearchResult {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn cargo_search(query: String) -> Result<Vec<CargoSearchResult>, String> {
    println!("[Rust] Crates.io Search: {}", query);
    
    let url = format!("https://crates.io/api/v1/crates?q={}&per_page=30", urlencoding::encode(&query));
    
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("User-Agent", "Microtermix/1.0.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Crates.io Error: {}", response.status()));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(crates) = data["crates"].as_array() {
        for c in crates {
            results.push(CargoSearchResult {
                name: c["name"].as_str().unwrap_or_default().to_string(),
                version: c["max_version"].as_str().unwrap_or_default().to_string(),
                description: c["description"].as_str().map(|s| s.to_string()),
            });
        }
    }
    
    Ok(results)
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
    } else if path.join(".git").exists() {
        p_type = "git-repo".to_string(); 
        build_system = Some("git".to_string());
    }

    if p_type != "unknown" {
        Some(Project { name, path: path_str, project_type: p_type, framework, build_system, package_manager, scripts })
    } else { None }
}

#[tauri::command]
pub fn scan_path(path: String) -> Result<Vec<Project>, String> {
    let root = Path::new(&path);
    let mut projects = Vec::new();

    // Check root
    if let Some(p) = detect_project_in_path(root) { 
        projects.push(p); 
    }

    // Always scan children for sub-projects
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
