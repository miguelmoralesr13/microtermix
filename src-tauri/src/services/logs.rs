use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use tokio::fs::OpenOptions as TokioOpenOptions;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

use serde::Serialize;

/// Gets the temporary directory for service logs.
fn get_logs_dir() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("microtermix");
    path.push("logs");
    let _ = fs::create_dir_all(&path);
    path
}

/// Sanitizes service_id to be used as a filename.
fn sanitize_filename(name: &str) -> String {
    if name.len() > 100 {
        let mut hasher = DefaultHasher::new();
        name.hash(&mut hasher);
        return format!("h_{:x}", hasher.finish());
    }
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}

/// Returns the full path to the log file for a given service.
pub fn get_service_log_path(service_id: &str) -> PathBuf {
    let mut path = get_logs_dir();
    path.push(format!("{}.log", sanitize_filename(service_id)));
    path
}

/// Buffered log writer: receives lines via mpsc channel, flushes every 100ms or at 500 lines.
pub struct BufferedLogWriter {
    tx: mpsc::UnboundedSender<String>,
}

impl BufferedLogWriter {
    /// Creates a new buffered log writer for the given service_id.
    /// Spawns a background task that accumulates lines and flushes periodically.
    pub fn new(service_id: String) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let log_path = get_service_log_path(&service_id);

        tokio::spawn(async move {
            let mut buffer = String::with_capacity(8192);
            let mut line_count = 0usize;
            const MAX_LINES: usize = 500;
            const FLUSH_INTERVAL: tokio::time::Duration = tokio::time::Duration::from_millis(100);

            loop {
                tokio::select! {
                    biased;
                    // Flush on interval
                    _ = tokio::time::sleep(FLUSH_INTERVAL), if !buffer.is_empty() => {
                        if let Err(e) = flush_to_file(&log_path, &buffer).await {
                            eprintln!("[BufferedLogWriter] flush error: {}", e);
                        }
                        buffer.clear();
                        line_count = 0;
                    }
                    // Receive lines
                    line = rx.recv() => {
                        match line {
                            Some(l) => {
                                buffer.push_str(&l);
                                buffer.push('\n');
                                line_count += 1;
                                if line_count >= MAX_LINES {
                                    if let Err(e) = flush_to_file(&log_path, &buffer).await {
                                        eprintln!("[BufferedLogWriter] flush error: {}", e);
                                    }
                                    buffer.clear();
                                    line_count = 0;
                                }
                            }
                            None => break, // channel closed
                        }
                    }
                }
            }

            // Final flush on exit
            if !buffer.is_empty() {
                if let Err(e) = flush_to_file(&log_path, &buffer).await {
                    eprintln!("[BufferedLogWriter] final flush error: {}", e);
                }
            }
        });

        Self { tx }
    }

    /// Sends a line to the buffered writer (non-blocking).
    pub fn send(&self, line: String) {
        let _ = self.tx.send(line);
    }
}

async fn flush_to_file(path: &Path, content: &str) -> Result<(), std::io::Error> {
    let mut file = TokioOpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    file.write_all(content.as_bytes()).await
}

/// Reads historical logs for a service from the log file.
#[tauri::command]
pub fn get_service_logs(service_id: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let path = get_service_log_path(&service_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    if let Some(l) = limit {
        if lines.len() > l {
            return Ok(lines[lines.len() - l..].to_vec());
        }
    }
    Ok(lines)
}

/// Log event emitted to the frontend.
#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub service_id: String,
    pub line: String,
    pub is_error: bool,
}
