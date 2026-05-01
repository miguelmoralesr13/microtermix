use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CargoSearchResult {
    pub name: String,
    pub version: String,
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
