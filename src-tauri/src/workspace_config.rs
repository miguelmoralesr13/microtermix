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
    pub repo_accounts: Option<HashMap<String, String>>, // repoPath -> accountId
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

    let (_, config) = find_workspace_config(path)?;
    let repo_accounts = config.repo_accounts?;

    // The frontend stores repoAccounts keyed by the full project path.
    // Bug fix: previously this was using only `folder_name` (last path segment),
    // which never matched the full-path keys saved by the frontend.
    //
    // Lookup order (most specific → least specific):
    //   1. Canonicalized absolute path — resolves symlinks, most reliable
    //   2. Raw project_path string — covers typical absolute paths without symlinks
    //   3. folder_name (last segment) — legacy fallback for old configs
    let canonical = path
        .canonicalize()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()));

    let account_id = canonical
        .as_deref()
        .and_then(|p| repo_accounts.get(p))
        .or_else(|| repo_accounts.get(project_path))
        .or_else(|| {
            path.file_name()
                .and_then(|n| n.to_str())
                .and_then(|name| repo_accounts.get(name))
        })?;

    let git_accounts = config.git_accounts?;
    let account = git_accounts.into_iter().find(|a| &a.id == account_id)?;

    Some(account)
}
