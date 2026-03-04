# CryptoPanel — Design Document
**Date:** 2026-03-04

## Overview

A new `CryptoPanel` view added to Microtermix for encrypting and decrypting data using three cryptographic schemes. All crypto operations run in Rust (Tauri commands) for correctness and security. The frontend is a friendly UI using solid, clean design.

---

## Encryption Schemes

| Scheme | Type | Rust crates |
|---|---|---|
| AES-CBC | Symmetric (single key) | `aes`, `cbc`, `hmac`, `sha2`, `rand`, `base64` |
| RSA-OAEP | Asymmetric (pub/priv PEM) | `rsa`, `sha2`, `rand`, `base64` |
| ECIES | Asymmetric (pub/priv hex-base64) | `ecies` |

---

## UI Layout

Two top-level tabs: **Cifrador** and **JSON Processor**.

### Cifrador tab

Three sub-tabs: `AES-CBC`, `RSA-OAEP`, `ECIES`.

Each scheme view has a two-column layout:

```
┌──────────────────────┬──────────────────────────────────────┐
│  LLAVES              │  OPERACIÓN                           │
│                      │                                      │
│  [Generar par]       │  Texto a cifrar / descifrar          │
│                      │  ┌────────────────────────────────┐  │
│  Llave pública:      │  │  textarea (input)              │  │
│  [__________] [copy] │  └────────────────────────────────┘  │
│                      │                                      │
│  Llave privada:      │  [▶ Cifrar]        [▶ Descifrar]    │
│  [__________] [copy] │                                      │
│                      │  Resultado:                          │
│  ── Del servicio ──  │  ┌────────────────────────────────┐  │
│  [Configurar ⚙]      │  │  textarea (readonly)           │  │
│  [Obtener llaves]    │  │  [Copy]                        │  │
│                      │  └────────────────────────────────┘  │
└──────────────────────┴──────────────────────────────────────┘
```

For AES-CBC: single key field (symmetric). For RSA/ECIES: separate public and private key fields.

### JSON Processor tab

```
┌────────────────────────────────────────────────────────────┐
│  Esquema: [AES-CBC ▾]   Llaves: [Manuales / Del servicio] │
├──────────────────────────┬─────────────────────────────────┤
│  JSON Input (Monaco)     │  JSON Output (Monaco, readonly) │
│                          │                                 │
│                          │                                 │
│                          │                                 │
├──────────────────────────┴─────────────────────────────────┤
│  Campos a cifrar (dot-notation, separados por coma):       │
│  [nombre, usuario.tarjeta.numero, pagos[].cvv         ]    │
│                                                            │
│  [▶ Cifrar campos]              [▶ Descifrar todo]         │
└────────────────────────────────────────────────────────────┘
```

---

## Array Support in JSON Processor

The JSON processor handles arrays at any level of nesting:

- `pagos[].tarjeta.numero` — itera el array `pagos` y cifra `tarjeta.numero` en cada elemento
- `items[].datos[].cvv` — soporta arrays anidados en cadena
- **Descifrar todo**: recorre recursivamente todos los campos string del JSON, incluyendo dentro de arrays. Intenta descifrar cada uno — si falla lo deja intacto (híbrido)

---

## Rust Backend

### New file: `src-tauri/src/crypto.rs`

Tauri commands exposed:

```rust
// Generate a key pair (or single key for AES)
crypto_generate_keys(scheme: String) -> Result<CryptoKeyPair, String>

// Encrypt a single string value
crypto_encrypt(scheme: String, public_key: String, data: String) -> Result<String, String>

// Decrypt a single string value
crypto_decrypt(scheme: String, private_key: String, data: String) -> Result<String, String>

// Process JSON: encrypt specified dot-notation paths, return modified JSON
crypto_encrypt_json_fields(
    scheme: String,
    public_key: String,
    json: String,
    fields: Vec<String>,   // dot-notation paths, supports [] for arrays
) -> Result<String, String>

// Process JSON: try to decrypt all string fields, leave failures intact
crypto_decrypt_json_all(
    scheme: String,
    private_key: String,
    json: String,
) -> Result<String, String>
```

`CryptoKeyPair` struct:
```rust
struct CryptoKeyPair {
    public_key: String,   // empty string for AES (only one key)
    private_key: String,  // the single key for AES
}
```

### Crates to add to Cargo.toml

```toml
aes = "0.8"
cbc = { version = "0.1", features = ["alloc"] }
rsa = { version = "0.9", features = ["sha2"] }
ecies = "0.2"
rand = "0.8"
base64 = "0.22"
sha2 = "0.10"
hmac = "0.12"
serde_json = "1"   # likely already present
```

---

## Service Integration

Collapsible config panel (per-scheme, saved in localStorage):

- **URL**: the endpoint to call
- **Método**: GET / POST
- **Body template**: JSON text with `{{TOKEN}}` placeholder replaced at runtime
- **Esquema de respuesta**: which JSON path in the response contains `publicKey` and `privateKey`
- **Token**: input field (not persisted)

Button "Obtener llaves" → calls the service → fills the key fields.

The HTTP call is made from the frontend (using `@tauri-apps/plugin-http`) so the user's network/proxy settings apply naturally.

---

## Frontend Components

| File | Purpose |
|---|---|
| `src/components/CryptoPanel.tsx` | Main panel, top-level tabs |
| `src/components/crypto/CipherTab.tsx` | Cifrador tab with scheme sub-tabs |
| `src/components/crypto/JsonProcessorTab.tsx` | JSON processor tab |
| `src/components/crypto/KeysPanel.tsx` | Reusable key management panel (manual + service) |
| `src/components/crypto/ServiceConfigDrawer.tsx` | Collapsible service config |

---

## State Persisted in localStorage

| Key | Value |
|---|---|
| `crypto-active-tab` | `cipher` \| `json` |
| `crypto-active-scheme` | `aes` \| `rsa` \| `ecies` |
| `crypto-service-config` | JSON with URL, method, body template, response paths |

---

## Navigation Wiring

1. Add `'crypto'` to `AppView` type in `WorkspaceContext.tsx`
2. Add nav icon in `Sidebar.tsx` (use `ShieldCheck` or `Lock` icon from lucide-react)
3. Add `{state.activeView === 'crypto' && <CryptoPanel />}` in `ServiceManager.tsx`
