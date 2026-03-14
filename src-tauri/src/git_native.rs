use git2::{Repository, StatusOptions, BranchType};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::fs;

// ── Return types ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DiffModelResult {
    pub original: String,
    pub modified: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsRepoResult {
    pub is_git_repo: bool,
    pub has_commits: bool,
}

#[derive(Serialize)]
pub struct LocalBranch {
    pub name: String,
    pub active: bool,
}

#[derive(Serialize)]
pub struct BranchesResult {
    pub local: Vec<LocalBranch>,
    pub remote: Vec<String>,
    pub stashes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub file: String,
    pub state_code: String,
    pub is_staged: bool,
    pub is_unstaged: bool,
    pub is_conflicted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResult {
    pub files: Vec<StatusEntry>,
    pub current_branch: String,
    pub is_merge_in_progress: bool,
    pub is_rebase_in_progress: bool,
    pub status_output: String, // Added for compatibility with CLI-based frontend expectations
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub message: String,
    pub refs: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogResult {
    pub commits: Vec<CommitEntry>,
    pub local_hashes: Vec<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub(crate) fn repo_open(project_path: &str) -> Result<Repository, String> {
    Repository::discover(project_path).map_err(|e| e.to_string())
}

/// Format seconds since epoch as a relative time string (e.g. "3 days ago").
fn format_relative(secs: i64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let diff = now - secs;
    if diff < 60 {
        format!("{} seconds ago", diff.max(0))
    } else if diff < 3600 {
        format!("{} minutes ago", diff / 60)
    } else if diff < 86400 {
        format!("{} hours ago", diff / 3600)
    } else if diff < 2_592_000 {
        format!("{} days ago", diff / 86400)
    } else if diff < 31_536_000 {
        format!("{} months ago", diff / 2_592_000)
    } else {
        format!("{} years ago", diff / 31_536_000)
    }
}

/// Build a map of oid → ref labels once, instead of scanning all refs per commit.
fn build_refs_map(repo: &Repository) -> HashMap<git2::Oid, Vec<String>> {
    let mut map: HashMap<git2::Oid, Vec<String>> = HashMap::new();

    if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
        for b in branches.flatten() {
            if let Ok(ref_obj) = b.0.get().peel_to_commit() {
                if let Ok(Some(name)) = b.0.name() {
                    let label = if b.0.is_head() {
                        format!("HEAD -> {}", name)
                    } else {
                        name.to_string()
                    };
                    map.entry(ref_obj.id()).or_default().push(label);
                }
            }
        }
    }

    if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
        for b in branches.flatten() {
            if let Ok(ref_obj) = b.0.get().peel_to_commit() {
                if let Ok(Some(name)) = b.0.name() {
                    if !name.ends_with("/HEAD") {
                        map.entry(ref_obj.id()).or_default().push(name.to_string());
                    }
                }
            }
        }
    }

    let _ = repo.tag_foreach(|tag_oid, name_bytes| {
        if let Ok(name) = std::str::from_utf8(name_bytes) {
            let tag_name = name.trim_start_matches("refs/tags/");
            if let Ok(obj) = repo.find_object(tag_oid, None) {
                if let Ok(commit) = obj.peel_to_commit() {
                    map.entry(commit.id()).or_default().push(format!("tag: {}", tag_name));
                }
            }
        }
        true
    });

    map
}

// ── Commands ──────────────────────────────────────────────────────────────────

pub fn git_is_repo_native_impl(project_path: String) -> IsRepoResult {
    match repo_open(&project_path) {
        Err(_) => IsRepoResult { is_git_repo: false, has_commits: false },
        Ok(repo) => {
            let has_commits = repo.head().is_ok();
            IsRepoResult { is_git_repo: true, has_commits }
        }
    }
}

pub fn git_branches_native_impl(project_path: String) -> Result<BranchesResult, String> {
    let mut repo = repo_open(&project_path)?;

    let mut local: Vec<LocalBranch> = Vec::new();
    let branches = repo.branches(Some(BranchType::Local)).map_err(|e| e.to_string())?;
    for b in branches.flatten() {
        if let Ok(Some(name)) = b.0.name() {
            local.push(LocalBranch {
                name: name.to_string(),
                active: b.0.is_head(),
            });
        }
    }

    let mut remote: Vec<String> = Vec::new();
    if let Ok(remotes) = repo.branches(Some(BranchType::Remote)) {
        for b in remotes.flatten() {
            if let Ok(Some(name)) = b.0.name() {
                if !name.ends_with("/HEAD") {
                    remote.push(name.to_string());
                }
            }
        }
    }

    let mut stashes: Vec<String> = Vec::new();
    let _ = repo.stash_foreach(|idx, message, _oid| {
        stashes.push(format!("stash@{{{}}}: {}", idx, message));
        true
    });

    Ok(BranchesResult { local, remote, stashes })
}

pub fn git_status_native_impl(project_path: String) -> Result<StatusResult, String> {
    let repo = repo_open(&project_path)?;

    let current_branch = match repo.head() {
        Ok(head) => {
            if head.is_branch() {
                head.shorthand().unwrap_or("HEAD").to_string()
            } else {
                "HEAD".to_string()
            }
        }
        Err(_) => String::new(),
    };

    let is_merge_in_progress = repo.path().join("MERGE_HEAD").exists();
    let is_rebase_in_progress = repo.path().join("rebase-merge").exists() || repo.path().join("rebase-apply").exists();

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut files: Vec<StatusEntry> = Vec::new();
    let mut status_output = String::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();
        let (x, y) = status_to_xy(s);
        let state_code = format!("{}{}", x, y);
        
        // Build the status_output string (mimics git status -s -u)
        status_output.push_str(&format!("{} {}\n", state_code, path));

        let is_conflicted = matches!(
            state_code.as_str(),
            "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU"
        );
        let is_staged = x != ' ' && x != '?' && !is_conflicted;
        let is_unstaged = ((y != ' ' && y != '?') || state_code == "??") && !is_conflicted;

        files.push(StatusEntry {
            file: path,
            state_code,
            is_staged,
            is_unstaged,
            is_conflicted,
        });
    }

    Ok(StatusResult { files, current_branch, is_merge_in_progress, is_rebase_in_progress, status_output })
}

pub fn git_add_native_impl(project_path: String, path_to_add: String) -> Result<(), String> {
    let repo = repo_open(&project_path)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;

    if path_to_add == "." {
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(|e| e.to_string())?;
    } else {
        index.add_path(Path::new(&path_to_add)).map_err(|e| e.to_string())?;
    }

    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn git_reset_native_impl(project_path: String, path_to_reset: String) -> Result<(), String> {
    let repo = repo_open(&project_path)?;
    
    let head = repo.head();
    if let Ok(head_ref) = head {
        let commit = head_ref.peel_to_commit().map_err(|e| e.to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;
        
        if path_to_reset == "." {
            repo.reset(tree.as_object(), git2::ResetType::Soft, None).map_err(|e| e.to_string())?;
        } else {
            // Reset individual file from HEAD
            let mut index = repo.index().map_err(|e| e.to_string())?;
            if let Ok(entry) = tree.get_path(Path::new(&path_to_reset)) {
                // The correct way in git2 to unstage a single file is to replace its index entry with the one from the tree
                let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
                
                // Construct a new entry for the index based on the HEAD state
                let index_entry = git2::IndexEntry {
                    ctime: git2::IndexTime::new(0,0),
                    mtime: git2::IndexTime::new(0,0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: blob.size() as u32,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: path_to_reset.as_bytes().to_vec(),
                };
                index.add(&index_entry).map_err(|e| e.to_string())?;
            } else {
                // If it's not in HEAD, it was a new file (Added), so we just remove it from the index
                index.remove_path(Path::new(&path_to_reset)).map_err(|e| e.to_string())?;
            }
            index.write().map_err(|e| e.to_string())?;
        }
    } else {
        // No HEAD yet (Empty repo), unstage means remove from index
        let mut index = repo.index().map_err(|e| e.to_string())?;
        if path_to_reset == "." {
            index.clear().map_err(|e| e.to_string())?;
        } else {
            index.remove_path(Path::new(&path_to_reset)).map_err(|e| e.to_string())?;
        }
        index.write().map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

pub fn git_commit_native_impl(
    project_path: String,
    message: String,
    amend: bool,
) -> Result<String, String> {
    let repo = repo_open(&project_path)?;
    let config = repo.config().map_err(|e| e.to_string())?;

    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".into());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".into());
    let sig = git2::Signature::now(&name, &email).map_err(|e| e.to_string())?;

    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    if amend {
        let head_commit = repo.head().map_err(|e| e.to_string())?
            .peel_to_commit().map_err(|e| e.to_string())?;
        let _ = head_commit.amend(Some("HEAD"), Some(&sig), Some(&sig), None, Some(&message), Some(&tree))
            .map_err(|e| e.to_string())?;
        return Ok("Commit amended successfully".into());
    }

    let parent_commit = if let Ok(head) = repo.head() {
        Some(head.peel_to_commit().map_err(|e| e.to_string())?)
    } else {
        None
    };

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();
    let commit_id = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(format!("Commit created: {}", commit_id))
}

pub async fn git_push_native_impl(project_path: String, force: bool) -> Result<String, String> {
    let path = project_path.clone();
    tokio::task::spawn_blocking(move || {
        let repo = repo_open(&path)?;
        let auth = make_auth();

        let head = repo.head().map_err(|e| e.to_string())?;
        let branch_name = head.shorthand().ok_or("HEAD is detached")?.to_string();
        
        let remote_name = repo.branch_upstream_remote(&format!("refs/heads/{}", branch_name))
            .ok()
            .and_then(|buf| buf.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "origin".to_string());

        let mut remote = repo.find_remote(&remote_name).map_err(|e| e.to_string())?;
        let refspec = format!("{}refs/heads/{}:refs/heads/{}",
            if force { "+" } else { "" }, branch_name, branch_name);

        match auth.push(&repo, &mut remote, &[&refspec]) {
            Ok(_) => Ok(format!("Pushed '{}' to {}", branch_name, remote_name)),
            Err(e) => Err(format!("Push failed: {}", e)),
        }
    }).await.map_err(|e| e.to_string())?
}

pub async fn git_pull_native_impl(project_path: String) -> Result<String, String> {
    let path = project_path.clone();
    
    // 1. Fetch
    let _fetch_res = tokio::task::spawn_blocking({
        let p = path.clone();
        move || {
            let repo = repo_open(&p)?;
            let remote_names = repo.remotes().map_err(|e| e.to_string())?;
            let remote_name = remote_names.iter().flatten()
                .find(|&r| r == "origin")
                .or_else(|| remote_names.iter().flatten().next())
                .ok_or("No remotes configured")?;
            
            fetch_remote_native(&repo, remote_name)?;
            Ok::<String, String>(remote_name.to_string())
        }
    }).await.map_err(|e| e.to_string())??;

    // 2. Merge Analysis + Fast-Forward
    tokio::task::spawn_blocking(move || {
        use git2::MergeAnalysis;
        let repo = repo_open(&path)?;

        let head = repo.head().map_err(|e| e.to_string())?;
        let branch_name = head.shorthand().ok_or("HEAD is detached")?.to_string();
        
        let branch = repo.find_branch(&branch_name, git2::BranchType::Local).map_err(|e| e.to_string())?;
        let upstream = branch.upstream().map_err(|_| "No upstream configured for current branch")?;
        let upstream_commit = upstream.get().peel_to_commit().map_err(|e| e.to_string())?;
        
        let annotated_upstream = repo.find_annotated_commit(upstream_commit.id()).map_err(|e| e.to_string())?;
        let (analysis, _) = repo.merge_analysis(&[&annotated_upstream]).map_err(|e| e.to_string())?;

        if analysis.contains(MergeAnalysis::ANALYSIS_UP_TO_DATE) {
            return Ok("Already up to date.".into());
        }

        if analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD) {
            let mut co = git2::build::CheckoutBuilder::new();
            co.safe();
            repo.checkout_tree(upstream_commit.as_object(), Some(&mut co)).map_err(|e| e.to_string())?;
            
            let mut head_ref = repo.find_reference(&format!("refs/heads/{}", branch_name)).map_err(|e| e.to_string())?;
            head_ref.set_target(upstream_commit.id(), "pull: fast-forward").map_err(|e| e.to_string())?;
            
            Ok(format!("Fast-forwarded to {}", &upstream_commit.id().to_string()[..7]))
        } else {
            Err("Pull failed: Non-fast-forward merge required. Please stash your changes or use manual merge/rebase.".into())
        }
    }).await.map_err(|e| e.to_string())?
}

pub fn git_branch_delete_native_impl(project_path: String, branch_name: String, force: bool) -> Result<String, String> {
    let repo = repo_open(&project_path)?;
    let mut branch = repo.find_branch(&branch_name, git2::BranchType::Local).map_err(|e| e.to_string())?;
    
    if !force {
        let upstream = branch.upstream();
        let is_merged = if let Ok(up) = upstream {
            let up_id = up.get().peel_to_commit().map_err(|e| e.to_string())?.id();
            let local_id = branch.get().peel_to_commit().map_err(|e| e.to_string())?.id();
            let (ahead, _) = repo.graph_ahead_behind(local_id, up_id).unwrap_or((1, 0));
            ahead == 0
        } else { false };

        if !is_merged {
            return Err(format!("The branch '{}' is not fully merged. Use -D to force delete.", branch_name));
        }
    }
    
    branch.delete().map_err(|e| e.to_string())?;
    Ok(format!("Deleted branch {}.", branch_name))
}

fn status_to_xy(s: git2::Status) -> (char, char) {
    use git2::Status;

    if s.contains(Status::CONFLICTED) {
        return ('U', 'U');
    }

    let x = if s.contains(Status::INDEX_NEW) { 'A' }
        else if s.contains(Status::INDEX_MODIFIED) { 'M' }
        else if s.contains(Status::INDEX_DELETED) { 'D' }
        else if s.contains(Status::INDEX_RENAMED) { 'R' }
        else if s.contains(Status::INDEX_TYPECHANGE) { 'T' }
        else { ' ' };

    let y = if s.contains(Status::WT_NEW) { '?' }
        else if s.contains(Status::WT_MODIFIED) { 'M' }
        else if s.contains(Status::WT_DELETED) { 'D' }
        else if s.contains(Status::WT_RENAMED) { 'R' }
        else if s.contains(Status::WT_TYPECHANGE) { 'T' }
        else { ' ' };

    if x == ' ' && y == '?' {
        return ('?', '?');
    }

    (x, y)
}

// ── Git Log via gix (fast parallel traversal) ─────────────────────────────────

/// Return ALL local (unpushed) commits + up to 100 pushed commits from HEAD.
/// Uses `gix` for the O(n log n) commit graph walk — much faster than git2 on large repos.
pub fn git_log_native_impl(project_path: String) -> Result<LogResult, String> {


    // Open with gix (read-only, thread-safe)
    let gix_repo = gix::open(&project_path).map_err(|e| e.to_string())?;

    // We still need git2 for the refs map & local-hash detection (it's already cached).
    let git2_repo = repo_open(&project_path)?;
    let refs_map = build_refs_map(&git2_repo);
    let local_oid_set_git2 = collect_local_oids(&git2_repo);
    // Convert to gix ObjectId set for easy lookup
    let local_hashes_str: Vec<String> = local_oid_set_git2.iter().map(|o| format!("{}", o)).collect();
    let local_hash_set: HashSet<String> = local_hashes_str.iter().cloned().collect();

    // Walk commits from HEAD using gix
    let head_id = gix_repo.head_id().map_err(|e| e.to_string())?;

    let mut commits: Vec<CommitEntry> = Vec::new();
    let mut pushed_count: usize = 0;
    const MAX_PUSHED: usize = 100;

    let walk = head_id
        .ancestors()
        .sorting(gix::traverse::commit::simple::Sorting::ByCommitTimeNewestFirst)
        .all()
        .map_err(|e| e.to_string())?;

    for info in walk {
        let info = info.map_err(|e| e.to_string())?;
        let oid = info.id;
        let hash = oid.to_string();
        let is_local = local_hash_set.contains(&hash);

        if !is_local {
            if pushed_count >= MAX_PUSHED { break; }
            pushed_count += 1;
        }

        let commit = gix_repo.find_commit(oid).map_err(|e| e.to_string())?;
        let short_hash = hash[..7.min(hash.len())].to_string();

        let parents: Vec<String> = commit.parent_ids()
            .map(|p| {
                let s = p.to_string();
                s[..7.min(s.len())].to_string()
            })
            .collect();

        let sig = commit.author().map_err(|e| e.to_string())?;
        let author = sig.name.to_string();
        let seconds = sig.time.seconds;
        let date = format_relative(seconds);
        let message = commit.message_raw().map_err(|e| e.to_string())?;
        let message = message.to_string().lines().next().unwrap_or("").to_string();

        // Refs label via git2 refs_map (already built)
        let git2_oid = git2::Oid::from_str(&hash).unwrap_or(git2::Oid::zero());
        let refs = refs_map.get(&git2_oid).map(|v| v.join(", ")).unwrap_or_default();

        commits.push(CommitEntry { hash, short_hash, parents, author, date, message, refs });
    }

    Ok(LogResult { commits, local_hashes: local_hashes_str })
}

// ── Ahead / Behind  (git2 — network safe) ─────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AheadBehindResult {
    pub ahead: usize,
    pub behind: usize,
    pub has_upstream: bool,
}

/// Build an `auth_git2` authenticator that reads from the system credential store
/// (git config credential.helper, SSH agent, etc.).
fn make_auth() -> auth_git2::GitAuthenticator {
    auth_git2::GitAuthenticator::new_empty()
        .add_default_username()
        .try_cred_helper(true)
        .try_ssh_agent(true)
        .add_default_ssh_keys()
}

pub fn fetch_remote_native(repo: &git2::Repository, remote_name: &str) -> Result<(), String> {
    let auth = make_auth();
    let mut remote = repo.find_remote(remote_name).map_err(|e| e.to_string())?;
    
    // auth.fetch is synchronous network I/O
    auth.fetch(repo, &mut remote, &[] as &[&str], None).map_err(|e| e.to_string())
}

/// Compute ahead/behind using git2's graph API based on local data.
/// No network fetch is performed here (handled by the watcher).
pub async fn git_ahead_behind_native_impl(project_path: String) -> Result<AheadBehindResult, String> {
    let repo = repo_open(&project_path)?;

    let head = repo.head().map_err(|e| e.to_string())?;
    if !head.is_branch() {
        return Ok(AheadBehindResult { ahead: 0, behind: 0, has_upstream: false });
    }

    let branch_name = head.shorthand().ok_or("no branch name")?.to_string();
    let branch = repo.find_branch(&branch_name, git2::BranchType::Local)
        .map_err(|e| e.to_string())?;

    let upstream = match branch.upstream() {
        Ok(u) => u,
        Err(_) => return Ok(AheadBehindResult { ahead: 0, behind: 0, has_upstream: false }),
    };

    let local_oid = head.peel_to_commit().map_err(|e| e.to_string())?.id();
    let upstream_oid = upstream.get().peel_to_commit().map_err(|e| e.to_string())?.id();

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| e.to_string())?;

    Ok(AheadBehindResult { ahead, behind, has_upstream: true })
}

pub fn git_get_diff_model_native_impl(
    project_path: String,
    file_path: String,
    mode: String,
) -> Result<DiffModelResult, String> {
    let repo = repo_open(&project_path)?;
    let mut original = String::new();
    let mut modified = String::new();

    if mode == "staged" {
        // Original: HEAD
        if let Ok(head) = repo.head() {
            if let Ok(commit) = head.peel_to_commit() {
                if let Ok(tree) = commit.tree() {
                    if let Ok(entry) = tree.get_path(Path::new(&file_path)) {
                        if let Ok(obj) = entry.to_object(&repo) {
                            if let Some(blob) = obj.as_blob() {
                                original = String::from_utf8_lossy(blob.content()).to_string();
                            }
                        }
                    }
                }
            }
        }
        // Modified: Index
        let index = repo.index().map_err(|e| e.to_string())?;
        if let Some(entry) = index.get_path(Path::new(&file_path), 0) {
            if let Ok(blob) = repo.find_blob(entry.id) {
                modified = String::from_utf8_lossy(blob.content()).to_string();
            }
        }
    } else {
        // Mode: unstaged
        // Original: Index (if exists) else HEAD
        let index = repo.index().map_err(|e| e.to_string())?;
        let mut found_in_index = false;
        if let Some(entry) = index.get_path(Path::new(&file_path), 0) {
            if let Ok(blob) = repo.find_blob(entry.id) {
                original = String::from_utf8_lossy(blob.content()).to_string();
                found_in_index = true;
            }
        }
        
        if !found_in_index {
             if let Ok(head) = repo.head() {
                if let Ok(commit) = head.peel_to_commit() {
                    if let Ok(tree) = commit.tree() {
                        if let Ok(entry) = tree.get_path(Path::new(&file_path)) {
                            if let Ok(obj) = entry.to_object(&repo) {
                                if let Some(blob) = obj.as_blob() {
                                    original = String::from_utf8_lossy(blob.content()).to_string();
                                }
                            }
                        }
                    }
                }
            }
        }

        // Modified: Working Directory
        let full_path = Path::new(&project_path).join(&file_path);
        if full_path.exists() {
            modified = fs::read_to_string(full_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(DiffModelResult { original, modified })
}

/// Read raw content of a file at any git revision.
/// `rev_path` is a revspec like `"abc1234:src/foo.ts"` or `"HEAD~1:bar.rs"`.
/// Returns the file bytes as UTF-8 text in `stdout` (same contract as `git show`).
pub fn git_blob_at_revision_impl(
    project_path: String,
    rev_path: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = repo.revparse_single(&rev_path).map_err(|e| {
        format!("git show {}: {}", rev_path, e)
    })?;
    let blob = obj.peel_to_blob().map_err(|_| {
        format!("'{}' is not a blob (it may be a tree/commit)", rev_path)
    })?;
    let content = String::from_utf8_lossy(blob.content()).into_owned();
    Ok(crate::git_diff::GitResult {
        stdout: content,
        stderr: String::new(),
        success: true,
    })
}

pub fn git_show_name_status_impl(
    project_path: String,
    hash: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = repo.revparse_single(&hash).map_err(|e| format!("revparse {}: {}", hash, e))?;
    let commit = obj.as_commit().ok_or_else(|| format!("'{}' is not a commit", hash))?;
    
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0).map_err(|e| e.to_string())?.tree().map_err(|e| e.to_string())?)
    } else {
        None
    };

    let mut opts = git2::DiffOptions::new();
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut output = String::new();
    diff.print(git2::DiffFormat::NameStatus, |_delta, _hunk, line| {
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    }).map_err(|e| e.to_string())?;

    Ok(crate::git_diff::GitResult {
        stdout: output,
        stderr: String::new(),
        success: true,
    })
}

pub fn parse_stash_index_pub(stash_ref: &str) -> usize {
    // Parses "stash@{N}" -> N. Returns 0 as default.
    stash_ref
        .trim_start_matches("stash@{")
        .trim_end_matches('}')
        .parse()
        .unwrap_or(0)
}

pub fn git_stash_save_impl(
    project_path: String,
    message: String,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;

    // Robustness: Before stashing, we should update the index to reflect any deletions 
    // in the working directory. libgit2's stash_save can fail with 'stat' errors 
    // if a file is in the index but missing on disk.
    {
        let mut index = repo.index().map_err(|e| format!("index open: {}", e))?;
        // This removes entries from the index that no longer exist on disk
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(|e| format!("index sync: {}", e))?;
        index.write().map_err(|e| format!("index write: {}", e))?;
    }

    let config = repo.config().map_err(|e| e.to_string())?;
    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".into());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".into());
    let sig = git2::Signature::now(&name, &email).map_err(|e| e.to_string())?;

    let oid = repo
        .stash_save(&sig, &message, Some(git2::StashFlags::DEFAULT))
        .map_err(|e| format!("stash save: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Saved working directory and index state: {}", &oid.to_string()[..7]),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_stash_pop_impl(
    project_path: String,
    index: usize,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;
    let mut opts = git2::StashApplyOptions::new();
    opts.checkout_options({
        let mut co = git2::build::CheckoutBuilder::new();
        co.safe();
        co
    });

    repo.stash_pop(index, Some(&mut opts))
        .map_err(|e| format!("stash pop: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Dropped stash@{{{}}}", index),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_stash_drop_impl(
    project_path: String,
    index: usize,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;
    repo.stash_drop(index)
        .map_err(|e| format!("stash drop: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Dropped stash@{{{}}}", index),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_checkout_branch_impl(
    project_path: String,
    branch_name: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;

    // If already on this branch, it's a no-op
    if let Ok(head) = repo.head() {
        if head.shorthand() == Some(branch_name.as_str()) {
            return Ok(crate::git_diff::GitResult {
                stdout: format!("Already on '{}'", branch_name),
                stderr: String::new(),
                success: true,
            });
        }
    }

    // Try to find a local branch first
    let local_ref = format!("refs/heads/{}", branch_name);
    let has_local = repo.find_reference(&local_ref).is_ok();

    if !has_local {
        // Check for remote tracking branch origin/<name> and create local tracking branch
        let remote_ref = format!("refs/remotes/origin/{}", branch_name);
        if let Ok(remote) = repo.find_reference(&remote_ref) {
            let remote_commit = remote.peel_to_commit().map_err(|e| e.to_string())?;
            let mut new_branch = repo.branch(&branch_name, &remote_commit, false)
                .map_err(|e| format!("create branch: {}", e))?;
            // Set upstream tracking
            new_branch
                .set_upstream(Some(&format!("origin/{}", branch_name)))
                .ok(); // non-fatal if it fails
        } else {
            return Err(format!(
                "Branch '{}' not found locally or at origin",
                branch_name
            ));
        }
    }

    // Move HEAD and update workdir
    repo.set_head(&local_ref).map_err(|e| format!("set_head: {}", e))?;
    let mut co = git2::build::CheckoutBuilder::new();
    co.safe();
    repo.checkout_head(Some(&mut co))
        .map_err(|e| format!("checkout_head: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Switched to branch '{}'", branch_name),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_restore_workdir_impl(
    project_path: String,
    file_path: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let mut cb = git2::build::CheckoutBuilder::new();
    cb.path(&file_path).force().update_index(false);
    repo.checkout_index(None, Some(&mut cb))
        .map_err(|e| format!("restore {}: {}", file_path, e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("Restored '{}'", file_path),
        stderr: String::new(),
        success: true,
    })
}

fn resolve_to_commit_object<'a>(repo: &'a git2::Repository, target: &str) -> Result<git2::Object<'a>, String> {
    repo.revparse_single(target)
        .map_err(|e| format!("resolve '{}': {}", target, e))?
        .peel(git2::ObjectType::Commit)
        .map_err(|e| format!("peel to commit '{}': {}", target, e))
}

pub fn git_reset_soft_impl(
    project_path: String,
    target: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = resolve_to_commit_object(&repo, &target)?;
    repo.reset(&obj, git2::ResetType::Soft, None)
        .map_err(|e| format!("reset --soft: {}", e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("HEAD is now at (soft reset to {})", &target),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_reset_hard_impl(
    project_path: String,
    target: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = resolve_to_commit_object(&repo, &target)?;
    let mut co = git2::build::CheckoutBuilder::new();
    co.force();
    repo.reset(&obj, git2::ResetType::Hard, Some(&mut co))
        .map_err(|e| format!("reset --hard: {}", e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("HEAD is now at (hard reset to {})", &target),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_config_get_impl(

    project_path: String,
    key: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let config = repo.config().map_err(|e| e.to_string())?;
    match config.get_string(&key) {
        Ok(value) => Ok(crate::git_diff::GitResult {
            stdout: value,
            stderr: String::new(),
            success: true,
        }),
        Err(e) => Ok(crate::git_diff::GitResult {
            stdout: String::new(),
            stderr: e.to_string(),
            success: false,
        }),
    }
}


// ── Internal helpers (git2) ───────────────────────────────────────────────────

fn collect_local_oids(repo: &Repository) -> HashSet<git2::Oid> {
    let upstream_oid = repo
        .head().ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .and_then(|name| repo.find_branch(&name, BranchType::Local).ok())
        .and_then(|b| b.upstream().ok())
        .and_then(|u| u.get().peel_to_commit().ok())
        .map(|c| c.id());

    let mut revwalk = match repo.revwalk() {
        Ok(r) => r,
        Err(_) => return HashSet::new(),
    };

    if revwalk.push_head().is_err() { return HashSet::new(); }

    if let Some(upstream) = upstream_oid {
        if revwalk.hide(upstream).is_err() { return HashSet::new(); }
    }
    let _ = revwalk.set_sorting(git2::Sort::TIME);

    revwalk
        .filter_map(|r| r.ok())
        .take(if upstream_oid.is_none() { 500 } else { usize::MAX })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn init_test_repo() -> (tempfile::TempDir, git2::Repository) {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        {
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@test.com").unwrap();
        }
        (dir, repo)
    }

    fn make_commit(repo: &git2::Repository, file: &str, content: &str, msg: &str) -> git2::Oid {
        let path = repo.workdir().unwrap().join(file);
        std::fs::write(&path, content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new(file)).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().ok().map(|h| h.peel_to_commit().unwrap());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents).unwrap()
    }

    #[test]
    fn test_blob_at_revision_exact_hash() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        let oid = make_commit(&repo, "hello.txt", "hello world", "first commit");
        // hash:path
        let rev = format!("{}:hello.txt", oid);
        let result = git_blob_at_revision_impl(project_path, rev).unwrap();
        assert_eq!(result.stdout, "hello world");
        assert!(result.success);
    }

    #[test]
    fn test_blob_at_revision_parent_syntax() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "hello.txt", "v1", "first");
        let oid2 = make_commit(&repo, "hello.txt", "v2", "second");
        // hash^:path should give v1 (parent content)
        let rev = format!("{}^:hello.txt", oid2);
        let result = git_blob_at_revision_impl(project_path, rev).unwrap();
        assert_eq!(result.stdout, "v1");
    }

    #[test]
    fn test_config_get_user_name() {
        let (dir, _repo) = init_test_repo(); // sets user.name = "Test"
        let result = git_config_get_impl(
            dir.path().to_str().unwrap().to_string(),
            "user.name".to_string(),
        ).unwrap();
        assert_eq!(result.stdout.trim(), "Test");
        assert!(result.success);
    }

    #[test]
    fn test_stash_save_and_pop() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        // Create initial commit so HEAD exists
        make_commit(&repo, "file.txt", "initial", "init");
        // Make a dirty change
        std::fs::write(dir.path().join("file.txt"), "dirty").unwrap();

        // Save stash
        let save_res = git_stash_save_impl(project_path.clone(), "my stash".to_string()).unwrap();
        assert!(save_res.success, "stash save failed: {}", save_res.stderr);

        // Workdir should be clean now
        let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
        assert_eq!(content, "initial");

        // Pop stash (index 0)
        let pop_res = git_stash_pop_impl(project_path.clone(), 0).unwrap();
        assert!(pop_res.success, "stash pop failed: {}", pop_res.stderr);

        // Workdir should have the dirty change back
        let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
        assert_eq!(content, "dirty");
    }

    #[test]
    fn test_stash_save_with_deleted_file() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "to_delete.txt", "v1", "init");

        // Physically delete the file without git rm
        std::fs::remove_file(dir.path().join("to_delete.txt")).unwrap();

        // Stash should now succeed because we sync the index before stashing
        let res = git_stash_save_impl(project_path, "stash deleted file".to_string()).unwrap();
        assert!(res.success, "Stash failed with deleted file: {}", res.stderr);
    }

    #[test]
    fn test_checkout_existing_branch() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "a.txt", "hello", "init");

        // Create a second branch from current HEAD
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head, false).unwrap();

        // Now checkout feature
        let res = git_checkout_branch_impl(project_path.clone(), "feature".to_string()).unwrap();
        assert!(res.success, "checkout failed: {}", res.stderr);

        // HEAD should now be on feature
        let new_head = repo.head().unwrap();
        assert_eq!(new_head.shorthand().unwrap(), "feature");
    }

    #[test]
    fn test_checkout_current_branch_is_noop() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "a.txt", "hello", "init");
        let branch = repo.head().unwrap().shorthand().unwrap().to_string();

        // Checking out the current branch should succeed without error
        let res = git_checkout_branch_impl(project_path, branch).unwrap();
        assert!(res.success);
    }

    #[test]
    fn test_restore_workdir() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "a.txt", "committed content", "init");

        // Make a dirty workdir change
        std::fs::write(dir.path().join("a.txt"), "dirty").unwrap();

        // Restore the file
        let res = git_restore_workdir_impl(project_path.clone(), "a.txt".to_string()).unwrap();
        assert!(res.success, "{}", res.stderr);

        // File should be back to committed content
        let content = std::fs::read_to_string(dir.path().join("a.txt")).unwrap();
        assert_eq!(content, "committed content");
    }

    #[test]
    fn test_reset_soft() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "a.txt", "v1", "first");
        make_commit(&repo, "a.txt", "v2", "second");

        // Soft reset to HEAD~1 - keep changes staged
        let res = git_reset_soft_impl(project_path.clone(), "HEAD~1".to_string()).unwrap();
        assert!(res.success, "{}", res.stderr);

        // HEAD should now point to first commit
        let head_msg = repo.head().unwrap().peel_to_commit().unwrap().message().unwrap().to_string();
        assert!(head_msg.contains("first"));
    }

    #[test]
    fn test_reset_hard() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "a.txt", "v1", "first");
        make_commit(&repo, "a.txt", "v2", "second");

        let first_hash = repo.revparse_single("HEAD~1").unwrap().id().to_string();
        let res = git_reset_hard_impl(project_path.clone(), first_hash).unwrap();
        assert!(res.success, "{}", res.stderr);

        let content = std::fs::read_to_string(dir.path().join("a.txt")).unwrap();
        assert_eq!(content, "v1");
    }
}




