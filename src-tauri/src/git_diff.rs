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
/// Returns a string in git unified diff format (with ---/+++ header) so the frontend can parse hunks.
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

/// Parsea los bloques @@ del cuerpo de un unified diff y devuelve los hunks (misma lista que ve el usuario).
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

/// Calcula diff con imara-diff y devuelve unified_diff + hunks. Los hunks se extraen del propio texto
/// del diff (líneas @@). Sin postprocesado para no fusionar hunks y que cada bloque de cambios sea un hunk.
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

    Ok(DiffHunksResult {
        unified_diff,
        hunks,
    })
}

/// Aplica rechazos: devuelve el contenido "modified" con los hunks indicados revertidos (usando original).
/// reject_indices: índices de hunks a rechazar (deben coincidir con los hunks devueltos por compute_diff_hunks).
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
    // Ordenar por new_start descendente para aplicar de atrás hacia adelante y no desalinear índices.
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

    // Preserve Windows line endings if the original modified string used them
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

pub async fn git_execute_impl(
    app_handle: AppHandle,
    project_path: String,
    args: Vec<String>,
) -> Result<GitResult, String> {
    let mut cmd = AsyncCommand::new("git");
    cmd.args(&args);
    cmd.current_dir(&project_path);
    let output = cmd.output().await.map_err(|e| e.to_string())?;

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
    let command_str = format!("git {}", args.join(" "));

    let _ = tauri::Emitter::emit(
        &app_handle,
        "git-log",
        GitLogPayload {
            project_path: project_path.clone(),
            command: command_str,
            stdout: stdout_str.clone(),
            stderr: stderr_str.clone(),
        },
    );

    Ok(GitResult {
        stdout: stdout_str,
        stderr: stderr_str,
        success: output.status.success(),
    })
}

/// Reword the message of any local commit (HEAD or older) non-interactively.
pub async fn git_reword_commit_impl(
    app_handle: AppHandle,
    project_path: String,
    commit_hash: String,
    new_message: String,
) -> Result<GitResult, String> {
    // 1. Write the new commit message to a temp file
    let msg_path = format!("{}/.nexus_msg.txt", project_path);
    fs::write(&msg_path, &new_message).map_err(|e| e.to_string())?;
    let msg_path_escaped = msg_path.replace('\\', "/");

    // 2. Get the short hash (first 7 chars)
    let short_hash = &commit_hash[..commit_hash.len().min(7)];

    // 3. Check if this is HEAD
    let mut head_cmd = AsyncCommand::new("git");
    head_cmd.args(&["rev-parse", "--short", "HEAD"]);
    head_cmd.current_dir(&project_path);
    let head_out = head_cmd.output().await.map_err(|e| e.to_string())?;
    let head_short = String::from_utf8_lossy(&head_out.stdout).trim().to_string();

    let result = if head_short.starts_with(short_hash) || short_hash.starts_with(&head_short) {
        // HEAD commit: use simple amend
        let mut cmd = AsyncCommand::new("git");
        cmd.args(&["commit", "--amend", "-m", &new_message]);
        cmd.current_dir(&project_path);
        cmd.output().await.map_err(|e| e.to_string())?
    } else {
        // Non-HEAD: use rebase -i with env var automation
        // GIT_SEQUENCE_EDITOR: a tiny script that replaces "pick HASH" with "reword HASH"
        let seq_editor_script = format!(
            "@echo off\r\npowershell -Command \"(Get-Content '%1') -replace 'pick {short}', 'reword {short}' | Set-Content '%1'\"\r\n",
            short = short_hash
        );
        let seq_editor_path = format!("{}/.nexus_seq_editor.cmd", project_path);
        fs::write(&seq_editor_path, &seq_editor_script).map_err(|e| e.to_string())?;

        // GIT_EDITOR: writes the new message to the COMMIT_EDITMSG file
        let editor_script = format!(
            "@echo off\r\npowershell -Command \"Set-Content -Path '%1' -Value (Get-Content -Raw '{}')\"\r\n",
            msg_path_escaped
        );
        let editor_path = format!("{}/.nexus_editor.cmd", project_path);
        fs::write(&editor_path, &editor_script).map_err(|e| e.to_string())?;

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
        // Prevent git from opening a pager
        cmd.env("GIT_PAGER", "cat");
        cmd.env("TERM", "dumb");
        let out = cmd.output().await.map_err(|e| e.to_string())?;

        // Clean up temp scripts
        let _ = fs::remove_file(&seq_editor_path);
        let _ = fs::remove_file(&editor_path);

        out
    };

    // Clean up message file
    let _ = fs::remove_file(&msg_path);

    let stdout_str = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&result.stderr).to_string();

    let _ = tauri::Emitter::emit(
        &app_handle,
        "git-log",
        GitLogPayload {
            project_path: project_path.clone(),
            command: format!(
                "git reword {} \"{}...\"",
                &commit_hash[..7.min(commit_hash.len())],
                &new_message[..new_message.len().min(40)]
            ),
            stdout: stdout_str.clone(),
            stderr: stderr_str.clone(),
        },
    );

    Ok(GitResult {
        stdout: stdout_str,
        stderr: stderr_str,
        success: result.status.success(),
    })
}

pub async fn git_apply_patch_impl(
    app_handle: AppHandle,
    project_path: String,
    patch_content: String,
    reverse: bool,
    target: Option<String>,
) -> Result<GitResult, String> {
    // Write patch to a temporary file
    let patch_path = format!("{}/.nexus_temp.patch", project_path);
    fs::write(&patch_path, &patch_content).map_err(|e| e.to_string())?;

    let mut args = vec!["apply".to_string()];

    // Target can be "index" (--cached), "working" (no flag), or "both" (--index)
    match target.as_deref() {
        Some("working") => { /* Applies only to working tree */ }
        Some("both") => {
            args.push("--index".to_string());
        }
        _ => {
            args.push("--cached".to_string());
        } // Default to index for backwards compatibility
    }

    if reverse {
        args.push("--reverse".to_string());
    }
    args.push(".nexus_temp.patch".to_string());

    let result = git_execute_impl(app_handle, project_path.clone(), args).await;

    // Clean up temp patch file
    let _ = fs::remove_file(&patch_path);

    result
}

