use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MavenSearchResult {
    pub group: String,
    pub artifact: String,
    pub version: String,
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
