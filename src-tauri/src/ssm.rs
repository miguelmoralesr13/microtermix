/// Native AWS Systems Manager Session Manager client.
/// Implements the SSM data-channel WebSocket protocol directly —
/// no aws-cli, no session-manager-plugin required.
use std::collections::HashMap;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, Mutex as AsyncMutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

use crate::ec2::Ec2Credentials;

// ── SSM client ────────────────────────────────────────────────────────────────

async fn ssm_client(c: &Ec2Credentials) -> aws_sdk_ssm::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        c.session_token.clone(),
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_ssm::Client::new(&cfg)
}

// ── SSM binary protocol ───────────────────────────────────────────────────────
//
// Message layout (all integers big-endian):
//
//  [0..3]    HeaderLength  u32  = 116
//  [4..35]   MessageType   [32] null-padded ASCII
//  [36..39]  SchemaVersion u32
//  [40..47]  CreatedDate   u64  (epoch milliseconds)
//  [48..55]  SequenceNumber i64
//  [56..63]  Flags          u64
//  [64..79]  MessageId     [16] (UUID bytes)
//  [80..111] PayloadDigest [32] (SHA-256 of payload)
//  [112..115] PayloadType  u32
//  [116..119] PayloadLength u32
//  [120..]   Payload       bytes
//
//  Total header (after HeaderLength field): 116 bytes.

const HDR_LEN: usize = 116;

struct SsmMsg {
    message_type: String,
    sequence_number: i64,
    message_id: [u8; 16],
    payload_type: u32,
    payload: Vec<u8>,
}

fn parse_msg(data: &[u8]) -> Option<SsmMsg> {
    if data.len() < 4 + HDR_LEN {
        return None;
    }
    let hlen = u32::from_be_bytes(data[0..4].try_into().ok()?) as usize;
    if hlen < HDR_LEN || data.len() < 4 + hlen {
        return None;
    }
    let h = &data[4..4 + hlen];

    let msg_type = std::str::from_utf8(&h[0..32])
        .unwrap_or("")
        .trim_end_matches('\0')
        .trim()
        .to_string();

    let seq = i64::from_be_bytes(h[44..52].try_into().ok()?);

    let mut mid = [0u8; 16];
    mid.copy_from_slice(&h[60..76]);

    let ptype = u32::from_be_bytes(h[108..112].try_into().ok()?);
    let plen  = u32::from_be_bytes(h[112..116].try_into().ok()?) as usize;

    let pstart = 4 + hlen;
    if data.len() < pstart + plen {
        return None;
    }

    Some(SsmMsg {
        message_type: msg_type,
        sequence_number: seq,
        message_id: mid,
        payload_type: ptype,
        payload: data[pstart..pstart + plen].to_vec(),
    })
}

fn build_msg(msg_type: &str, seq: i64, payload_type: u32, payload: &[u8]) -> Vec<u8> {
    let mut h = vec![0u8; HDR_LEN];

    // MessageType
    let tb = msg_type.as_bytes();
    h[0..tb.len().min(32)].copy_from_slice(&tb[..tb.len().min(32)]);

    // SchemaVersion = 1
    h[32..36].copy_from_slice(&1u32.to_be_bytes());

    // CreatedDate
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    h[36..44].copy_from_slice(&now.to_be_bytes());

    // SequenceNumber
    h[44..52].copy_from_slice(&seq.to_be_bytes());

    // Flags = 0 (already zeroed)

    // MessageId
    h[60..76].copy_from_slice(Uuid::new_v4().as_bytes());

    // PayloadDigest
    let digest = Sha256::digest(payload);
    h[76..108].copy_from_slice(&digest);

    // PayloadType
    h[108..112].copy_from_slice(&payload_type.to_be_bytes());

    // PayloadLength
    h[112..116].copy_from_slice(&(payload.len() as u32).to_be_bytes());

    let mut out = Vec::with_capacity(4 + HDR_LEN + payload.len());
    out.extend_from_slice(&(HDR_LEN as u32).to_be_bytes());
    out.extend_from_slice(&h);
    out.extend_from_slice(payload);
    out
}

fn ack_msg(seq: i64, mid: &[u8; 16], mtype: &str) -> Vec<u8> {
    let payload = serde_json::json!({
        "AcknowledgedMessageType": mtype,
        "AcknowledgedMessageId": Uuid::from_bytes(*mid).to_string(),
        "AcknowledgedMessageSequenceNumber": seq,
        "IsBufferFull": false,
    })
    .to_string();
    build_msg("acknowledge", 0, 1, payload.as_bytes())
}

fn input_msg(seq: i64, data: &[u8]) -> Vec<u8> {
    build_msg("input_stream_data", seq, 1, data)
}

// ── Tauri command ─────────────────────────────────────────────────────────────

/// Start an SSM Session Manager session natively (no aws-cli or plugin needed).
/// Connects via WebSocket to the SSM streaming endpoint and forwards
/// stdin/stdout through the existing service-logs / write_stdin_line mechanism.
#[tauri::command]
pub async fn ssm_start_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    credentials: Ec2Credentials,
    instance_id: String,
    service_id: String,
) -> Result<(), String> {
    use tauri::Emitter;

    let procs_arc   = state.processes.clone();
    let stdins_arc  = state.stdin_senders.clone();

    // Kill any existing session with the same id
    {
        let mut p = procs_arc.lock().await;
        if let Some(n) = p.remove(&service_id) { n.notify_waiters(); }
    }
    stdins_arc.lock().await.remove(&service_id);

    // 1. StartSession API call
    let ssm  = ssm_client(&credentials).await;
    let resp = ssm
        .start_session()
        .target(&instance_id)
        .send()
        .await
        .map_err(|e| format!("StartSession: {}", e))?;

    let stream_url   = resp.stream_url().unwrap_or_default().to_string();
    let token_value  = resp.token_value().unwrap_or_default().to_string();

    let _ = app.emit("service-logs", crate::LogEvent {
        service_id: service_id.clone(),
        line: format!("[SSM] Conectando a {} ...", instance_id),
        is_error: false,
    });

    // 2. WebSocket connection
    let (ws, _) = connect_async(&stream_url)
        .await
        .map_err(|e| format!("WebSocket: {}", e))?;
    let (ws_sink, ws_source) = ws.split();

    // Channel for all outgoing WebSocket messages (ACKs + stdin)
    let (ws_tx, ws_rx) = mpsc::unbounded_channel::<Message>();

    // Writer task: flushes ws_tx → ws_sink
    {
        let mut sink  = ws_sink;
        let mut ws_rx = ws_rx;
        tokio::spawn(async move {
            while let Some(msg) = ws_rx.recv().await {
                if sink.send(msg).await.is_err() { break; }
            }
        });
    }

    // 3. Handshake (text frame)
    let handshake = serde_json::json!({
        "MessageSchemaVersion": "1.0",
        "RequestId": Uuid::new_v4().to_string(),
        "TokenValue": token_value,
    })
    .to_string();
    ws_tx.send(Message::Text(handshake.into())).ok();

    // 4. Stdin channel
    let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<String>();
    stdins_arc.lock().await.insert(service_id.clone(), stdin_tx);

    let notify = Arc::new(tokio::sync::Notify::new());
    procs_arc.lock().await.insert(service_id.clone(), notify.clone());

    // 5. Main loop — runs both receive (ws_source) and send (stdin_rx) concurrently
    let app2         = app.clone();
    let sid          = service_id.clone();
    let ws_tx2       = ws_tx.clone();
    let procs_clean  = procs_arc.clone();
    let stdins_clean = stdins_arc.clone();
    let n            = notify.clone();

    tokio::spawn(async move {
        let mut ws_source = ws_source;
        let mut send_seq: i64 = 0;

        loop {
            tokio::select! {
                _ = n.notified() => break,

                // ── Incoming from SSM ──────────────────────────────────────
                frame = ws_source.next() => {
                    let frame = match frame {
                        Some(Ok(f)) => f,
                        _ => break,
                    };
                    match frame {
                        Message::Binary(data) => {
                            let msg = match parse_msg(&data) {
                                Some(m) => m,
                                None => continue,
                            };
                            match msg.message_type.as_str() {
                                "output_stream_data" => {
                                    // Emit terminal output to frontend
                                    let text = String::from_utf8_lossy(&msg.payload).to_string();
                                    let _ = app2.emit("service-logs", crate::LogEvent {
                                        service_id: sid.clone(),
                                        line: text,
                                        is_error: false,
                                    });
                                    // Send ACK
                                    let ack = ack_msg(msg.sequence_number, &msg.message_id, "output_stream_data");
                                    ws_tx2.send(Message::Binary(ack.into())).ok();
                                }
                                "channel_closed" => {
                                    let _ = app2.emit("service-logs", crate::LogEvent {
                                        service_id: sid.clone(),
                                        line: "[SSM] Sesión terminada por el servidor.".into(),
                                        is_error: false,
                                    });
                                    break;
                                }
                                // HandshakeRequest (payload_type 4/5): respond with empty HandshakeComplete
                                _ if msg.payload_type == 4 || msg.payload_type == 5 => {
                                    // Respond with HandshakeComplete (payload_type 7)
                                    let complete = build_msg(&msg.message_type, 0, 7, b"{}");
                                    ws_tx2.send(Message::Binary(complete.into())).ok();
                                }
                                _ => {}
                            }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }

                // ── Stdin from frontend ────────────────────────────────────
                line = stdin_rx.recv() => {
                    let line = match line {
                        Some(l) => l,
                        None => break,
                    };
                    let payload = line.as_bytes();
                    let msg = input_msg(send_seq, payload);
                    send_seq += 1;
                    ws_tx2.send(Message::Binary(msg.into())).ok();
                }
            }
        }

        // Cleanup
        procs_clean.lock().await.remove(&sid);
        stdins_clean.lock().await.remove(&sid);
        let _ = app2.emit("service-stopped", sid);
    });

    Ok(())
}
