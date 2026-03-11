use serde::{Deserialize, Serialize};

use imara_diff::{Algorithm, BasicLineDiffPrinter, Diff, InternedInput, UnifiedDiffConfig};
use tauri::AppHandle;
use tokio::process::Command as AsyncCommand;

use std::fs;
use std::path::Path;

/// Hunk con rangos 1-based para enviar al frontend (coincide con formato unified diff).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkInfo {
    pub id: usize,
    /// Primera línea en original (1-based)
    pub old_start: u32,
    /// Número de líneas en original
    pub old_count: u32,
    /// Primera línea en modified (1-based)
    pub new_start: u32,
    /// Número de líneas en modified
    pub new_count: u32,
}

/// Resultado del diff: diff unificado + hunks estructurados para aceptar/rechazar.
#[derive(Serialize)]
pub struct DiffHunksResult {
    pub unified_diff: String,
    pub hunks: Vec<HunkInfo>,
}

/// Computes unified diff from original and modified content using imara-diff (Rust).
pub fn compute_unified_diff_impl(
    original: String,
    modified: String,
    file_path: String,
) -> Result<String, String> {
    let original_norm = original.replace("\r\n", "\n");
    let modified_norm = modified.replace("\r\n", "\n");
    let input = InternedInput::new(original_norm.as_str(), modified_norm.as_str());
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);
    let printer = BasicLineDiffPrinter(&input.interner);
    let body = diff
        .unified_diff(&printer, UnifiedDiffConfig::default(), &input)
        .to_string();
    let header = format!("--- a/{}\n+++ b/{}\n", file_path, file_path);
    Ok(header + &body)
}

fn parse_hunks_from_unified_body(body: &str) -> Vec<HunkInfo> {
    let mut hunks = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.starts_with("@@ ") && line.ends_with(" @@") {
            let inner = &line[3..line.len() - 3];
            let parts: Vec<&str> = inner.split_whitespace().collect();
            if parts.len() >= 2 {
                let old_part = parts[0];
                let new_part = parts[1];
                let parse_range = |s: &str| -> (u32, u32) {
                    let s = s.trim_start_matches('-').trim_start_matches('+');
                    let mut it = s.split(',');
                    let start: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(1);
                    let count: u32 = it.next().and_then(|x| x.parse().ok()).unwrap_or(1);
                    (start, count)
                };
                let (old_start, old_count) = parse_range(old_part);
                let (new_start, new_count) = parse_range(new_part);
                hunks.push(HunkInfo {
                    id: hunks.len(),
                    old_start,
                    old_count,
                    new_start,
                    new_count,
                });
            }
        }
    }
    hunks
}

pub fn compute_diff_hunks_impl(
    original: String,
    modified: String,
    file_path: String,
) -> Result<DiffHunksResult, String> {
    let original_norm = original.replace("\r\n", "\n");
    let modified_norm = modified.replace("\r\n", "\n");
    let input = InternedInput::new(original_norm.as_str(), modified_norm.as_str());
    let diff = Diff::compute(Algorithm::Histogram, &input);
    let printer = BasicLineDiffPrinter(&input.interner);
    let body = diff
        .unified_diff(&printer, UnifiedDiffConfig::default(), &input)
        .to_string();
    let header = format!("--- a/{}\n+++ b/{}\n", file_path, file_path);
    let unified_diff = header + &body;
    let hunks = parse_hunks_from_unified_body(&body);
    Ok(DiffHunksResult { unified_diff, hunks })
}

pub fn apply_rejected_hunks_impl(
    original: String,
    modified: String,
    hunks: Vec<HunkInfo>,
    reject_indices: Vec<usize>,
) -> Result<String, String> {
    if reject_indices.is_empty() {
        return Ok(modified);
    }
    let orig_lines: Vec<&str> = original.lines().collect();
    let mut mod_lines: Vec<String> = modified.lines().map(String::from).collect();

    let to_reject: Vec<&HunkInfo> = reject_indices
        .iter()
        .filter_map(|&i| hunks.get(i))
        .collect();
    if to_reject.is_empty() {
        return Ok(modified);
    }
    let mut sorted: Vec<&HunkInfo> = to_reject.iter().copied().collect();
    sorted.sort_by(|a, b| b.new_start.cmp(&a.new_start));

    for h in sorted {
        let old_start_0 = (h.old_start as usize).saturating_sub(1);
        let old_end = (old_start_0 + h.old_count as usize).min(orig_lines.len());
        let new_start_0 = (h.new_start as usize).saturating_sub(1);
        let new_end = (new_start_0 + h.new_count as usize).min(mod_lines.len());
        if new_start_0 > mod_lines.len() || old_start_0 > orig_lines.len() {
            continue;
        }
        let replacement: Vec<String> = orig_lines[old_start_0..old_end]
            .iter()
            .map(|s| s.to_string())
            .collect();
        mod_lines.splice(new_start_0..new_end, replacement);
    }

    let out_str = if modified.contains("\r\n") {
        mod_lines.join("\r\n")
    } else {
        mod_lines.join("\n")
    };
    Ok(out_str)
}

// ─── Git Integration ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct GitResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[derive(Serialize, Clone)]
pub struct GitLogPayload {
    pub project_path: String,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
}

// ── Credential helper (shared by push / fetch) ─────────────────────────────────

/// Build an `auth_git2` authenticator that reads from the system credential store
/// (git config credential.helper, SSH agent, etc.).
fn make_auth() -> auth_git2::GitAuthenticator {
    auth_git2::GitAuthenticator::new_empty()
        .add_default_username()
        .try_cred_helper(true)
        .try_ssh_agent(true)
        .add_default_ssh_keys()
}

// ── Native git2 handlers ───────────────────────────────────────────────────────

fn git2_commit(project_path: &str, args: &[String]) -> Result<GitResult, String> {
    use git2::Repository;

    // Parse args: expect ["commit", "-m", "<message>"] or ["commit", "--amend", "-m", "<message>"]
    let mut message = String::new();
    let mut amend = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "commit" => {}
            "--amend" => { amend = true; }
            "-m" | "--message" => {
                i += 1;
                if i < args.len() { message = args[i].clone(); }
            }
            _ => {}
        }
        i += 1;
    }
    if message.is_empty() {
        return Err("commit: no message provided".into());
    }

    let repo = Repository::discover(project_path).map_err(|e| e.to_string())?;
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
        head_commit.amend(Some("HEAD"), Some(&sig), Some(&sig), None, Some(&message), Some(&tree))
            .map_err(|e| e.to_string())?;
        return Ok(GitResult {
            stdout: "[amended] commit updated".into(),
            stderr: String::new(),
            success: true,
        });
    }

    let parent_commit = if let Ok(head) = repo.head() {
        Some(head.peel_to_commit().map_err(|e| e.to_string())?)
    } else {
        None
    };

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();
    repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(GitResult {
        stdout: format!("[{}] {}", repo.head().map(|h| h.shorthand().unwrap_or("HEAD").to_string()).unwrap_or_default(), &message),
        stderr: String::new(),
        success: true,
    })
}

fn git2_checkout(project_path: &str, args: &[String]) -> Result<GitResult, String> {
    use git2::{Repository, build::CheckoutBuilder};

    let repo = Repository::discover(project_path).map_err(|e| e.to_string())?;
    // args: ["checkout", "<branch>"] or ["checkout", "-b", "<branch>"]
    let mut new_branch = false;
    let mut branch_name = String::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "checkout" => {}
            "-b" => { new_branch = true; }
            b => { branch_name = b.to_string(); }
        }
        i += 1;
    }
    if branch_name.is_empty() {
        return Err("checkout: no branch name provided".into());
    }

    if new_branch {
        let head = repo.head().map_err(|e| e.to_string())?.peel_to_commit().map_err(|e| e.to_string())?;
        let _branch = repo.branch(&branch_name, &head, false).map_err(|e| e.to_string())?;
    }

    let (object, reference) = repo.revparse_ext(&branch_name).map_err(|e| e.to_string())?;
    repo.checkout_tree(&object, Some(CheckoutBuilder::new().safe())).map_err(|e| e.to_string())?;
    match reference {
        Some(r) => repo.set_head(r.name().unwrap_or("HEAD")).map_err(|e| e.to_string())?,
        None => repo.set_head_detached(object.id()).map_err(|e| e.to_string())?,
    }

    Ok(GitResult {
        stdout: format!("Switched to branch '{}'", branch_name),
        stderr: String::new(),
        success: true,
    })
}

fn git2_branch_delete(project_path: &str, args: &[String]) -> Result<GitResult, String> {
    use git2::{Repository, BranchType};

    let repo = Repository::discover(project_path).map_err(|e| e.to_string())?;
    let force = args.contains(&"-D".to_string());
    let branch_name = args.iter().rev().find(|a| !a.starts_with('-')).cloned().unwrap_or_default();

    let mut branch = repo.find_branch(&branch_name, BranchType::Local).map_err(|e| e.to_string())?;
    if force {
        branch.delete().map_err(|e| e.to_string())?;
    } else {
        // Check if fully merged before deleting
        let upstream = branch.upstream();
        let is_merged = if let Ok(up) = upstream {
            let up_id = up.get().peel_to_commit().map_err(|e| e.to_string())?.id();
            let local_id = branch.get().peel_to_commit().map_err(|e| e.to_string())?.id();
            let (ahead, _) = repo.graph_ahead_behind(local_id, up_id).unwrap_or((1, 0));
            ahead == 0
        } else { false };

        if !is_merged {
            return Ok(GitResult {
                stdout: String::new(),
                stderr: format!("error: The branch '{}' is not fully merged. Use -D to force delete.", branch_name),
                success: false,
            });
        }
        branch.delete().map_err(|e| e.to_string())?;
    }

    Ok(GitResult {
        stdout: format!("Deleted branch {}.", branch_name),
        stderr: String::new(),
        success: true,
    })
}

async fn git2_fetch_native(project_path: &str) -> Result<GitResult, String> {
    let path = project_path.to_string();
    tokio::task::spawn_blocking(move || {
        use git2::Repository;
        let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
        let auth = make_auth();

        let remote_names = repo.remotes().map_err(|e| e.to_string())?;
        let origin = remote_names.iter().flatten()
            .find(|&r| r == "origin")
            .or_else(|| remote_names.iter().flatten().next());

        let remote_name = match origin {
            Some(r) => r.to_string(),
            None => return Ok(GitResult { stdout: String::new(), stderr: "No remotes configured".into(), success: false }),
        };

        let mut remote = repo.find_remote(&remote_name).map_err(|e| e.to_string())?;

        // auth.fetch is synchronous network I/O — safe inside spawn_blocking
        match auth.fetch(&repo, &mut remote, &[] as &[&str], None) {
            Ok(_) => Ok(GitResult {
                stdout: "Fetched from remote".into(),
                stderr: String::new(),
                success: true,
            }),
            Err(e) => Ok(GitResult {
                stdout: String::new(),
                stderr: format!("{}", e),
                success: false,
            }),
        }
    }).await.map_err(|e| e.to_string())?
}

async fn git2_pull_native(project_path: &str) -> Result<GitResult, String> {
    // Phase 1: network fetch (blocking — runs in spawn_blocking inside git2_fetch_native)
    let fetch_result = git2_fetch_native(project_path).await?;
    if !fetch_result.success {
        return Ok(fetch_result);
    }

    // Phase 2: merge analysis + fast-forward (pure git2, blocking but fast — no network)
    let path = project_path.to_string();
    tokio::task::spawn_blocking(move || {
        use git2::{Repository, BranchType, MergeAnalysis};
        let repo = Repository::discover(&path).map_err(|e| e.to_string())?;

        let head = repo.head().map_err(|e| e.to_string())?;
        if !head.is_branch() {
            return Ok(GitResult { stdout: String::new(), stderr: "HEAD is not on a branch".into(), success: false });
        }
        let branch_name = head.shorthand().ok_or("no branch name")?.to_string();
        let branch = repo.find_branch(&branch_name, BranchType::Local).map_err(|e| e.to_string())?;

        let upstream = match branch.upstream() {
            Ok(u) => u,
            Err(_) => return Ok(GitResult {
                stdout: String::new(),
                stderr: format!("Branch '{}' has no upstream configured", branch_name),
                success: false,
            }),
        };

        let upstream_commit = upstream.get().peel_to_commit().map_err(|e| e.to_string())?;
        let fetch_head = repo.find_annotated_commit(upstream_commit.id()).map_err(|e| e.to_string())?;
        let (analysis, _) = repo.merge_analysis(&[&fetch_head]).map_err(|e| e.to_string())?;

        if analysis.contains(MergeAnalysis::ANALYSIS_UP_TO_DATE) {
            return Ok(GitResult { stdout: "Already up to date.".into(), stderr: String::new(), success: true });
        }

        if analysis.contains(MergeAnalysis::ANALYSIS_FASTFORWARD) {
            let upstream_oid = upstream_commit.id();
            let new_obj = repo.find_object(upstream_oid, None).map_err(|e| e.to_string())?;
            let mut co = git2::build::CheckoutBuilder::new();
            co.safe();
            repo.checkout_tree(&new_obj, Some(&mut co)).map_err(|e| e.to_string())?;
            // Update HEAD reference to new tip
            let head_ref = repo.find_reference("HEAD").map_err(|e| e.to_string())?;
            // resolve to the actual branch ref (e.g. refs/heads/main)
            let mut target_ref = head_ref.resolve().map_err(|e| e.to_string())?;
            target_ref.set_target(upstream_oid, "pull: fast-forward").map_err(|e| e.to_string())?;
            return Ok(GitResult {
                stdout: format!("Fast-forward to {}", &upstream_oid.to_string()[..7]),
                stderr: String::new(),
                success: true,
            });
        }

        // Non-fast-forward: tell the UI to show the stash/rebase dialog
        Ok(GitResult {
            stdout: String::new(),
            stderr: "Pull would create a merge commit. Please stash your changes or use rebase.".into(),
            success: false,
        })
    }).await.map_err(|e| e.to_string())?
}

async fn git2_push_native(project_path: &str, args: &[String]) -> Result<GitResult, String> {
    let path = project_path.to_string();
    let force = args.contains(&"--force".to_string()) || args.contains(&"-f".to_string());
    tokio::task::spawn_blocking(move || {
        use git2::Repository;
        let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
        let auth = make_auth();

        let head = repo.head().map_err(|e| e.to_string())?;
        let branch_name = head.shorthand().ok_or("HEAD is detached")?.to_string();
        let refspec = format!("{}refs/heads/{}:refs/heads/{}",
            if force { "+" } else { "" }, branch_name, branch_name);
        let remote_name = "origin";
        let mut remote = repo.find_remote(remote_name).map_err(|e| e.to_string())?;

        match auth.push(&repo, &mut remote, &[&refspec]) {
            Ok(_) => Ok(GitResult {
                stdout: format!("Pushed '{}' to {}", branch_name, remote_name),
                stderr: String::new(),
                success: true,
            }),
            Err(e) => Ok(GitResult {
                stdout: String::new(),
                stderr: format!("{}", e),
                success: false,
            }),
        }
    }).await.map_err(|e| e.to_string())?
}

// ── Fallback CLI helper ────────────────────────────────────────────────────────

async fn git_cli_fallback(
    app_handle: &AppHandle,
    project_path: &str,
    args: &[String],
) -> Result<GitResult, String> {
    let mut cmd = AsyncCommand::new("git");
    cmd.args(args);
    cmd.current_dir(project_path);
    cmd
        // Prevent interactive prompts
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "echo")
        // HTTPS: fail if transfer speed stays below 100 B/s for 10 s
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "100")
        .env("GIT_HTTP_LOW_SPEED_TIME", "10")
        // HTTPS: hard connect timeout via inline git config override
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.connectTimeout")
        .env("GIT_CONFIG_VALUE_0", "10")
        // SSH: hard connect + batch mode (no prompts, fail fast)
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10 -o BatchMode=yes");
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
    let command_str = format!("git {}", args.join(" "));
    let _ = tauri::Emitter::emit(app_handle, "git-log", GitLogPayload {
        project_path: project_path.to_string(),
        command: command_str,
        stdout: stdout_str.clone(),
        stderr: stderr_str.clone(),
    });
    Ok(GitResult {
        stdout: stdout_str,
        stderr: stderr_str,
        success: output.status.success(),
    })
}

// ── Main router ────────────────────────────────────────────────────────────────

pub async fn git_execute_impl(
    app_handle: AppHandle,
    project_path: String,
    args: Vec<String>,
) -> Result<GitResult, String> {
    let command = args.first().map(|s| s.as_str()).unwrap_or("");
    let command_str = format!("git {}", args.join(" "));

    let result = match command {
        // ── Native git2: writes & reads that need correctness ──────────────────
        "commit" => {
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                let a = args.clone();
                move || git2_commit(&p, &a)
            }).await.map_err(|e| e.to_string())?
        }
        "checkout" => {
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                let a = args.clone();
                move || git2_checkout(&p, &a)
            }).await.map_err(|e| e.to_string())?
        }
        "branch" if args.iter().any(|a| a == "-d" || a == "-D") => {
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                let a = args.clone();
                move || git2_branch_delete(&p, &a)
            }).await.map_err(|e| e.to_string())?
        }
        "fetch" => git2_fetch_native(&project_path).await,
        "pull" => {
            if args.len() > 1 {
                git_cli_fallback(&app_handle, &project_path, &args).await
            } else {
                git2_pull_native(&project_path).await
            }
        },
        "push" => git2_push_native(&project_path, &args).await,

        // ── Fallback for everything else (add, reset, stash, rebase, merge…) ──
        _ => git_cli_fallback(&app_handle, &project_path, &args).await,
    }?;

    // Emit to the git-log panel regardless of path
    let _ = tauri::Emitter::emit(&app_handle, "git-log", GitLogPayload {
        project_path: project_path.clone(),
        command: command_str,
        stdout: result.stdout.clone(),
        stderr: result.stderr.clone(),
    });

    Ok(result)
}

// ─── Git Status (parallel, CLI) ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct GitStatusResult {
    pub status_output: String,
    pub status_success: bool,
    pub status_stderr: String,
    pub current_branch: String,
    pub is_merge_in_progress: bool,
}

pub async fn git_get_status_impl(project_path: String) -> Result<GitStatusResult, String> {
    let path1 = project_path.clone();
    let path2 = project_path.clone();
    let path3 = project_path.clone();

    let status_fut = tokio::spawn(async move {
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["status", "-s", "-u"]);
        cmd.current_dir(&path1);
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        #[cfg(target_os = "windows")]
        { cmd.creation_flags(0x08000000); }
        cmd.output().await
    });

    let branch_fut = tokio::spawn(async move {
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["branch", "--show-current"]);
        cmd.current_dir(&path2);
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        #[cfg(target_os = "windows")]
        { cmd.creation_flags(0x08000000); }
        cmd.output().await
    });

    let merge_fut = tokio::spawn(async move {
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
        cmd.current_dir(&path3);
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        #[cfg(target_os = "windows")]
        { cmd.creation_flags(0x08000000); }
        cmd.output().await
    });

    let (status_res, branch_res, merge_res) = tokio::join!(status_fut, branch_fut, merge_fut);

    let status_out = status_res.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    let branch_out = branch_res.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    let merge_out  = merge_res.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok(GitStatusResult {
        status_output: String::from_utf8_lossy(&status_out.stdout).to_string(),
        status_success: status_out.status.success(),
        status_stderr:  String::from_utf8_lossy(&status_out.stderr).to_string(),
        current_branch: String::from_utf8_lossy(&branch_out.stdout).trim().to_string(),
        is_merge_in_progress: merge_out.status.success(),
    })
}

// ─── Reword commit (git2 amend for HEAD, CLI rebase for older) ────────────────

pub async fn git_reword_commit_impl(
    app_handle: AppHandle,
    project_path: String,
    commit_hash: String,
    new_message: String,
) -> Result<GitResult, String> {
    use git2::Repository;

    let short_hash = &commit_hash[..commit_hash.len().min(7)];

    // Check if this is HEAD using git2
    let is_head = {
        let repo = Repository::discover(&project_path).map_err(|e| e.to_string())?;
        let head_id = repo.head().map_err(|e| e.to_string())?.peel_to_commit().map_err(|e| e.to_string())?.id();
        let head_short = &head_id.to_string()[..7];
        commit_hash.starts_with(head_short) || short_hash == head_short
    };

    let result = if is_head {
        // Fast path: git2 amend — no subprocess needed
        let args = vec![
            "commit".to_string(),
            "--amend".to_string(),
            "-m".to_string(),
            new_message.clone(),
        ];
        tokio::task::spawn_blocking({
            let p = project_path.clone();
            move || git2_commit(&p, &args)
        }).await.map_err(|e| e.to_string())??
    } else {
        // Non-HEAD: use CLI interactive rebase with temp scripts
        let msg_path = format!("{}/.nexus_msg.txt", project_path);
        fs::write(&msg_path, &new_message).map_err(|e| e.to_string())?;

        // Platform-specific sequence editor
        #[cfg(target_os = "windows")]
        let (seq_editor_script, seq_editor_ext) = (
            format!("@echo off\r\npowershell -Command \"(Get-Content '%1') -replace 'pick {short}', 'reword {short}' | Set-Content '%1'\"\r\n", short = short_hash),
            ".cmd",
        );
        #[cfg(not(target_os = "windows"))]
        let (seq_editor_script, seq_editor_ext) = (
            format!("#!/bin/sh\nsed -i 's/pick {short}/reword {short}/' \"$1\"\n", short = short_hash),
            ".sh",
        );

        let seq_editor_path = format!("{}/.nexus_seq_editor{}", project_path, seq_editor_ext);
        fs::write(&seq_editor_path, &seq_editor_script).map_err(|e| e.to_string())?;

        // Make executable on Unix
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&seq_editor_path, fs::Permissions::from_mode(0o755)).ok();
        }

        // Editor script just copies the prepared message file
        #[cfg(target_os = "windows")]
        let editor_script = format!(
            "@echo off\r\npowershell -Command \"Set-Content -Path '%1' -Value (Get-Content -Raw '{}')\"\r\n",
            msg_path.replace('\\', "/")
        );
        #[cfg(not(target_os = "windows"))]
        let editor_script = format!("#!/bin/sh\ncp '{}' \"$1\"\n", msg_path);

        let editor_path = format!("{}/.nexus_editor{}", project_path, seq_editor_ext);
        fs::write(&editor_path, &editor_script).map_err(|e| e.to_string())?;
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&editor_path, fs::Permissions::from_mode(0o755)).ok();
        }

        let seq_abs = Path::new(&seq_editor_path)
            .canonicalize()
            .map(|p| p.display().to_string())
            .unwrap_or(seq_editor_path.clone());
        let editor_abs = Path::new(&editor_path)
            .canonicalize()
            .map(|p| p.display().to_string())
            .unwrap_or(editor_path.clone());

        let parent_ref = format!("{}^", commit_hash);
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["rebase", "-i", &parent_ref]);
        cmd.current_dir(&project_path);
        cmd.env("GIT_SEQUENCE_EDITOR", &seq_abs);
        cmd.env("GIT_EDITOR", &editor_abs);
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        cmd.env("GIT_PAGER", "cat");
        cmd.env("TERM", "dumb");
        #[cfg(target_os = "windows")]
        { cmd.creation_flags(0x08000000); }
        let out = cmd.output().await.map_err(|e| e.to_string())?;

        let _ = fs::remove_file(&seq_editor_path);
        let _ = fs::remove_file(&editor_path);
        let _ = fs::remove_file(&msg_path);

        let stdout_str = String::from_utf8_lossy(&out.stdout).to_string();
        let stderr_str = String::from_utf8_lossy(&out.stderr).to_string();
        GitResult { stdout: stdout_str, stderr: stderr_str, success: out.status.success() }
    };

    let _ = tauri::Emitter::emit(&app_handle, "git-log", GitLogPayload {
        project_path: project_path.clone(),
        command: format!("git reword {} \"{}...\"", short_hash, &new_message[..new_message.len().min(40)]),
        stdout: result.stdout.clone(),
        stderr: result.stderr.clone(),
    });

    Ok(result)
}

pub async fn git_apply_patch_impl(
    app_handle: AppHandle,
    project_path: String,
    patch_content: String,
    reverse: bool,
    target: Option<String>,
) -> Result<GitResult, String> {
    let patch_path = format!("{}/.nexus_temp.patch", project_path);
    fs::write(&patch_path, &patch_content).map_err(|e| e.to_string())?;

    let mut args = vec!["apply".to_string()];

    match target.as_deref() {
        Some("working") => {}
        Some("both") => { args.push("--index".to_string()); }
        _ => { args.push("--cached".to_string()); }
    }

    if reverse { args.push("--reverse".to_string()); }
    args.push(".nexus_temp.patch".to_string());

    let result = git_execute_impl(app_handle, project_path.clone(), args).await;
    let _ = fs::remove_file(&patch_path);
    result
}
