use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitAccount {
    pub id: String,
    pub token: String,
    #[allow(dead_code)]
    pub provider: String,
    pub url: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MicrotermixConfig {
    pub git_accounts: Option<Vec<GitAccount>>,
    pub repo_accounts: Option<HashMap<String, String>>, // folderName -> accountId
}

pub fn find_workspace_config(start_path: &Path) -> Option<(PathBuf, MicrotermixConfig)> {
    let mut current = if start_path.is_file() {
        start_path.parent()?
    } else {
        start_path
    };

    loop {
        let config_path = current.join("microtermix.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<MicrotermixConfig>(&content) {
                    return Some((current.to_path_buf(), config));
                }
            }
        }

        match current.parent() {
            Some(parent) => current = parent,
            None => break,
        }
    }
    None
}

pub fn get_account_for_project(project_path: &str) -> Option<GitAccount> {
    let path = Path::new(project_path);
    let folder_name = path.file_name()?.to_str()?;
    
    let (_, config) = find_workspace_config(path)?;
    let repo_accounts = config.repo_accounts?;
    let account_id = repo_accounts.get(folder_name)?;
    
    let git_accounts = config.git_accounts?;
    let account = git_accounts.into_iter().find(|a| &a.id == account_id)?;
    
    Some(account)
}
