use git2::{Repository, StatusOptions, BranchType};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

// ── Return types ──────────────────────────────────────────────────────────────

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

fn repo_open(project_path: &str) -> Result<Repository, String> {
    Repository::open(project_path).map_err(|e| e.to_string())
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
/// This is O(branches + tags) vs the old O(commits × branches).
fn build_refs_map(repo: &Repository) -> HashMap<git2::Oid, Vec<String>> {
    let mut map: HashMap<git2::Oid, Vec<String>> = HashMap::new();

    // Local branches
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

    // Remote branches (skip remote HEAD symrefs)
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

    // Tags
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

/// Check if a directory is a git repository and if it has any commits.
pub fn git_is_repo_native_impl(project_path: String) -> IsRepoResult {
    match repo_open(&project_path) {
        Err(_) => IsRepoResult { is_git_repo: false, has_commits: false },
        Ok(repo) => {
            let has_commits = repo.head().is_ok();
            IsRepoResult { is_git_repo: true, has_commits }
        }
    }
}

/// Return local branches, remote branches, and stash list.
pub fn git_branches_native_impl(project_path: String) -> Result<BranchesResult, String> {
    let mut repo = repo_open(&project_path)?;

    // Local branches
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

    // Remote branches (exclude HEAD pointers like "origin/HEAD -> origin/main")
    let mut remote: Vec<String> = Vec::new();
    if let Ok(remotes) = repo.branches(Some(BranchType::Remote)) {
        for b in remotes.flatten() {
            if let Ok(Some(name)) = b.0.name() {
                // Skip remote HEAD symrefs
                if !name.ends_with("/HEAD") {
                    remote.push(name.to_string());
                }
            }
        }
    }

    // Stashes: git2 stash_foreach gives us the message for each stash entry
    let mut stashes: Vec<String> = Vec::new();
    let _ = repo.stash_foreach(|_idx, message, _oid| {
        stashes.push(message.to_string());
        true
    });

    Ok(BranchesResult { local, remote, stashes })
}

/// Return working-tree status, current branch name, and merge-in-progress flag.
pub fn git_status_native_impl(project_path: String) -> Result<StatusResult, String> {
    let repo = repo_open(&project_path)?;

    // Current branch
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

    // Merge in progress: MERGE_HEAD file exists
    let is_merge_in_progress = repo.path().join("MERGE_HEAD").exists();

    // File statuses
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut files: Vec<StatusEntry> = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        // Map git2 status flags to a 2-char XY state code (like `git status --short`)
        let (x, y) = status_to_xy(s);
        let state_code = format!("{}{}", x, y);

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

    Ok(StatusResult { files, current_branch, is_merge_in_progress })
}

/// Map git2 Status flags to XY chars (index char, worktree char).
fn status_to_xy(s: git2::Status) -> (char, char) {
    use git2::Status;

    // Conflicted states
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

    // Untracked: both chars are '?'
    if x == ' ' && y == '?' {
        return ('?', '?');
    }

    (x, y)
}

/// Return ALL local (unpushed) commits + up to 100 pushed commits from HEAD.
/// local_hashes contains the full hashes of every unpushed commit (no limit).
pub fn git_log_native_impl(project_path: String) -> Result<LogResult, String> {
    let repo = repo_open(&project_path)?;

    // Build refs map once — O(branches + tags), not O(commits × branches)
    let refs_map = build_refs_map(&repo);

    // Collect all local (unpushed) oids into a set — no limit
    let local_oid_set = collect_local_oids(&repo);
    let local_hashes: Vec<String> = local_oid_set.iter().map(|o| format!("{}", o)).collect();

    // Walk HEAD: include every local commit + up to 100 pushed commits
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| e.to_string())?;

    let mut commits: Vec<CommitEntry> = Vec::new();
    let mut pushed_count: usize = 0;
    const MAX_PUSHED: usize = 100;

    for oid_res in revwalk {
        let oid = oid_res.map_err(|e| e.to_string())?;
        let is_local = local_oid_set.contains(&oid);

        if !is_local {
            if pushed_count >= MAX_PUSHED { break; }
            pushed_count += 1;
        }

        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let hash = format!("{}", oid);
        let short_hash = hash[..7.min(hash.len())].to_string();

        let parents: Vec<String> = (0..commit.parent_count())
            .map(|i| {
                let p = format!("{}", commit.parent_id(i).unwrap_or(oid));
                p[..7.min(p.len())].to_string()
            })
            .collect();

        let author = commit.author().name().unwrap_or("").to_string();
        let date = format_relative(commit.author().when().seconds());
        let message = commit.summary().unwrap_or("").to_string();
        let refs = refs_map.get(&oid).map(|v| v.join(", ")).unwrap_or_default();

        commits.push(CommitEntry { hash, short_hash, parents, author, date, message, refs });
    }

    Ok(LogResult { commits, local_hashes })
}

// ── Ahead / Behind ────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AheadBehindResult {
    pub ahead: usize,
    pub behind: usize,
    pub has_upstream: bool,
}

/// Run `git fetch` then compute how many commits the current branch is
/// ahead of / behind its upstream tracking branch.
pub async fn git_ahead_behind_native_impl(project_path: String) -> Result<AheadBehindResult, String> {
    // Fetch from remote — ignore errors (offline / no remote)
    let _ = tokio::process::Command::new("git")
        .args(["fetch", "--quiet", "--no-tags"])
        .current_dir(&project_path)
        .output()
        .await;

    let repo = repo_open(&project_path)?;

    let head = repo.head().map_err(|e| e.to_string())?;
    if !head.is_branch() {
        return Ok(AheadBehindResult { ahead: 0, behind: 0, has_upstream: false });
    }

    let branch_name = head.shorthand().ok_or("no branch name")?.to_string();
    let branch = repo.find_branch(&branch_name, BranchType::Local)
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

/// Collect all oids reachable from HEAD but not from upstream (unpushed).
/// If no upstream is configured, treats ALL commits as local.
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
        // Only commits not reachable from upstream
        if revwalk.hide(upstream).is_err() { return HashSet::new(); }
    }
    // If no upstream: all commits are "local" — we limit this to avoid huge sets
    // on repos with no remote by capping at 500
    let _ = revwalk.set_sorting(git2::Sort::TIME);

    revwalk
        .filter_map(|r| r.ok())
        .take(if upstream_oid.is_none() { 500 } else { usize::MAX })
        .collect()
}
