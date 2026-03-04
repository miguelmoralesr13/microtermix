use aes::Aes256;
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use cbc::{Decryptor, Encryptor};
use pkcs8::{DecodePrivateKey, EncodePrivateKey, LineEnding};
use pkcs8::spki::{DecodePublicKey, EncodePublicKey};
use rand::RngCore;
use rsa::{Oaep, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone)]
pub struct CryptoKeyPair {
    /// AES: empty (symmetric, only one key); RSA/ECIES: public key for encryption.
    pub public_key: String,
    /// AES/RSA/ECIES: private (or symmetric) key for decryption.
    pub private_key: String,
}

// ── AES-CBC ───────────────────────────────────────────────────────────────────

pub fn aes_generate_keys() -> CryptoKeyPair {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    CryptoKeyPair { public_key: String::new(), private_key: B64.encode(key) }
}

/// Encrypts with AES-256-CBC. Output: base64(IV[16] ++ ciphertext).
pub fn aes_encrypt(key_b64: &str, data: &str) -> Result<String, String> {
    let key_bytes = B64.decode(key_b64).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err(format!("AES key must be 32 bytes, got {}", key_bytes.len()));
    }
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let enc = Encryptor::<Aes256>::new_from_slices(&key_bytes, &iv)
        .map_err(|e: aes::cipher::InvalidLength| e.to_string())?;
    let mut out = iv.to_vec();
    out.extend_from_slice(&enc.encrypt_padded_vec_mut::<Pkcs7>(data.as_bytes()));
    Ok(B64.encode(out))
}

/// Decrypts base64(IV[16] ++ ciphertext) with AES-256-CBC.
pub fn aes_decrypt(key_b64: &str, data_b64: &str) -> Result<String, String> {
    let key_bytes = B64.decode(key_b64).map_err(|e| e.to_string())?;
    let combined = B64.decode(data_b64).map_err(|e| e.to_string())?;
    if combined.len() < 17 {
        return Err("Ciphertext too short".into());
    }
    let (iv, cipher) = combined.split_at(16);
    let dec = Decryptor::<Aes256>::new_from_slices(&key_bytes, iv)
        .map_err(|e: aes::cipher::InvalidLength| e.to_string())?;
    let plain = dec
        .decrypt_padded_vec_mut::<Pkcs7>(cipher)
        .map_err(|_| "AES decryption failed (bad key or data)".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

// ── PEM normalizers ──────────────────────────────────────────────────────────

/// If `key` is raw base64 DER (no `-----` header), wraps it in PEM format.
fn to_pem_public(key: &str) -> String {
    let key = key.trim();
    if key.starts_with("-----") { return key.to_string(); }
    let body = key.chars().collect::<Vec<_>>()
        .chunks(64).map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>().join("\n");
    format!("-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----\n", body)
}

fn to_pem_private(key: &str) -> String {
    let key = key.trim();
    if key.starts_with("-----") { return key.to_string(); }
    let body = key.chars().collect::<Vec<_>>()
        .chunks(64).map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>().join("\n");
    format!("-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----\n", body)
}

// ── RSA-OAEP ─────────────────────────────────────────────────────────────────

/// Generates a 2048-bit RSA key pair. Keys stored as full PEM strings.
pub fn rsa_generate_keys() -> Result<CryptoKeyPair, String> {
    let mut rng = rand::thread_rng();
    let priv_key = RsaPrivateKey::new(&mut rng, 2048).map_err(|e| e.to_string())?;
    let pub_key = RsaPublicKey::from(&priv_key);
    let pub_pem = pub_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|e| e.to_string())?;
    let priv_pem = priv_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|e| e.to_string())?;
    Ok(CryptoKeyPair {
        public_key: pub_pem,
        private_key: (*priv_pem).clone(),
    })
}

/// Encrypts with RSA-OAEP/SHA-256. `public_key` is PEM or raw base64 DER.
pub fn rsa_encrypt(public_key: &str, data: &str) -> Result<String, String> {
    let pem = to_pem_public(public_key);
    let pub_key = RsaPublicKey::from_public_key_pem(&pem)
        .map_err(|e| e.to_string())?;
    let encrypted = pub_key
        .encrypt(&mut rand::thread_rng(), Oaep::new::<sha2::Sha256>(), data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(B64.encode(encrypted))
}

/// Decrypts with RSA-OAEP/SHA-256. `private_key` is PEM or raw base64 DER (PKCS#8).
pub fn rsa_decrypt(private_key: &str, data_b64: &str) -> Result<String, String> {
    let pem = to_pem_private(private_key);
    let priv_key = RsaPrivateKey::from_pkcs8_pem(&pem)
        .map_err(|e| e.to_string())?;
    let cipher = B64.decode(data_b64).map_err(|e| e.to_string())?;
    let plain = priv_key
        .decrypt(Oaep::new::<sha2::Sha256>(), &cipher)
        .map_err(|e| e.to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

// ── ECIES (secp256k1) ─────────────────────────────────────────────────────────

/// Generates a secp256k1 key pair. Keys stored as base64 of raw bytes.
pub fn ecies_generate_keys() -> Result<CryptoKeyPair, String> {
    let (sk, pk) = ecies::utils::generate_keypair();
    Ok(CryptoKeyPair {
        public_key: B64.encode(pk.serialize()),   // 65 bytes uncompressed
        private_key: B64.encode(sk.serialize()),  // 32 bytes
    })
}

pub fn ecies_encrypt(pub_key_b64: &str, data: &str) -> Result<String, String> {
    let pk = B64.decode(pub_key_b64).map_err(|e| e.to_string())?;
    let enc = ecies::encrypt(&pk, data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(B64.encode(enc))
}

pub fn ecies_decrypt_data(priv_key_b64: &str, data_b64: &str) -> Result<String, String> {
    let sk = B64.decode(priv_key_b64).map_err(|e| e.to_string())?;
    let cipher = B64.decode(data_b64).map_err(|e| e.to_string())?;
    let plain = ecies::decrypt(&sk, &cipher).map_err(|e| e.to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

fn dispatch_encrypt(scheme: &str, key: &str, data: &str) -> Result<String, String> {
    match scheme {
        "aes"   => aes_encrypt(key, data),
        "rsa"   => rsa_encrypt(key, data),
        "ecies" => ecies_encrypt(key, data),
        _       => Err(format!("Unknown scheme: {scheme}")),
    }
}

fn dispatch_decrypt(scheme: &str, key: &str, data: &str) -> Result<String, String> {
    match scheme {
        "aes"   => aes_decrypt(key, data),
        "rsa"   => rsa_decrypt(key, data),
        "ecies" => ecies_decrypt_data(key, data),
        _       => Err(format!("Unknown scheme: {scheme}")),
    }
}

// ── JSON Processor ────────────────────────────────────────────────────────────

/// Encrypts specific dot-notation fields in a JSON string.
/// `items[].field` notation iterates every element of an array.
pub fn json_encrypt_fields(
    scheme: &str,
    key: &str,
    json_str: &str,
    fields: &[String],
) -> Result<String, String> {
    let mut value: Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    for field in fields {
        let path: Vec<&str> = field.split('.').collect();
        encrypt_at_path(&mut value, &path, scheme, key)?;
    }
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

fn encrypt_at_path(value: &mut Value, path: &[&str], scheme: &str, key: &str) -> Result<(), String> {
    if path.is_empty() { return Ok(()); }
    let seg = path[0];
    let rest = &path[1..];

    if let Some(name) = seg.strip_suffix("[]") {
        if let Some(arr) = value.get_mut(name).and_then(|v| v.as_array_mut()) {
            for item in arr.iter_mut() {
                encrypt_at_path(item, rest, scheme, key)?;
            }
        }
    } else if rest.is_empty() {
        if let Some(leaf) = value.get_mut(seg) {
            if let Some(s) = leaf.as_str() {
                *leaf = Value::String(dispatch_encrypt(scheme, key, s)?);
            }
        }
    } else if let Some(child) = value.get_mut(seg) {
        encrypt_at_path(child, rest, scheme, key)?;
    }
    Ok(())
}

/// Tries to decrypt every string field recursively. Leaves failures intact.
pub fn json_decrypt_all(scheme: &str, key: &str, json_str: &str) -> Result<String, String> {
    let mut value: Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    try_decrypt_all(&mut value, scheme, key);
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

fn try_decrypt_all(value: &mut Value, scheme: &str, key: &str) {
    match value {
        Value::String(s) => {
            if let Ok(d) = dispatch_decrypt(scheme, key, s) { *s = d; }
        }
        Value::Object(map) => { for v in map.values_mut() { try_decrypt_all(v, scheme, key); } }
        Value::Array(arr)  => { for v in arr.iter_mut()   { try_decrypt_all(v, scheme, key); } }
        _ => {}
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn crypto_generate_keys(scheme: String) -> Result<CryptoKeyPair, String> {
    match scheme.as_str() {
        "aes"   => Ok(aes_generate_keys()),
        "rsa"   => rsa_generate_keys(),
        "ecies" => ecies_generate_keys(),
        _       => Err(format!("Unknown scheme: {scheme}")),
    }
}

#[tauri::command]
pub fn crypto_encrypt(scheme: String, public_key: String, data: String) -> Result<String, String> {
    dispatch_encrypt(&scheme, &public_key, &data)
}

#[tauri::command]
pub fn crypto_decrypt(scheme: String, private_key: String, data: String) -> Result<String, String> {
    dispatch_decrypt(&scheme, &private_key, &data)
}

#[tauri::command]
pub fn crypto_encrypt_json_fields(
    scheme: String,
    public_key: String,
    json: String,
    fields: Vec<String>,
) -> Result<String, String> {
    json_encrypt_fields(&scheme, &public_key, &json, &fields)
}

#[tauri::command]
pub fn crypto_decrypt_json_all(
    scheme: String,
    private_key: String,
    json: String,
) -> Result<String, String> {
    json_decrypt_all(&scheme, &private_key, &json)
}
