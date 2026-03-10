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

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut files: Vec<StatusEntry> = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();
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

/// Run `git fetch` (via tokio::process with GIT_TERMINAL_PROMPT=0) then compute
/// ahead/behind using git2's graph API — no subprocess for the count itself.
pub async fn git_ahead_behind_native_impl(project_path: String) -> Result<AheadBehindResult, String> {
    // Fetch from remote — ignore errors (offline / no remote)
    #[allow(unused_mut)]
    let mut fetch_cmd = tokio::process::Command::new("git");
    fetch_cmd.args(["fetch", "--quiet", "--no-tags"])
        .current_dir(&project_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "echo")
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "100")
        .env("GIT_HTTP_LOW_SPEED_TIME", "10")
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.connectTimeout")
        .env("GIT_CONFIG_VALUE_0", "10")
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10 -o BatchMode=yes");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        fetch_cmd.creation_flags(0x08000000);
    }
    let _ = fetch_cmd.output().await;

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
