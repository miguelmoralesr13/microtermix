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

// ── Native git2 handlers ───────────────────────────────────────────────────────

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
        "add" => {
            let path = args.get(1).cloned().unwrap_or_else(|| ".".into());
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_add_native_impl(p, path)
            }).await.map_err(|e| e.to_string())?
            .map(|_| GitResult { stdout: "Added to index".into(), stderr: String::new(), success: true })
        }
        "restore" if args.contains(&"--staged".to_string()) => {
            let path = args.iter().find(|&a| a != "restore" && a != "--staged").cloned().unwrap_or_else(|| ".".into());
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_reset_native_impl(p, path)
            }).await.map_err(|e| e.to_string())?
            .map(|_| GitResult { stdout: "Restored from index".into(), stderr: String::new(), success: true })
        }
        "commit" => {
            let mut message = String::new();
            let mut amend = false;
            let mut i = 0;
            while i < args.len() {
                match args[i].as_str() {
                    "--amend" => { amend = true; }
                    "-m" | "--message" => {
                        i += 1;
                        if i < args.len() { message = args[i].clone(); }
                    }
                    _ => {}
                }
                i += 1;
            }
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_commit_native_impl(p, message, amend)
            }).await.map_err(|e| e.to_string())?
            .map(|msg| GitResult { stdout: msg, stderr: String::new(), success: true })
        }
        "checkout" => git_cli_fallback(&app_handle, &project_path, &args).await,
        "branch" if args.iter().any(|a| a == "-d" || a == "-D") => {
            let force = args.contains(&"-D".to_string());
            let branch_name = args.iter().rev().find(|a| !a.starts_with('-')).cloned().unwrap_or_default();
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_branch_delete_native_impl(p, branch_name, force)
            }).await.map_err(|e| e.to_string())?
            .map(|msg| GitResult { stdout: msg, stderr: String::new(), success: true })
        }
        "fetch" => {
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || {
                    let repo = crate::git_native::repo_open(&p)?;
                    let remote_names = repo.remotes().map_err(|e| e.to_string())?;
                    let remote_name = remote_names.iter().flatten()
                        .find(|&r| r == "origin")
                        .or_else(|| remote_names.iter().flatten().next())
                        .ok_or("No remotes configured")?;
                    crate::git_native::fetch_remote_native(&repo, remote_name)
                }
            }).await.map_err(|e| e.to_string())?
            .map(|_| GitResult { stdout: "Fetched from remote".into(), stderr: String::new(), success: true })
        }
        "pull" => {
            crate::git_native::git_pull_native_impl(project_path.clone()).await
            .map(|msg| GitResult { stdout: msg, stderr: String::new(), success: true })
        }
        "push" => {
            let force = args.contains(&"--force".to_string()) || args.contains(&"-f".to_string());
            crate::git_native::git_push_native_impl(project_path.clone(), force).await
            .map(|msg| GitResult { stdout: msg, stderr: String::new(), success: true })
        }

        // ── Fallback for everything else (reset, stash, rebase, merge…) ──
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
        let msg = new_message.clone();
        tokio::task::spawn_blocking({
            let p = project_path.clone();
            move || crate::git_native::git_commit_native_impl(p, msg, true)
        }).await.map_err(|e| e.to_string())??;
        GitResult { stdout: "[amended] commit updated".into(), stderr: String::new(), success: true }
    } else {
        // Non-HEAD: use CLI interactive rebase with temp scripts
        let msg_path = format!("{}/.microtermix_msg.txt", project_path);
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

        let seq_editor_path = format!("{}/.microtermix_seq_editor{}", project_path, seq_editor_ext);
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

        let editor_path = format!("{}/.microtermix_editor{}", project_path, seq_editor_ext);
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
    let patch_path = format!("{}/.microtermix_temp.patch", project_path);
    fs::write(&patch_path, &patch_content).map_err(|e| e.to_string())?;

    let mut args = vec!["apply".to_string()];

    match target.as_deref() {
        Some("working") => {}
        Some("both") => { args.push("--index".to_string()); }
        _ => { args.push("--cached".to_string()); }
    }

    if reverse { args.push("--reverse".to_string()); }
    args.push(".microtermix_temp.patch".to_string());

    let result = git_execute_impl(app_handle, project_path.clone(), args).await;
    let _ = fs::remove_file(&patch_path);
    result
}
