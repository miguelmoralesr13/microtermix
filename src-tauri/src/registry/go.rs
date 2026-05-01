use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoSearchResult {
    pub name: String,
    pub description: Option<String>,
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

    // 2. Fallback vía pkg.go.dev para metadatos
    let url = format!("https://pkg.go.dev/{}", name);
    if let Ok(res) = client.get(&url).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36").send().await {
        if res.status().is_success() {
            if let Ok(html) = res.text().await {
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
