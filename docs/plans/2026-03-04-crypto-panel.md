# CryptoPanel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `CryptoPanel` view to Microtermix with AES-CBC, RSA-OAEP, and ECIES encryption/decryption implemented in Rust, plus a JSON field processor that handles nested objects and arrays.

**Architecture:** All crypto operations are Tauri commands in a new `src-tauri/src/crypto.rs` module. The frontend is a React component tree under `src/components/crypto/` that calls those commands via `invoke()`. JSON processing (field selection, dot-notation traversal, array iteration) also lives in Rust.

**Tech Stack:** Rust (`aes`+`cbc`, `rsa`, `ecies`, `rand`, `base64`, `serde_json`), React 19, TailwindCSS v4, `@monaco-editor/react` (already installed), Tauri v2 `invoke`.

---

## Reference: Key File Paths

- `src-tauri/Cargo.toml` — add crates here
- `src-tauri/src/lib.rs` — add `mod crypto;`, re-exports, and register commands in `invoke_handler!`
- `src-tauri/src/crypto.rs` — **create new** — all Rust crypto logic
- `src/context/WorkspaceContext.tsx:19` — `AppView` type, add `'crypto'`
- `src/components/layout/Sidebar.tsx` — add nav icon
- `src/components/ServiceManager.tsx:524` — add panel mount
- `src/components/CryptoPanel.tsx` — **create new** — top-level panel
- `src/components/crypto/CipherTab.tsx` — **create new**
- `src/components/crypto/JsonProcessorTab.tsx` — **create new**
- `src/components/crypto/KeysPanel.tsx` — **create new**
- `src/components/crypto/ServiceConfigDrawer.tsx` — **create new**

---

## Task 1: Add Rust crypto crates to Cargo.toml

**Files:** Modify `src-tauri/Cargo.toml`

**Step 1: Add dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]`, append:

```toml
aes = "0.8"
cbc = { version = "0.1", features = ["alloc"] }
rsa = { version = "0.9", features = ["sha2", "pem"] }
ecies = { version = "0.2", default-features = false, features = ["pure"] }
rand = "0.8"
base64 = "0.22"
sha2 = "0.10"
hmac = "0.12"
pkcs8 = { version = "0.10", features = ["pem"] }
```

**Step 2: Verify compilation**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished` or only warnings (no errors). If `ecies` feature flags cause errors, try `ecies = "0.2"` without feature flags.

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add crypto crates (aes, rsa, ecies, rand, base64)"
```

---

## Task 2: Create `src-tauri/src/crypto.rs` — AES-CBC

**Files:** Create `src-tauri/src/crypto.rs`

**Step 1: Create the file with AES-CBC encrypt/decrypt and key generation**

```rust
// src-tauri/src/crypto.rs

use aes::Aes256;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use cbc::{Decryptor, Encryptor};
use cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct CryptoKeyPair {
    /// For AES: the single symmetric key (base64). public_key is empty.
    /// For RSA/ECIES: the public key used for encryption.
    pub public_key: String,
    /// For AES: the actual AES key. For RSA/ECIES: the private key for decryption.
    pub private_key: String,
}

// ── AES-CBC ──────────────────────────────────────────────────────────────────

/// Generates a random 256-bit AES key. Returns it as base64 in `private_key`.
/// `public_key` is empty (symmetric).
pub fn aes_generate_keys() -> CryptoKeyPair {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    CryptoKeyPair {
        public_key: String::new(),
        private_key: B64.encode(key),
    }
}

/// Encrypts `data` with the given AES-256-CBC key (base64).
/// Output: base64(IV[16] ++ ciphertext)
pub fn aes_encrypt(key_b64: &str, data: &str) -> Result<String, String> {
    let key_bytes = B64.decode(key_b64).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err("AES key must be 32 bytes (256-bit)".into());
    }
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);

    let enc = Encryptor::<Aes256>::new_from_slices(&key_bytes, &iv)
        .map_err(|e| e.to_string())?;
    let ciphertext = enc
        .encrypt_padded_vec_mut::<Pkcs7>(data.as_bytes());

    let mut out = iv.to_vec();
    out.extend_from_slice(&ciphertext);
    Ok(B64.encode(out))
}

/// Decrypts a base64(IV[16] ++ ciphertext) produced by `aes_encrypt`.
pub fn aes_decrypt(key_b64: &str, data_b64: &str) -> Result<String, String> {
    let key_bytes = B64.decode(key_b64).map_err(|e| e.to_string())?;
    let combined = B64.decode(data_b64).map_err(|e| e.to_string())?;
    if combined.len() < 17 {
        return Err("Ciphertext too short".into());
    }
    let (iv, ciphertext) = combined.split_at(16);

    let dec = Decryptor::<Aes256>::new_from_slices(&key_bytes, iv)
        .map_err(|e| e.to_string())?;
    let plaintext = dec
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}
```

**Step 2: Register module in lib.rs** (just the module declaration — commands come in Task 5)

In `src-tauri/src/lib.rs`, add at the top with the other `mod` declarations:

```rust
mod crypto;
```

**Step 3: Verify AES compiles**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "error|warning: unused"
```

Expected: no errors. Unused import warnings are fine for now.

---

## Task 3: Add RSA-OAEP to `crypto.rs`

**Files:** Modify `src-tauri/src/crypto.rs`

**Step 1: Append RSA imports and functions to `crypto.rs`**

```rust
use rsa::{
    pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey},
    Oaep, RsaPrivateKey, RsaPublicKey,
};

// ── RSA-OAEP ─────────────────────────────────────────────────────────────────

/// Generates a 2048-bit RSA key pair.
/// Keys are returned as PEM strings (with headers stripped, base64-only content).
pub fn rsa_generate_keys() -> Result<CryptoKeyPair, String> {
    let mut rng = rand::thread_rng();
    let priv_key = RsaPrivateKey::new(&mut rng, 2048).map_err(|e| e.to_string())?;
    let pub_key = RsaPublicKey::from(&priv_key);

    let pub_pem = pub_key
        .to_public_key_pem(rsa::pkcs8::LineEnding::LF)
        .map_err(|e| e.to_string())?;
    let priv_pem = priv_key
        .to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)
        .map_err(|e| e.to_string())?;

    // Strip PEM headers — store only the base64 body, matching the original library format
    let pub_stripped = strip_pem_headers(pub_pem.as_str());
    let priv_stripped = strip_pem_headers(priv_pem.as_str());

    Ok(CryptoKeyPair {
        public_key: pub_stripped,
        private_key: priv_stripped,
    })
}

fn strip_pem_headers(pem: &str) -> String {
    pem.lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn wrap_pub_pem(body: &str) -> String {
    format!("-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----\n", body.trim())
}

fn wrap_priv_pem(body: &str) -> String {
    format!("-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----\n", body.trim())
}

/// Encrypts `data` with RSA-OAEP (SHA-256). `public_key` is PEM body (no headers).
pub fn rsa_encrypt(public_key: &str, data: &str) -> Result<String, String> {
    let pem = wrap_pub_pem(public_key);
    let pub_key = RsaPublicKey::from_public_key_pem(&pem).map_err(|e| e.to_string())?;
    let mut rng = rand::thread_rng();
    let padding = Oaep::new::<sha2::Sha256>();
    let encrypted = pub_key
        .encrypt(&mut rng, padding, data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(B64.encode(encrypted))
}

/// Decrypts a base64 ciphertext with RSA-OAEP (SHA-256). `private_key` is PEM body (no headers).
pub fn rsa_decrypt(private_key: &str, data_b64: &str) -> Result<String, String> {
    let pem = wrap_priv_pem(private_key);
    let priv_key = RsaPrivateKey::from_pkcs8_pem(&pem).map_err(|e| e.to_string())?;
    let ciphertext = B64.decode(data_b64).map_err(|e| e.to_string())?;
    let padding = Oaep::new::<sha2::Sha256>();
    let decrypted = priv_key
        .decrypt(padding, &ciphertext)
        .map_err(|e| e.to_string())?;
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}
```

**Step 2: Verify**

```bash
cd src-tauri && cargo check 2>&1 | grep "^error"
```

Expected: no output (no errors).

---

## Task 4: Add ECIES to `crypto.rs`

**Files:** Modify `src-tauri/src/crypto.rs`

> Note: The `ecies` crate on crates.io uses secp256k1 keys. Public key = 65-byte uncompressed hex. Private key = 32-byte hex. We store both as base64 to match the original library format.

**Step 1: Append ECIES imports and functions**

```rust
use ecies::{decrypt as ecies_decrypt, encrypt as ecies_encrypt, utils::generate_keypair};

// ── ECIES ─────────────────────────────────────────────────────────────────────

/// Generates a secp256k1 key pair for ECIES.
/// Keys stored as base64(hex_bytes).
pub fn ecies_generate_keys() -> CryptoKeyPair {
    let (sk, pk) = generate_keypair();
    CryptoKeyPair {
        public_key: B64.encode(pk.serialize()),          // 65 bytes uncompressed
        private_key: B64.encode(sk.serialize()),         // 32 bytes
    }
}

/// Encrypts `data` bytes with ECIES using the given public key (base64 of 65-byte uncompressed).
pub fn ecies_encrypt(pub_key_b64: &str, data: &str) -> Result<String, String> {
    let pk_bytes = B64.decode(pub_key_b64).map_err(|e| e.to_string())?;
    let encrypted = ecies_encrypt(&pk_bytes, data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(B64.encode(encrypted))
}

/// Decrypts a base64 ECIES ciphertext using the given private key (base64 of 32 bytes).
pub fn ecies_decrypt_data(priv_key_b64: &str, data_b64: &str) -> Result<String, String> {
    let sk_bytes = B64.decode(priv_key_b64).map_err(|e| e.to_string())?;
    let ciphertext = B64.decode(data_b64).map_err(|e| e.to_string())?;
    let decrypted = ecies_decrypt(&sk_bytes, &ciphertext).map_err(|e| e.to_string())?;
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}
```

**Step 2: Verify**

```bash
cd src-tauri && cargo check 2>&1 | grep "^error"
```

If `ecies` crate has secp256k1 linking issues on Windows, try:
```toml
ecies = { version = "0.2", features = ["pure"] }
```

---

## Task 5: Add JSON processor to `crypto.rs`

**Files:** Modify `src-tauri/src/crypto.rs`

The JSON processor walks a `serde_json::Value` using dot-notation paths (e.g., `"user.cards[].number"`). `[]` in a segment means "iterate this array".

**Step 1: Append JSON processing functions**

```rust
use serde_json::Value;

// ── JSON Processor ────────────────────────────────────────────────────────────

/// Encrypts specific dot-notation fields in a JSON string.
/// Paths support array notation: "items[].field" iterates the array.
pub fn json_encrypt_fields(
    scheme: &str,
    key: &str,          // public_key for RSA/ECIES, aes_key for AES
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
    let segment = path[0];
    let rest = &path[1..];

    if let Some(stripped) = segment.strip_suffix("[]") {
        // Array iteration
        if let Some(arr) = value.get_mut(stripped).and_then(|v| v.as_array_mut()) {
            for item in arr.iter_mut() {
                encrypt_at_path(item, rest, scheme, key)?;
            }
        }
    } else if rest.is_empty() {
        // Leaf — encrypt the string value
        if let Some(leaf) = value.get_mut(segment) {
            if let Some(s) = leaf.as_str() {
                let encrypted = dispatch_encrypt(scheme, key, s)?;
                *leaf = Value::String(encrypted);
            }
        }
    } else {
        if let Some(child) = value.get_mut(segment) {
            encrypt_at_path(child, rest, scheme, key)?;
        }
    }
    Ok(())
}

/// Attempts to decrypt ALL string fields in a JSON value, leaving failures intact.
pub fn json_decrypt_all(
    scheme: &str,
    key: &str,          // private_key for RSA/ECIES, aes_key for AES
    json_str: &str,
) -> Result<String, String> {
    let mut value: Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    try_decrypt_all(&mut value, scheme, key);
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

fn try_decrypt_all(value: &mut Value, scheme: &str, key: &str) {
    match value {
        Value::String(s) => {
            if let Ok(decrypted) = dispatch_decrypt(scheme, key, s) {
                *s = decrypted;
            }
            // If decryption fails, leave the value as-is
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                try_decrypt_all(v, scheme, key);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                try_decrypt_all(item, scheme, key);
            }
        }
        _ => {}
    }
}

fn dispatch_encrypt(scheme: &str, key: &str, data: &str) -> Result<String, String> {
    match scheme {
        "aes"   => aes_encrypt(key, data),
        "rsa"   => rsa_encrypt(key, data),
        "ecies" => ecies_encrypt(key, data),
        _       => Err(format!("Unknown scheme: {}", scheme)),
    }
}

fn dispatch_decrypt(scheme: &str, key: &str, data: &str) -> Result<String, String> {
    match scheme {
        "aes"   => aes_decrypt(key, data),
        "rsa"   => rsa_decrypt(key, data),
        "ecies" => ecies_decrypt_data(key, data),
        _       => Err(format!("Unknown scheme: {}", scheme)),
    }
}
```

**Step 2: Verify**

```bash
cd src-tauri && cargo check 2>&1 | grep "^error"
```

---

## Task 6: Expose Tauri commands and register them

**Files:** Modify `src-tauri/src/crypto.rs` (append commands), `src-tauri/src/lib.rs` (re-export + register)

**Step 1: Append Tauri command wrappers at the end of `crypto.rs`**

```rust
// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn crypto_generate_keys(scheme: String) -> Result<CryptoKeyPair, String> {
    match scheme.as_str() {
        "aes"   => Ok(aes_generate_keys()),
        "rsa"   => rsa_generate_keys(),
        "ecies" => Ok(ecies_generate_keys()),
        _       => Err(format!("Unknown scheme: {}", scheme)),
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
```

**Step 2: Add re-exports in `lib.rs`**

After the `pub use crate::ssm::...` line, add:

```rust
pub use crate::crypto::{
    crypto_generate_keys, crypto_encrypt, crypto_decrypt,
    crypto_encrypt_json_fields, crypto_decrypt_json_all,
    CryptoKeyPair,
};
```

**Step 3: Register commands in `invoke_handler!` in `lib.rs`**

Inside the `tauri::generate_handler![...]` block, add before the closing `]`:

```rust
            crypto_generate_keys,
            crypto_encrypt,
            crypto_decrypt,
            crypto_encrypt_json_fields,
            crypto_decrypt_json_all,
```

**Step 4: Full compile check**

```bash
cd src-tauri && cargo build 2>&1 | grep "^error"
```

Expected: no errors. Fix any import/path issues before continuing.

**Step 5: Commit**

```bash
git add src-tauri/src/crypto.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(rust): crypto commands — AES-CBC, RSA-OAEP, ECIES, JSON processor"
```

---

## Task 7: Add `'crypto'` to the app navigation

**Files:** `src/context/WorkspaceContext.tsx:19`, `src/components/layout/Sidebar.tsx`, `src/components/ServiceManager.tsx`

**Step 1: Extend `AppView` type in `WorkspaceContext.tsx`**

Line 19 currently reads:
```ts
export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar' | 'cloudwatch' | 'http' | 'jenkins';
```

Change to add `'crypto'`:
```ts
export type AppView = 'services' | 'git' | 'jira' | 'processes' | 'proxy' | 'fileServer' | 'commands' | 'tests' | 'sonar' | 'cloudwatch' | 'http' | 'jenkins' | 'crypto';
```

**Step 2: Add nav icon in `Sidebar.tsx`**

Add `ShieldCheck` to the lucide-react import at line 3:
```ts
import { GitBranch, Trello, Server, Activity, Globe, FolderOpen, TerminalSquare, FlaskConical, BarChart3, Cloud, Network, Workflow, ShieldCheck } from 'lucide-react';
```

Then add the icon inside the return, after the Jenkins entry:
```tsx
{renderNavIcon('crypto', ShieldCheck, "Cifrado / Descifrado")}
```

**Step 3: Add panel mount in `ServiceManager.tsx`**

After the Jenkins block (around line 536), add:
```tsx
{state.activeView === 'crypto' && (
    <CryptoPanel />
)}
```

Add the import at the top of `ServiceManager.tsx`:
```ts
import { CryptoPanel } from './CryptoPanel';
```

**Step 4: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS|Cannot find"
```

Expected: errors about missing `CryptoPanel` (file doesn't exist yet) — that's fine, create a stub in next step.

---

## Task 8: Create `src/components/CryptoPanel.tsx` (stub then full)

**Files:** Create `src/components/CryptoPanel.tsx`, create `src/components/crypto/` directory

**Step 1: Create a minimal stub so the app compiles**

```tsx
// src/components/CryptoPanel.tsx
import React from 'react';

export const CryptoPanel: React.FC = () => (
    <div className="flex-1 flex items-center justify-center text-slate-500">
        Crypto Panel (coming soon)
    </div>
);
```

**Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep "error TS"
```

Expected: no errors.

---

## Task 9: Create `KeysPanel` component

**Files:** Create `src/components/crypto/KeysPanel.tsx`

This is the left panel shared by all cipher tabs. It handles manual keys and service-fetched keys.

```tsx
// src/components/crypto/KeysPanel.tsx
import React, { useState } from 'react';
import { Copy, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export type Scheme = 'aes' | 'rsa' | 'ecies';

interface KeyPair { public_key: string; private_key: string; }

interface ServiceConfig {
    url: string;
    method: 'GET' | 'POST';
    bodyTemplate: string;    // JSON string, may contain {{TOKEN}}
    publicKeyPath: string;   // dot-notation path in response for public key
    privateKeyPath: string;  // dot-notation path in response for private key
}

const DEFAULT_SERVICE: ServiceConfig = {
    url: '',
    method: 'POST',
    bodyTemplate: '{"token": "{{TOKEN}}"}',
    publicKeyPath: 'publicKey',
    privateKeyPath: 'privateKey',
};

function storageKey(scheme: Scheme) { return `crypto-service-config-${scheme}`; }
function loadServiceConfig(scheme: Scheme): ServiceConfig {
    try { return { ...DEFAULT_SERVICE, ...JSON.parse(localStorage.getItem(storageKey(scheme)) || '{}') }; }
    catch { return { ...DEFAULT_SERVICE }; }
}
function saveServiceConfig(scheme: Scheme, cfg: ServiceConfig) {
    localStorage.setItem(storageKey(scheme), JSON.stringify(cfg));
}

function getNestedValue(obj: any, path: string): string {
    return path.split('.').reduce((acc, k) => acc?.[k], obj) ?? '';
}

function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
}

interface KeysPanelProps {
    scheme: Scheme;
    keys: KeyPair;
    onChange: (keys: KeyPair) => void;
    loading?: boolean;
}

export const KeysPanel: React.FC<KeysPanelProps> = ({ scheme, keys, onChange, loading }) => {
    const [generating, setGenerating] = useState(false);
    const [serviceOpen, setServiceOpen] = useState(false);
    const [serviceConfig, setServiceConfig] = useState<ServiceConfig>(() => loadServiceConfig(scheme));
    const [token, setToken] = useState('');
    const [fetchingKeys, setFetchingKeys] = useState(false);
    const [serviceError, setServiceError] = useState<string | null>(null);

    const isSymmetric = scheme === 'aes';

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const pair = await invoke<KeyPair>('crypto_generate_keys', { scheme });
            onChange(pair);
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleServiceConfigChange = (patch: Partial<ServiceConfig>) => {
        const updated = { ...serviceConfig, ...patch };
        setServiceConfig(updated);
        saveServiceConfig(scheme, updated);
    };

    const handleFetchKeys = async () => {
        setFetchingKeys(true);
        setServiceError(null);
        try {
            const body = serviceConfig.bodyTemplate.replace('{{TOKEN}}', token);
            const response = await tauriFetch(serviceConfig.url, {
                method: serviceConfig.method,
                headers: { 'Content-Type': 'application/json' },
                body: serviceConfig.method === 'POST' ? body : undefined,
            });
            const data = await response.json();
            const pub = getNestedValue(data, serviceConfig.publicKeyPath);
            const priv = getNestedValue(data, serviceConfig.privateKeyPath);
            onChange({ public_key: pub, private_key: priv });
        } catch (e: any) {
            setServiceError(e?.message ?? String(e));
        } finally {
            setFetchingKeys(false);
        }
    };

    const fieldCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-500';

    return (
        <div className="flex flex-col gap-4 p-4 border-r border-slate-800 w-64 shrink-0 bg-slate-950 overflow-y-auto">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Llaves</span>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
                    Generar
                </button>
            </div>

            {isSymmetric ? (
                <KeyField
                    label="Llave AES (base64)"
                    value={keys.private_key}
                    onChange={v => onChange({ ...keys, private_key: v })}
                />
            ) : (
                <>
                    <KeyField
                        label="Llave pública"
                        value={keys.public_key}
                        onChange={v => onChange({ ...keys, public_key: v })}
                    />
                    <KeyField
                        label="Llave privada"
                        value={keys.private_key}
                        onChange={v => onChange({ ...keys, private_key: v })}
                    />
                </>
            )}

            {/* Service config */}
            <div className="border-t border-slate-800 pt-3">
                <button
                    onClick={() => setServiceOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 w-full"
                >
                    {serviceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Del servicio
                </button>

                {serviceOpen && (
                    <div className="mt-3 flex flex-col gap-2">
                        <label className="text-[10px] text-slate-500">URL</label>
                        <input
                            className={fieldCls}
                            value={serviceConfig.url}
                            onChange={e => handleServiceConfigChange({ url: e.target.value })}
                            placeholder="https://api.example.com/keys"
                        />
                        <label className="text-[10px] text-slate-500">Método</label>
                        <select
                            className={fieldCls}
                            value={serviceConfig.method}
                            onChange={e => handleServiceConfigChange({ method: e.target.value as 'GET' | 'POST' })}
                        >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                        </select>
                        <label className="text-[10px] text-slate-500">Body template (usa {`{{TOKEN}}`})</label>
                        <textarea
                            className={`${fieldCls} h-16`}
                            value={serviceConfig.bodyTemplate}
                            onChange={e => handleServiceConfigChange({ bodyTemplate: e.target.value })}
                        />
                        <label className="text-[10px] text-slate-500">Path llave pública en respuesta</label>
                        <input
                            className={fieldCls}
                            value={serviceConfig.publicKeyPath}
                            onChange={e => handleServiceConfigChange({ publicKeyPath: e.target.value })}
                            placeholder="publicKey"
                        />
                        <label className="text-[10px] text-slate-500">Path llave privada en respuesta</label>
                        <input
                            className={fieldCls}
                            value={serviceConfig.privateKeyPath}
                            onChange={e => handleServiceConfigChange({ privateKeyPath: e.target.value })}
                            placeholder="privateKey"
                        />
                        <label className="text-[10px] text-slate-500">Token</label>
                        <input
                            className={fieldCls}
                            type="password"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="••••••••"
                        />
                        {serviceError && (
                            <p className="text-[10px] text-red-400">{serviceError}</p>
                        )}
                        <button
                            onClick={handleFetchKeys}
                            disabled={fetchingKeys || !serviceConfig.url}
                            className="flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-xs text-white font-bold transition-colors"
                        >
                            {fetchingKeys ? <RefreshCw size={11} className="animate-spin" /> : null}
                            Obtener llaves
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const KeyField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-500">{label}</label>
            <button onClick={() => copyToClipboard(value)} className="text-slate-600 hover:text-slate-400">
                <Copy size={10} />
            </button>
        </div>
        <textarea
            className="w-full h-20 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 resize-none focus:outline-none focus:border-slate-500"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Pega o genera una llave..."
        />
    </div>
);
```

---

## Task 10: Create `CipherTab` component

**Files:** Create `src/components/crypto/CipherTab.tsx`

```tsx
// src/components/crypto/CipherTab.tsx
import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Copy, ChevronDown } from 'lucide-react';
import { KeysPanel, Scheme } from './KeysPanel';

const SCHEMES: { id: Scheme; label: string; description: string }[] = [
    { id: 'aes', label: 'AES-CBC', description: 'Simétrico — una sola llave' },
    { id: 'rsa', label: 'RSA-OAEP', description: 'Asimétrico — pub cifra, priv descifra' },
    { id: 'ecies', label: 'ECIES', description: 'Curva elíptica secp256k1' },
];

interface KeyPair { public_key: string; private_key: string; }

interface CipherTabProps {
    activeScheme: Scheme;
    onSchemeChange: (s: Scheme) => void;
    keysByScheme: Record<Scheme, KeyPair>;
    onKeysChange: (scheme: Scheme, keys: KeyPair) => void;
}

export const CipherTab: React.FC<CipherTabProps> = ({
    activeScheme, onSchemeChange, keysByScheme, onKeysChange,
}) => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const keys = keysByScheme[activeScheme];
    const isSymmetric = activeScheme === 'aes';

    const run = async (op: 'encrypt' | 'decrypt') => {
        setLoading(true);
        setError(null);
        setOutput('');
        try {
            const key = op === 'encrypt'
                ? (isSymmetric ? keys.private_key : keys.public_key)
                : keys.private_key;

            const result = await invoke<string>(
                op === 'encrypt' ? 'crypto_encrypt' : 'crypto_decrypt',
                { scheme: activeScheme, publicKey: op === 'encrypt' ? key : '', privateKey: op === 'decrypt' ? key : '', data: input }
            );
            setOutput(result);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const areaCls = 'w-full flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-600 placeholder-slate-600';

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Keys panel */}
            <KeysPanel
                scheme={activeScheme}
                keys={keys}
                onChange={k => onKeysChange(activeScheme, k)}
            />

            {/* Right: Operation area */}
            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-hidden">
                {/* Scheme selector */}
                <div className="flex gap-2 shrink-0">
                    {SCHEMES.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onSchemeChange(s.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors border ${
                                activeScheme === s.id
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                            title={s.description}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Input */}
                <div className="flex flex-col flex-1 min-h-0 gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Texto de entrada</label>
                    <textarea
                        className={areaCls}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Escribe o pega el texto a procesar..."
                    />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 shrink-0">
                    <button
                        onClick={() => run('encrypt')}
                        disabled={loading || !input}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                        <Play size={14} /> Cifrar
                    </button>
                    <button
                        onClick={() => run('decrypt')}
                        disabled={loading || !input}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                        <Play size={14} /> Descifrar
                    </button>
                </div>

                {/* Output */}
                <div className="flex flex-col flex-1 min-h-0 gap-1">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resultado</label>
                        {output && (
                            <button
                                onClick={() => navigator.clipboard?.writeText(output)}
                                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                            >
                                <Copy size={10} /> Copiar
                            </button>
                        )}
                    </div>
                    {error ? (
                        <div className="flex-1 rounded-lg border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm font-mono text-red-400">
                            {error}
                        </div>
                    ) : (
                        <textarea
                            className={`${areaCls} opacity-80`}
                            value={output}
                            readOnly
                            placeholder="El resultado aparecerá aquí..."
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
```

> Note on `invoke` signature: the Tauri commands receive `scheme`, `public_key`, `private_key`, `data`. For encrypt we pass the public key (or aes key) in `public_key`; for decrypt we pass the private key in `private_key`. Adjust the invoke call to match the exact Rust param names (snake_case).

---

## Task 11: Create `JsonProcessorTab` component

**Files:** Create `src/components/crypto/JsonProcessorTab.tsx`

```tsx
// src/components/crypto/JsonProcessorTab.tsx
import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Copy, Lock, Unlock } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { KeysPanel, Scheme } from './KeysPanel';

const MONACO_OPTS = {
    minimap: { enabled: false },
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    lineNumbers: 'off' as const,
};

interface KeyPair { public_key: string; private_key: string; }

interface JsonProcessorTabProps {
    activeScheme: Scheme;
    onSchemeChange: (s: Scheme) => void;
    keysByScheme: Record<Scheme, KeyPair>;
    onKeysChange: (scheme: Scheme, keys: KeyPair) => void;
}

export const JsonProcessorTab: React.FC<JsonProcessorTabProps> = ({
    activeScheme, onSchemeChange, keysByScheme, onKeysChange,
}) => {
    const [jsonInput, setJsonInput] = useState('{\n  \n}');
    const [jsonOutput, setJsonOutput] = useState('');
    const [fieldsToEncrypt, setFieldsToEncrypt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const keys = keysByScheme[activeScheme];
    const isSymmetric = activeScheme === 'aes';

    const handleEncrypt = async () => {
        setLoading(true);
        setError(null);
        try {
            const fields = fieldsToEncrypt.split(',').map(f => f.trim()).filter(Boolean);
            const pubKey = isSymmetric ? keys.private_key : keys.public_key;
            const result = await invoke<string>('crypto_encrypt_json_fields', {
                scheme: activeScheme,
                publicKey: pubKey,
                json: jsonInput,
                fields,
            });
            setJsonOutput(result);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleDecryptAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<string>('crypto_decrypt_json_all', {
                scheme: activeScheme,
                privateKey: keys.private_key,
                json: jsonInput,
            });
            setJsonOutput(result);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const SCHEMES: Scheme[] = ['aes', 'rsa', 'ecies'];
    const SCHEME_LABELS: Record<Scheme, string> = { aes: 'AES-CBC', rsa: 'RSA-OAEP', ecies: 'ECIES' };

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Keys */}
            <KeysPanel
                scheme={activeScheme}
                keys={keys}
                onChange={k => onKeysChange(activeScheme, k)}
            />

            {/* Right: JSON area */}
            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4">
                {/* Scheme selector */}
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">Esquema:</span>
                    {SCHEMES.map(s => (
                        <button
                            key={s}
                            onClick={() => onSchemeChange(s)}
                            className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                                activeScheme === s
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {SCHEME_LABELS[s]}
                        </button>
                    ))}
                </div>

                {/* Editors side by side */}
                <div className="flex flex-1 min-h-0 gap-4">
                    {/* Input */}
                    <div className="flex-1 flex flex-col min-h-0 gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">JSON entrada</label>
                        <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-700">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={jsonInput}
                                onChange={v => setJsonInput(v ?? '')}
                                options={MONACO_OPTS}
                            />
                        </div>
                    </div>

                    {/* Output */}
                    <div className="flex-1 flex flex-col min-h-0 gap-1">
                        <div className="flex items-center justify-between shrink-0">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">JSON resultado</label>
                            {jsonOutput && (
                                <button
                                    onClick={() => navigator.clipboard?.writeText(jsonOutput)}
                                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                                >
                                    <Copy size={10} /> Copiar
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-700">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={error ? `// Error:\n// ${error}` : jsonOutput}
                                options={{ ...MONACO_OPTS, readOnly: true }}
                            />
                        </div>
                    </div>
                </div>

                {/* Fields to encrypt + action buttons */}
                <div className="shrink-0 flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Campos a cifrar (dot-notation, separados por coma)
                    </label>
                    <input
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-slate-500 placeholder-slate-600"
                        value={fieldsToEncrypt}
                        onChange={e => setFieldsToEncrypt(e.target.value)}
                        placeholder="nombre, usuario.tarjeta.numero, pagos[].cvv"
                    />
                    <div className="flex gap-3">
                        <button
                            onClick={handleEncrypt}
                            disabled={loading || !fieldsToEncrypt.trim()}
                            className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                        >
                            <Lock size={14} /> Cifrar campos
                        </button>
                        <button
                            onClick={handleDecryptAll}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded-lg text-sm font-bold text-white transition-colors"
                        >
                            <Unlock size={14} /> Descifrar todo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
```

---

## Task 12: Wire everything into `CryptoPanel.tsx`

**Files:** Replace `src/components/CryptoPanel.tsx`

```tsx
// src/components/CryptoPanel.tsx
import React, { useState } from 'react';
import { ShieldCheck, FileJson } from 'lucide-react';
import { CipherTab } from './crypto/CipherTab';
import { JsonProcessorTab } from './crypto/JsonProcessorTab';
import { Scheme } from './crypto/KeysPanel';

type MainTab = 'cipher' | 'json';
type KeyPair = { public_key: string; private_key: string };

const EMPTY_KEYS: KeyPair = { public_key: '', private_key: '' };

function loadPref<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
}

export const CryptoPanel: React.FC = () => {
    const [mainTab, setMainTab] = useState<MainTab>(() =>
        loadPref<MainTab>('crypto-active-tab', 'cipher')
    );
    const [scheme, setScheme] = useState<Scheme>(() =>
        loadPref<Scheme>('crypto-active-scheme', 'aes')
    );
    const [keysByScheme, setKeysByScheme] = useState<Record<Scheme, KeyPair>>({
        aes: EMPTY_KEYS,
        rsa: EMPTY_KEYS,
        ecies: EMPTY_KEYS,
    });

    const handleTabChange = (tab: MainTab) => {
        setMainTab(tab);
        localStorage.setItem('crypto-active-tab', JSON.stringify(tab));
    };
    const handleSchemeChange = (s: Scheme) => {
        setScheme(s);
        localStorage.setItem('crypto-active-scheme', JSON.stringify(s));
    };
    const handleKeysChange = (s: Scheme, keys: KeyPair) => {
        setKeysByScheme(prev => ({ ...prev, [s]: keys }));
    };

    const tabBtnCls = (active: boolean) =>
        `flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
            active
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
        }`;

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 px-5 py-3 border-r border-slate-800">
                    <ShieldCheck size={16} className="text-blue-400" />
                    <span className="text-sm font-bold text-slate-300">Cifrado</span>
                </div>
                <button
                    onClick={() => handleTabChange('cipher')}
                    className={tabBtnCls(mainTab === 'cipher')}
                >
                    <ShieldCheck size={14} /> Cifrador
                </button>
                <button
                    onClick={() => handleTabChange('json')}
                    className={tabBtnCls(mainTab === 'json')}
                >
                    <FileJson size={14} /> JSON Processor
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {mainTab === 'cipher' ? (
                    <CipherTab
                        activeScheme={scheme}
                        onSchemeChange={handleSchemeChange}
                        keysByScheme={keysByScheme}
                        onKeysChange={handleKeysChange}
                    />
                ) : (
                    <JsonProcessorTab
                        activeScheme={scheme}
                        onSchemeChange={handleSchemeChange}
                        keysByScheme={keysByScheme}
                        onKeysChange={handleKeysChange}
                    />
                )}
            </div>
        </div>
    );
};
```

**Step 2: Full TypeScript + Rust build**

```bash
npm run build 2>&1 | grep "error TS"
cd src-tauri && cargo build 2>&1 | grep "^error"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/CryptoPanel.tsx src/components/crypto/ src/context/WorkspaceContext.tsx src/components/layout/Sidebar.tsx src/components/ServiceManager.tsx
git commit -m "feat(ui): CryptoPanel — Cifrador + JSON Processor tabs with AES/RSA/ECIES"
```

---

## Task 13: Smoke test in dev mode

**Step 1: Run the app**

```bash
npm run tauri dev
```

**Step 2: Manual checks**

1. Click the `ShieldCheck` icon in the sidebar → CryptoPanel opens
2. **AES**: click "Generar" → a key appears in the key field
3. **AES Cifrar**: type text, click Cifrar → base64 output appears
4. **AES Descifrar**: paste the base64 output into input, click Descifrar → original text back
5. **RSA**: click scheme tab, generate keys → two PEM bodies appear
6. **RSA**: encrypt with public key, decrypt with private key → round-trip works
7. **ECIES**: same round-trip
8. **JSON Processor**: paste `{"nombre": "Juan", "tarjeta": {"numero": "1234"}}`, enter `nombre, tarjeta.numero`, click Cifrar → values become base64
9. **JSON Processor Descifrar todo**: paste the encrypted JSON into input, click Descifrar todo → values restored
10. **Arrays**: paste `{"items": [{"cvv": "123"}, {"cvv": "456"}]}`, enter `items[].cvv`, encrypt → both cvv values encrypted

**Step 3: Fix any issues found, commit**

```bash
git add -p
git commit -m "fix: crypto panel smoke test fixes"
```
