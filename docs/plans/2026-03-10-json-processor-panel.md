# JSON Processor Panel — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un panel completo de utilidades JSON — 9 tabs — donde Rust hace todo el procesamiento pesado y React solo pinta los resultados.

**Architecture:** Rust (`src-tauri/src/json_processor.rs`) expone comandos Tauri para cada operación. React invoca esos comandos con `invoke()` y renderiza el resultado en Monaco Editor (readOnly). Excepción: el validador en tiempo real usa `JSON.parse()` en JS para evitar latencia de IPC en cada keystroke.

**Tech Stack:** Rust (`serde_json` ✓, `serde_yaml` nueva, `quick-xml` nueva, `jsonpath-rust` nueva, `imara-diff` ✓), React + Monaco Editor (`@monaco-editor/react` ✓), shadcn/ui (`Tabs`, `Button`, `Select`, `Input` ✓).

---

## Chunk 1: Backend Rust — módulo `json_processor`

### Task 1: Agregar crates y crear el módulo

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/json_processor.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Agregar dependencias en `Cargo.toml`**

```toml
serde_yaml   = "0.9"
quick-xml    = { version = "0.37", features = ["serialize"] }
jsonpath-rust = "0.7"
```

- [ ] **Step 2: Crear `src-tauri/src/json_processor.rs` — esqueleto con tipos compartidos**

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ─── Tipos compartidos ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct JsonError {
    pub message: String,
    pub line: usize,
}

#[derive(Serialize)]
pub struct ValidateResult {
    pub valid: bool,
    pub error: Option<JsonError>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Indent {
    Two,
    Four,
    Tab,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetLang {
    Typescript,
    Csharp,
    Go,
    Python,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FormatTarget {
    Yaml,
    Xml,
    Csv,
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

fn parse_json_with_line(input: &str) -> Result<Value, JsonError> {
    serde_json::from_str(input).map_err(|e| {
        // serde_json reporta line/column en el error
        let line = e.line();
        JsonError { message: e.to_string(), line }
    })
}

fn indent_str(indent: &Indent) -> String {
    match indent {
        Indent::Two  => "  ".to_string(),
        Indent::Four => "    ".to_string(),
        Indent::Tab  => "\t".to_string(),
    }
}
```

- [ ] **Step 3: Agregar `mod json_processor;` en `lib.rs`**

```rust
// En src-tauri/src/lib.rs, junto al resto de mods:
mod json_processor;
```

- [ ] **Step 4: Verificar que compila**

```bash
cd src-tauri && cargo check
```
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/json_processor.rs src-tauri/src/lib.rs
git commit -m "feat: add json_processor rust module skeleton with new crates"
```

---

### Task 2: Comandos Rust — format, minify, validate, flatten

**Files:**
- Modify: `src-tauri/src/json_processor.rs`
- Modify: `src-tauri/src/lib.rs` (registrar comandos)

- [ ] **Step 1: Implementar `json_format` y `json_minify`**

Agregar en `json_processor.rs`:

```rust
#[tauri::command]
pub fn json_format(input: String, indent: Indent) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;

    // Serializar con indentación personalizada usando to_string_pretty
    // serde_json no soporta tabs nativamente, así que usamos 2/4 spaces
    // y reemplazamos si es tab
    let pretty = serde_json::to_string_pretty(&value)
        .map_err(|e| e.to_string())?;

    let result = match indent {
        Indent::Two  => pretty, // serde_json usa 2 espacios por defecto
        Indent::Four => pretty.replace("  ", "    "),
        Indent::Tab  => pretty.replace("  ", "\t"),
    };
    Ok(result)
}

#[tauri::command]
pub fn json_minify(input: String) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn json_validate(input: String) -> ValidateResult {
    match parse_json_with_line(&input) {
        Ok(_)  => ValidateResult { valid: true, error: None },
        Err(e) => ValidateResult { valid: false, error: Some(e) },
    }
}

#[tauri::command]
pub fn json_flatten(input: String) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;

    let mut flat = serde_json::Map::new();
    flatten_value(&value, String::new(), &mut flat);

    serde_json::to_string_pretty(&Value::Object(flat)).map_err(|e| e.to_string())
}

fn flatten_value(val: &Value, prefix: String, out: &mut serde_json::Map<String, Value>) {
    match val {
        Value::Object(map) => {
            for (k, v) in map {
                let key = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
                flatten_value(v, key, out);
            }
        }
        Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                let key = format!("{}[{}]", prefix, i);
                flatten_value(v, key, out);
            }
        }
        _ => { out.insert(prefix, val.clone()); }
    }
}
```

- [ ] **Step 2: Registrar los 4 comandos en `lib.rs`**

En el bloque `tauri::generate_handler![...]`, agregar:
```rust
json_processor::json_format,
json_processor::json_minify,
json_processor::json_validate,
json_processor::json_flatten,
```

- [ ] **Step 3: Verificar compilación**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/json_processor.rs src-tauri/src/lib.rs
git commit -m "feat: add json format/minify/validate/flatten rust commands"
```

---

### Task 3: Comandos Rust — generate_types (TS / C# / Go / Python)

**Files:**
- Modify: `src-tauri/src/json_processor.rs`

- [ ] **Step 1: Implementar `json_generate_types`**

```rust
#[tauri::command]
pub fn json_generate_types(
    input: String,
    lang: TargetLang,
    root_name: String,
) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;
    let name = if root_name.trim().is_empty() { "Root".to_string() } else { root_name.trim().to_string() };

    let result = match lang {
        TargetLang::Typescript => gen_typescript(&value, &name),
        TargetLang::Csharp     => gen_csharp(&value, &name),
        TargetLang::Go         => gen_go(&value, &name),
        TargetLang::Python     => gen_python(&value, &name),
    };
    Ok(result)
}

// ── TypeScript ────────────────────────────────────────────────────────────────
fn gen_typescript(val: &Value, name: &str) -> String {
    let mut out = Vec::<String>::new();
    ts_interface(val, name, &mut out);
    out.join("\n\n")
}

fn ts_interface(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("interface {} {{", name)];
        for (k, v) in map {
            let child_name = capitalize(k);
            lines.push(format!("  {}: {};", k, ts_type(v, &child_name, out)));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn ts_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null             => "null".into(),
        Value::Bool(_)          => "boolean".into(),
        Value::Number(n)        => if n.is_f64() { "number".into() } else { "number".into() },
        Value::String(_)        => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() { return "unknown[]".into(); }
            let inner = ts_type(&arr[0], &format!("{}Item", name), out);
            format!("{}[]", inner)
        }
        Value::Object(_) => {
            ts_interface(val, name, out);
            name.to_string()
        }
    }
}

// ── C# ────────────────────────────────────────────────────────────────────────
fn gen_csharp(val: &Value, name: &str) -> String {
    let mut out = Vec::<String>::new();
    cs_class(val, name, &mut out);
    out.join("\n\n")
}

fn cs_class(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("public class {}", name), "{".to_string()];
        for (k, v) in map {
            let prop = capitalize(k);
            let child = format!("{}{}",  name, prop);
            lines.push(format!("    public {} {} {{ get; set; }}", cs_type(v, &child, out), prop));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn cs_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null      => "object?".into(),
        Value::Bool(_)   => "bool".into(),
        Value::Number(n) => if n.is_f64() { "double".into() } else { "int".into() },
        Value::String(_) => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() { return "List<object>".into(); }
            format!("List<{}>", cs_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => { cs_class(val, name, out); name.to_string() }
    }
}

// ── Go ────────────────────────────────────────────────────────────────────────
fn gen_go(val: &Value, name: &str) -> String {
    let mut out = vec!["package main".to_string(), String::new()];
    go_struct(val, name, &mut out);
    out.join("\n")
}

fn go_struct(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("type {} struct {{", name)];
        for (k, v) in map {
            let field = capitalize(k);
            let child = format!("{}{}", name, field);
            lines.push(format!("\t{} {} `json:\"{}\"`", field, go_type(v, &child, out), k));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn go_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null      => "interface{}".into(),
        Value::Bool(_)   => "bool".into(),
        Value::Number(n) => if n.is_f64() { "float64".into() } else { "int".into() },
        Value::String(_) => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() { return "[]interface{}".into(); }
            format!("[]{}", go_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => { go_struct(val, name, out); name.to_string() }
    }
}

// ── Python ────────────────────────────────────────────────────────────────────
fn gen_python(val: &Value, name: &str) -> String {
    let mut out = vec!["from typing import Any, List, Optional\nfrom typing_extensions import TypedDict\n".to_string()];
    py_class(val, name, &mut out);
    out.join("\n")
}

fn py_class(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("class {}(TypedDict):", name)];
        if map.is_empty() { lines.push("    pass".into()); }
        for (k, v) in map {
            let child = format!("{}{}", name, capitalize(k));
            lines.push(format!("    {}: {}", k, py_type(v, &child, out)));
        }
        out.push(lines.join("\n"));
    }
}

fn py_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null      => "Optional[Any]".into(),
        Value::Bool(_)   => "bool".into(),
        Value::Number(n) => if n.is_f64() { "float".into() } else { "int".into() },
        Value::String(_) => "str".into(),
        Value::Array(arr) => {
            if arr.is_empty() { return "List[Any]".into(); }
            format!("List[{}]", py_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => { py_class(val, name, out); name.to_string() }
    }
}

// ── Util ──────────────────────────────────────────────────────────────────────
fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None    => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}
```

- [ ] **Step 2: Registrar en `lib.rs`**

```rust
json_processor::json_generate_types,
```

- [ ] **Step 3: Compilar**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/json_processor.rs src-tauri/src/lib.rs
git commit -m "feat: add json type generator command (TS/C#/Go/Python) in rust"
```

---

### Task 4: Comandos Rust — format_convert (YAML, XML, CSV) y jsonpath

**Files:**
- Modify: `src-tauri/src/json_processor.rs`

- [ ] **Step 1: Implementar conversiones de formato**

```rust
#[tauri::command]
pub fn json_convert_format(input: String, target: FormatTarget) -> Result<String, String> {
    match target {
        FormatTarget::Yaml => {
            let value: Value = serde_json::from_str(&input)
                .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;
            serde_yaml::to_string(&value).map_err(|e| e.to_string())
        }
        FormatTarget::Xml => {
            let value: Value = serde_json::from_str(&input)
                .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;
            json_to_xml(&value, "root")
        }
        FormatTarget::Csv => {
            let value: Value = serde_json::from_str(&input)
                .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;
            json_to_csv(&value)
        }
    }
}

#[tauri::command]
pub fn yaml_to_json_cmd(input: String) -> Result<String, String> {
    let value: Value = serde_yaml::from_str(&input).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

fn json_to_xml(val: &Value, tag: &str) -> Result<String, String> {
    use quick_xml::Writer;
    use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
    use std::io::Cursor;

    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    fn write_value(writer: &mut Writer<Cursor<Vec<u8>>>, val: &Value, tag: &str) -> Result<(), String> {
        let tag_bytes = tag.as_bytes();
        writer.write_event(Event::Start(BytesStart::new(tag))).map_err(|e| e.to_string())?;
        match val {
            Value::Object(map) => {
                for (k, v) in map {
                    write_value(writer, v, k)?;
                }
            }
            Value::Array(arr) => {
                for item in arr {
                    write_value(writer, item, "item")?;
                }
            }
            _ => {
                let text = match val {
                    Value::Null      => "null".to_string(),
                    Value::Bool(b)   => b.to_string(),
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.clone(),
                    _ => unreachable!(),
                };
                writer.write_event(Event::Text(BytesText::new(&text))).map_err(|e| e.to_string())?;
            }
        }
        writer.write_event(Event::End(BytesEnd::new(tag))).map_err(|e| e.to_string())?;
        Ok(())
    }

    write_value(&mut writer, val, tag).map_err(|e| e.to_string())?;
    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| e.to_string())
}

fn json_to_csv(val: &Value) -> Result<String, String> {
    let arr = val.as_array()
        .ok_or("El JSON debe ser un array de objetos para convertir a CSV.")?;
    if arr.is_empty() { return Ok(String::new()); }
    let first = arr[0].as_object()
        .ok_or("Los elementos del array deben ser objetos.")?;
    let headers: Vec<String> = first.keys().cloned().collect();
    let mut rows = vec![headers.join(",")];
    for item in arr {
        if let Value::Object(map) = item {
            let row: Vec<String> = headers.iter().map(|h| {
                let v = map.get(h).unwrap_or(&Value::Null);
                let s = match v {
                    Value::Null      => String::new(),
                    Value::String(s) => s.clone(),
                    other            => other.to_string(),
                };
                if s.contains(',') || s.contains('"') || s.contains('\n') {
                    format!("\"{}\"", s.replace('"', "\"\""))
                } else { s }
            }).collect();
            rows.push(row.join(","));
        }
    }
    Ok(rows.join("\n"))
}
```

- [ ] **Step 2: Implementar JSONPath query**

```rust
#[tauri::command]
pub fn json_query_path(input: String, expression: String) -> Result<String, String> {
    use jsonpath_rust::JsonPath;
    use std::str::FromStr;

    let value: Value = serde_json::from_str(&input)
        .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;

    let path = JsonPath::from_str(&expression)
        .map_err(|e| format!("Expresión JSONPath inválida: {}", e))?;

    let result = path.find(&value);
    serde_json::to_string_pretty(&result).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Registrar en `lib.rs`**

```rust
json_processor::json_convert_format,
json_processor::yaml_to_json_cmd,
json_processor::json_query_path,
```

- [ ] **Step 4: Compilar**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/json_processor.rs src-tauri/src/lib.rs
git commit -m "feat: add json format conversion (yaml/xml/csv) and jsonpath rust commands"
```

---

### Task 5: Comando Rust — json_diff

**Files:**
- Modify: `src-tauri/src/json_processor.rs`

`imara-diff` ya está instalado (se usa en `git_diff.rs`). Lo usamos para diff línea a línea del JSON formateado.

- [ ] **Step 1: Implementar `json_diff`**

```rust
#[derive(Serialize)]
pub struct DiffResult {
    pub left:  String,  // JSON izquierdo formateado
    pub right: String,  // JSON derecho formateado
    pub hunks: Vec<DiffHunk>,
}

#[derive(Serialize)]
pub struct DiffHunk {
    pub kind:    String, // "equal" | "insert" | "delete"
    pub lines:   Vec<String>,
}

#[tauri::command]
pub fn json_diff(left: String, right: String) -> Result<DiffResult, String> {
    use imara_diff::{diff, Algorithm, intern::InternedInput, UnifiedDiffBuilder};

    let left_val: Value = serde_json::from_str(&left)
        .map_err(|e| format!("JSON izquierdo línea {}: {}", e.line(), e))?;
    let right_val: Value = serde_json::from_str(&right)
        .map_err(|e| format!("JSON derecho línea {}: {}", e.line(), e))?;

    let left_fmt  = serde_json::to_string_pretty(&left_val).map_err(|e| e.to_string())?;
    let right_fmt = serde_json::to_string_pretty(&right_val).map_err(|e| e.to_string())?;

    let input  = InternedInput::new(left_fmt.as_str(), right_fmt.as_str());
    let unified = diff(Algorithm::Histogram, &input, UnifiedDiffBuilder::new(&input));

    // Devolver el unified diff como string — el frontend usa react-diff-viewer-continued
    // para renderizar: le pasamos los dos strings formateados y él calcula el diff visual
    Ok(DiffResult {
        left:  left_fmt,
        right: right_fmt,
        hunks: vec![], // reservado para diff estructural futuro
    })
}
```

- [ ] **Step 2: Registrar en `lib.rs`**

```rust
json_processor::json_diff,
```

- [ ] **Step 3: Compilar**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/json_processor.rs src-tauri/src/lib.rs
git commit -m "feat: add json diff rust command"
```

---

## Chunk 2: Frontend React — registro de vista

### Task 6: Registrar la vista `json-processor`

**Files:**
- Modify: `src/context/WorkspaceContext.tsx:20`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/ServiceManager.tsx`
- Create: `src/components/json-processor/JsonProcessorPanel.tsx` (placeholder)

- [ ] **Step 1: Agregar `'json-processor'` al tipo `AppView`**

En `src/context/WorkspaceContext.tsx`, línea 20:
```ts
// Antes:
export type AppView = '...' | 'mocks';
// Después:
export type AppView = '...' | 'mocks' | 'json-processor';
```

- [ ] **Step 2: Agregar ícono en Sidebar**

```tsx
// Import en Sidebar.tsx — agregar Braces al import de lucide-react
import { ..., Braces } from 'lucide-react';

// Agregar al final de los iconos:
{renderNavIcon('json-processor', Braces, "JSON Processor")}
```

- [ ] **Step 3: Registrar el panel en ServiceManager**

```tsx
// Import:
import { JsonProcessorPanel } from './json-processor/JsonProcessorPanel';

// En el bloque de vistas:
{state.activeView === 'json-processor' && (
    <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
        <JsonProcessorPanel />
    </div>
)}
```

- [ ] **Step 4: Crear placeholder que compila**

Crear `src/components/json-processor/JsonProcessorPanel.tsx`:
```tsx
import React from 'react';
export const JsonProcessorPanel: React.FC = () => (
    <div className="flex items-center justify-center h-full text-slate-500">
        JSON Processor — WIP
    </div>
);
```

- [ ] **Step 5: Verificar que compila**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/context/WorkspaceContext.tsx src/components/layout/Sidebar.tsx src/components/ServiceManager.tsx src/components/json-processor/JsonProcessorPanel.tsx
git commit -m "feat: register json-processor view"
```

---

## Chunk 3: Frontend React — tabs (Monaco input → invoke → Monaco output)

Patrón de cada tab:
```
[Monaco input] → [botón / acción] → invoke('json_xxx', args) → [Monaco readOnly output]
```

### Task 7: Tab — Prettier / Minifier

**Files:**
- Create: `src/components/json-processor/JsonPrettierTab.tsx`

- [ ] **Step 1: Crear `JsonPrettierTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlignLeft, Minimize2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Indent = 'two' | 'four' | 'tab';

export const JsonPrettierTab: React.FC = () => {
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [indent, setIndent] = useState<Indent>('two');
    const [error, setError]   = useState<string | null>(null);

    const run = async (cmd: 'json_format' | 'json_minify') => {
        try {
            const result = cmd === 'json_format'
                ? await invoke<string>('json_format', { input, indent })
                : await invoke<string>('json_minify', { input });
            setOutput(result);
            setError(null);
        } catch (e) {
            setError(String(e));
            setOutput('');
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente — tus datos no salen de tu equipo.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Select value={indent} onValueChange={(v) => setIndent(v as Indent)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="two">2 espacios</SelectItem>
                        <SelectItem value="four">4 espacios</SelectItem>
                        <SelectItem value="tab">Tab</SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={() => run('json_format')} className="h-7 text-xs gap-1">
                    <AlignLeft size={13} /> Formatear
                </Button>
                <Button size="sm" variant="outline" onClick={() => run('json_minify')} className="h-7 text-xs gap-1">
                    <Minimize2 size={13} /> Minificar
                </Button>
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto">
                        <Copy size={13} /> Copiar
                    </Button>
                )}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Entrada</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={input} onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/json-processor/JsonPrettierTab.tsx
git commit -m "feat: add json prettier/minifier tab"
```

---

### Task 8: Tab — Validador en tiempo real (JS puro, sin invoke)

**Files:**
- Create: `src/components/json-processor/JsonValidatorTab.tsx`

- [ ] **Step 1: Crear `JsonValidatorTab.tsx`**

Este es el único tab que no usa `invoke()`. Usa `JSON.parse` directamente para responder en < 1ms por keystroke.

```tsx
import React, { useState, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';

function suggestFix(msg: string): string {
    if (msg.includes('Unexpected token'))   return 'Puede faltar una coma, comilla o haya un carácter inválido.';
    if (msg.includes('Unexpected end'))     return 'El JSON está incompleto — revisa que { } y [ ] estén cerrados.';
    return 'Verifica la sintaxis cerca de la línea indicada.';
}

function errorLine(msg: string, input: string): number {
    const pos = msg.match(/position (\d+)/i);
    if (pos) return input.slice(0, parseInt(pos[1])).split('\n').length;
    const ln = msg.match(/line (\d+)/i);
    return ln ? parseInt(ln[1]) : 1;
}

export const JsonValidatorTab: React.FC = () => {
    const [status, setStatus]       = useState<'idle' | 'valid' | 'invalid'>('idle');
    const [errorInfo, setErrorInfo] = useState<{ msg: string; line: number } | null>(null);
    const editorRef  = useRef<Parameters<OnMount>[0] | null>(null);
    const monacoRef  = useRef<Monaco | null>(null);
    const decoRef    = useRef<string[]>([]);
    const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

    const validate = useCallback((value: string) => {
        if (!value.trim()) { setStatus('idle'); setErrorInfo(null); return; }
        try {
            JSON.parse(value);
            setStatus('valid');
            setErrorInfo(null);
            if (editorRef.current) decoRef.current = editorRef.current.deltaDecorations(decoRef.current, []);
        } catch (e) {
            const msg = (e as SyntaxError).message;
            const line = errorLine(msg, value);
            setStatus('invalid');
            setErrorInfo({ msg, line });
            if (editorRef.current && monacoRef.current) {
                decoRef.current = editorRef.current.deltaDecorations(decoRef.current, [{
                    range: new monacoRef.current.Range(line, 1, line, 9999),
                    options: { isWholeLine: true, className: 'json-err-line', glyphMarginClassName: 'json-err-glyph' },
                }]);
            }
        }
    }, []);

    const handleChange = useCallback((v: string | undefined) => {
        const val = v ?? '';
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => validate(val), 250);
    }, [validate]);

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className={`shrink-0 flex items-center gap-2 px-4 py-2 border-b text-sm transition-colors ${
                status === 'valid'   ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' :
                status === 'invalid' ? 'bg-red-950/30 border-red-800/40 text-red-400' :
                                       'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
                {status === 'valid'   && <><CheckCircle2 size={15} /> JSON válido</>}
                {status === 'invalid' && errorInfo && <>
                    <XCircle size={15} />
                    <span className="font-medium">Línea {errorInfo.line}:</span>
                    <span className="truncate">{errorInfo.msg}</span>
                    <span className="ml-2 opacity-60 shrink-0">→ {suggestFix(errorInfo.msg)}</span>
                </>}
                {status === 'idle' && 'Escribe o pega tu JSON para validar en tiempo real…'}
            </div>
            <div className="flex-1 min-h-0">
                <Editor height="100%" defaultLanguage="json" theme="vs-dark"
                    onChange={handleChange}
                    onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
                    options={{ minimap: { enabled: false }, fontSize: 13, glyphMargin: true, scrollBeyondLastLine: false }} />
            </div>
            <style>{`.json-err-line{background:rgba(239,68,68,.12)!important}.json-err-glyph::before{content:'✖';color:#ef4444;font-size:11px}`}</style>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/json-processor/JsonValidatorTab.tsx
git commit -m "feat: add real-time JSON validator tab (js, no invoke latency)"
```

---

### Task 9: Tab — Conversor de Tipos

**Files:**
- Create: `src/components/json-processor/JsonTypeConverterTab.tsx`

- [ ] **Step 1: Crear `JsonTypeConverterTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Wand2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Lang = 'typescript' | 'csharp' | 'go' | 'python';
const LANG_LABELS: Record<Lang, string> = {
    typescript: 'TypeScript (interface)',
    csharp:     'C# (class)',
    go:         'Go (struct)',
    python:     'Python (TypedDict)',
};
const MONACO_LANG: Record<Lang, string> = { typescript: 'typescript', csharp: 'csharp', go: 'go', python: 'python' };

export const JsonTypeConverterTab: React.FC = () => {
    const [input, setInput]       = useState('');
    const [output, setOutput]     = useState('');
    const [lang, setLang]         = useState<Lang>('typescript');
    const [rootName, setRootName] = useState('Root');
    const [error, setError]       = useState<string | null>(null);

    const handleConvert = async () => {
        try {
            const result = await invoke<string>('json_generate_types', { input, lang, rootName: rootName.trim() || 'Root' });
            setOutput(result);
            setError(null);
        } catch (e) { setError(String(e)); setOutput(''); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                    <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input value={rootName} onChange={e => setRootName(e.target.value)} className="h-7 w-28 text-xs" placeholder="Root" />
                <Button size="sm" onClick={handleConvert} className="h-7 text-xs gap-1"><Wand2 size={13} /> Generar</Button>
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto"><Copy size={13} /> Copiar</Button>
                )}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON entrada</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={input} onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Código generado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" language={MONACO_LANG[lang]} theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/json-processor/JsonTypeConverterTab.tsx
git commit -m "feat: add JSON type converter tab"
```

---

### Task 10: Tab — Tree View (React puro, sin invoke)

**Files:**
- Create: `src/components/json-processor/JsonTreeNode.tsx`
- Create: `src/components/json-processor/JsonTreeViewTab.tsx`

El tree view es puro React — recibe el JSON como string, lo parsea en JS (`JSON.parse`) y renderiza un árbol colapsable. No vale la pena el round-trip a Rust solo para hacer un `JSON.parse`.

- [ ] **Step 1: Crear `JsonTreeNode.tsx`**

```tsx
import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

type JsonVal = unknown;

function valueColor(val: JsonVal): string {
    if (val === null)            return 'text-slate-500';
    if (typeof val === 'string') return 'text-emerald-400';
    if (typeof val === 'number') return 'text-blue-400';
    if (typeof val === 'boolean')return 'text-amber-400';
    return 'text-slate-300';
}

function renderLeaf(val: JsonVal): string {
    if (val === null)            return 'null';
    if (typeof val === 'string') return `"${val}"`;
    return String(val);
}

interface Props {
    nodeKey: string | null;
    value:   JsonVal;
    depth?:  number;
}

export const JsonTreeNode: React.FC<Props> = ({ nodeKey, value, depth = 0 }) => {
    const isObj   = value !== null && typeof value === 'object';
    const isArr   = Array.isArray(value);
    const [open, setOpen] = useState(depth < 3);
    const children = isObj
        ? isArr
            ? (value as JsonVal[]).map((v, i) => [String(i), v] as [string, JsonVal])
            : Object.entries(value as Record<string, JsonVal>)
        : [];

    return (
        <div>
            <div
                className="flex items-center gap-1 py-[2px] hover:bg-slate-800/40 rounded cursor-pointer select-none"
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
                onClick={() => isObj && setOpen(o => !o)}
            >
                <span className="w-4 text-slate-500 shrink-0">
                    {isObj ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
                </span>
                {nodeKey !== null && <span className="text-violet-300 text-xs font-mono">{nodeKey}:</span>}
                {isObj ? (
                    <span className="text-slate-400 text-xs font-mono">
                        {isArr ? '[' : '{'}
                        {!open && <span className="text-slate-600 mx-1">{children.length} items</span>}
                        {!open && (isArr ? ']' : '}')}
                    </span>
                ) : (
                    <span className={`text-xs font-mono ${valueColor(value)}`}>{renderLeaf(value)}</span>
                )}
            </div>
            {isObj && open && (
                <>
                    {children.map(([k, v]) => (
                        <JsonTreeNode key={k} nodeKey={isArr ? null : k} value={v} depth={depth + 1} />
                    ))}
                    <div className="text-slate-400 text-xs font-mono py-[2px]" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
                        <span className="w-4 inline-block" />{isArr ? ']' : '}'}
                    </div>
                </>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Crear `JsonTreeViewTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { GitBranch, ShieldCheck } from 'lucide-react';
import { JsonTreeNode } from './JsonTreeNode';

export const JsonTreeViewTab: React.FC = () => {
    const [input, setInput]   = useState('');
    const [parsed, setParsed] = useState<unknown>(null);
    const [error, setError]   = useState<string | null>(null);
    const [key, setKey]       = useState(0);

    const handleVisualize = () => {
        try {
            setParsed(JSON.parse(input));
            setError(null);
            setKey(k => k + 1);
        } catch (e) { setError(String(e)); setParsed(null); }
    };

    return (
        <div className="flex h-full">
            <div className="w-2/5 flex flex-col border-r border-slate-800">
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                    <span className="text-xs text-slate-400 flex-1 font-bold">JSON entrada</span>
                    <Button size="sm" onClick={handleVisualize} className="h-7 text-xs gap-1">
                        <GitBranch size={13} /> Visualizar
                    </Button>
                </div>
                <div className="flex-1 min-h-0">
                    <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={input}
                        onChange={(v) => setInput(v ?? '')}
                        options={{ minimap: { enabled: false }, fontSize: 13 }} />
                </div>
            </div>
            <div className="flex-1 flex flex-col min-w-0">
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                    <ShieldCheck size={13} /> Procesado localmente.
                </div>
                {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
                <div className="flex-1 overflow-auto p-2">
                    {parsed !== null
                        ? <JsonTreeNode key={key} nodeKey={null} value={parsed} />
                        : <div className="flex items-center justify-center h-full text-slate-600 text-sm">Pega tu JSON y presiona Visualizar</div>
                    }
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/json-processor/JsonTreeNode.tsx src/components/json-processor/JsonTreeViewTab.tsx
git commit -m "feat: add JSON tree view tab (react only)"
```

---

### Task 11: Tab — JSONPath, Formatos, Diff, Editor Visual, Aplanar

Todos siguen el mismo patrón: Monaco input → `invoke()` → Monaco output.

**Files:**
- Create: `src/components/json-processor/JsonPathTab.tsx`
- Create: `src/components/json-processor/JsonFormatTab.tsx`
- Create: `src/components/json-processor/JsonDiffTab.tsx`
- Create: `src/components/json-processor/JsonNodeEditorTab.tsx`
- Create: `src/components/json-processor/JsonFlatTab.tsx`

- [ ] **Step 1: Crear `JsonPathTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const EXAMPLES = ['$.*', '$.store.book[*].author', '$..[?(@.price < 10)]', '$..name'];

export const JsonPathTab: React.FC = () => {
    const [input, setInput]       = useState('');
    const [expr, setExpr]         = useState('$.*');
    const [output, setOutput]     = useState('');
    const [error, setError]       = useState<string | null>(null);

    const handleQuery = async () => {
        try {
            const result = await invoke<string>('json_query_path', { input, expression: expr });
            setOutput(result); setError(null);
        } catch (e) { setError(String(e)); setOutput(''); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Input value={expr} onChange={e => setExpr(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuery()}
                    className="h-7 w-64 text-xs font-mono" placeholder="$.*" />
                <Button size="sm" onClick={handleQuery} className="h-7 text-xs gap-1"><Search size={13} /> Consultar</Button>
                <span className="text-xs text-slate-600">Ejemplos:</span>
                {EXAMPLES.map(ex => (
                    <button key={ex} onClick={() => setExpr(ex)} className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">{ex}</button>
                ))}
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto"><Copy size={13} /> Copiar</Button>
                )}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON fuente</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={input} onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Crear `JsonFormatTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'json-yaml' | 'yaml-json' | 'json-csv' | 'json-xml';
const MODE_LABELS: Record<Mode, string> = {
    'json-yaml': 'JSON → YAML',
    'yaml-json': 'YAML → JSON',
    'json-csv':  'JSON → CSV (array)',
    'json-xml':  'JSON → XML',
};
const INPUT_LANG: Record<Mode, string>  = { 'json-yaml': 'json', 'yaml-json': 'yaml', 'json-csv': 'json', 'json-xml': 'json' };
const OUTPUT_LANG: Record<Mode, string> = { 'json-yaml': 'yaml', 'yaml-json': 'json', 'json-csv': 'plaintext', 'json-xml': 'xml' };

export const JsonFormatTab: React.FC = () => {
    const [mode, setMode]     = useState<Mode>('json-yaml');
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [error, setError]   = useState<string | null>(null);

    const handleConvert = async () => {
        try {
            let result: string;
            if (mode === 'yaml-json') {
                result = await invoke<string>('yaml_to_json_cmd', { input });
            } else {
                const target = mode.split('-')[1] as 'yaml' | 'csv' | 'xml';
                result = await invoke<string>('json_convert_format', { input, target });
            }
            setOutput(result); setError(null);
        } catch (e) { setError(String(e)); setOutput(''); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setOutput(''); setError(null); }}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={handleConvert} className="h-7 text-xs gap-1"><ArrowLeftRight size={13} /> Convertir</Button>
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto"><Copy size={13} /> Copiar</Button>
                )}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Entrada</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" language={INPUT_LANG[mode]} theme="vs-dark" value={input} onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Resultado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" language={OUTPUT_LANG[mode]} theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 3: Crear `JsonDiffTab.tsx`**

Rust formatea ambos JSONs; `react-diff-viewer-continued` (ya instalado) renderiza el diff visual.

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { GitCompareArrows, ShieldCheck } from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface DiffResult { left: string; right: string }

export const JsonDiffTab: React.FC = () => {
    const [left, setLeft]   = useState('');
    const [right, setRight] = useState('');
    const [diff, setDiff]   = useState<DiffResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCompare = async () => {
        try {
            const result = await invoke<DiffResult>('json_diff', { left, right });
            setDiff(result); setError(null);
        } catch (e) { setError(String(e)); setDiff(null); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={handleCompare} className="h-7 text-xs gap-1"><GitCompareArrows size={13} /> Comparar</Button>
                {diff && <Button size="sm" variant="ghost" onClick={() => setDiff(null)} className="h-7 text-xs">Ver editores</Button>}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            {!diff ? (
                <div className="flex-1 min-h-0 flex">
                    {([['Izquierdo (original)', left, setLeft], ['Derecho (modificado)', right, setRight]] as const).map(([label, value, setter], i) => (
                        <div key={i} className={`flex-1 min-w-0 flex flex-col ${i === 0 ? 'border-r border-slate-800' : ''}`}>
                            <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">{label}</div>
                            <div className="flex-1 min-h-0">
                                <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={value}
                                    onChange={(v) => setter(v ?? '')} options={{ minimap: { enabled: false }, fontSize: 13 }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                    <ReactDiffViewer oldValue={diff.left} newValue={diff.right} splitView useDarkTheme
                        compareMethod={DiffMethod.LINES} leftTitle="Original" rightTitle="Modificado"
                        styles={{ variables: { dark: { diffViewerBackground: '#0f172a', gutterBackground: '#0f172a', addedBackground: '#14532d55', removedBackground: '#7f1d1d55' } } }}
                    />
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 4: Crear `JsonFlatTab.tsx`**

```tsx
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Table2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export const JsonFlatTab: React.FC = () => {
    const [input, setInput]   = useState('');
    const [output, setOutput] = useState('');
    const [error, setError]   = useState<string | null>(null);

    const handleFlatten = async () => {
        try {
            const result = await invoke<string>('json_flatten', { input });
            setOutput(result); setError(null);
        } catch (e) { setError(String(e)); setOutput(''); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={handleFlatten} className="h-7 text-xs gap-1"><Table2 size={13} /> Aplanar</Button>
                {output && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(output); toast.success('Copiado'); }}
                        className="h-7 text-xs gap-1 ml-auto"><Copy size={13} /> Copiar</Button>
                )}
            </div>
            {error && <div className="shrink-0 px-4 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400">✖ {error}</div>}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON anidado</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={input} onChange={(v) => setInput(v ?? '')}
                            options={{ minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">JSON plano (dot-notation)</div>
                    <div className="flex-1 min-h-0">
                        <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={output}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 5: Crear `JsonNodeEditorTab.tsx`**

Editor visual de nodos — React puro (es estado de formulario, sin procesamiento).

```tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type FieldType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
interface Field { id: string; key: string; type: FieldType; value: string }

let _id = 0;
const uid = () => String(++_id);

function coerce(f: Field): unknown {
    switch (f.type) {
        case 'string':  return f.value;
        case 'number':  return Number(f.value) || 0;
        case 'boolean': return f.value === 'true';
        case 'null':    return null;
        case 'object':  try { return JSON.parse(f.value || '{}'); } catch { return {}; }
        case 'array':   try { return JSON.parse(f.value || '[]'); } catch { return []; }
    }
}

export const JsonNodeEditorTab: React.FC = () => {
    const [fields, setFields] = useState<Field[]>([{ id: uid(), key: '', type: 'string', value: '' }]);

    const add    = ()          => setFields(p => [...p, { id: uid(), key: '', type: 'string', value: '' }]);
    const remove = (id:string) => setFields(p => p.filter(f => f.id !== id));
    const update = (id:string, patch: Partial<Field>) => setFields(p => p.map(f => f.id === id ? {...f, ...patch} : f));

    const buildJson = () => {
        const obj: Record<string, unknown> = {};
        fields.forEach(f => { if (f.key) obj[f.key] = coerce(f); });
        return JSON.stringify(obj, null, 2);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={add} className="h-7 text-xs gap-1"><Plus size={13} /> Añadir campo</Button>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(buildJson()); toast.success('JSON copiado'); }}
                    className="h-7 text-xs gap-1"><Copy size={13} /> Copiar JSON</Button>
            </div>
            <div className="flex-1 min-h-0 flex">
                <div className="w-1/2 overflow-auto p-4 space-y-2 border-r border-slate-800">
                    {fields.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                            <span className="text-xs text-slate-600 w-5 shrink-0">{i + 1}</span>
                            <Input value={f.key} onChange={e => update(f.id, { key: e.target.value })} placeholder="clave" className="h-7 w-28 text-xs font-mono" />
                            <Select value={f.type} onValueChange={v => update(f.id, { type: v as FieldType, value: '' })}>
                                <SelectTrigger className="h-7 w-24 text-xs shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(['string','number','boolean','null','object','array'] as FieldType[]).map(t =>
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            {f.type !== 'null' && (
                                <Input value={f.value} onChange={e => update(f.id, { value: e.target.value })}
                                    placeholder={f.type === 'boolean' ? 'true / false' : f.type === 'object' ? '{"a":1}' : f.type === 'array' ? '[1,2]' : 'valor'}
                                    className="h-7 flex-1 text-xs font-mono" />
                            )}
                            <Button size="icon-xs" variant="ghost" onClick={() => remove(f.id)} className="h-7 w-7 shrink-0 text-red-500 hover:text-red-400">
                                <Trash2 size={13} />
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">Preview JSON</div>
                    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 bg-slate-950">{buildJson()}</pre>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 6: Commit todos los tabs**

```bash
git add src/components/json-processor/JsonPathTab.tsx src/components/json-processor/JsonFormatTab.tsx src/components/json-processor/JsonDiffTab.tsx src/components/json-processor/JsonFlatTab.tsx src/components/json-processor/JsonNodeEditorTab.tsx
git commit -m "feat: add jsonpath/format/diff/flat/node-editor tabs"
```

---

## Chunk 4: Panel raíz final — ensamblar todos los tabs

### Task 12: Reemplazar placeholder con `JsonProcessorPanel` completo

**Files:**
- Modify: `src/components/json-processor/JsonProcessorPanel.tsx`

- [ ] **Step 1: Reemplazar el placeholder**

```tsx
import React, { useState } from 'react';
import { Braces, AlignLeft, CheckCircle2, Code2, GitBranch, Search, ArrowLeftRight, GitCompareArrows, SquarePen, Table2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { JsonPrettierTab }      from './JsonPrettierTab';
import { JsonValidatorTab }     from './JsonValidatorTab';
import { JsonTypeConverterTab } from './JsonTypeConverterTab';
import { JsonTreeViewTab }      from './JsonTreeViewTab';
import { JsonPathTab }          from './JsonPathTab';
import { JsonFormatTab }        from './JsonFormatTab';
import { JsonDiffTab }          from './JsonDiffTab';
import { JsonNodeEditorTab }    from './JsonNodeEditorTab';
import { JsonFlatTab }          from './JsonFlatTab';

const TABS = [
    { id: 'prettier',  label: 'Prettier',      Icon: AlignLeft },
    { id: 'validator', label: 'Validador',      Icon: CheckCircle2 },
    { id: 'converter', label: 'Tipos',          Icon: Code2 },
    { id: 'tree',      label: 'Tree View',      Icon: GitBranch },
    { id: 'jsonpath',  label: 'JSONPath',       Icon: Search },
    { id: 'format',    label: 'Formatos',       Icon: ArrowLeftRight },
    { id: 'diff',      label: 'Diff',           Icon: GitCompareArrows },
    { id: 'nodes',     label: 'Editor Visual',  Icon: SquarePen },
    { id: 'flat',      label: 'Aplanar',        Icon: Table2 },
] as const;

type TabId = typeof TABS[number]['id'];
const STORAGE_KEY = 'nexus-json-processor-tab';

export const JsonProcessorPanel: React.FC = () => {
    const [active, setActive] = useState<TabId>(() => {
        try { return (localStorage.getItem(STORAGE_KEY) as TabId) || 'prettier'; } catch { return 'prettier'; }
    });

    const handleChange = (val: string) => {
        setActive(val as TabId);
        try { localStorage.setItem(STORAGE_KEY, val); } catch { /* */ }
    };

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 px-4 py-3 border-r border-slate-800 shrink-0">
                    <Braces size={15} className="text-violet-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">JSON Processor</span>
                </div>
                <div className="overflow-x-auto">
                    <Tabs value={active} onValueChange={handleChange}>
                        <TabsList variant="line" className="h-12 rounded-none bg-transparent gap-0 px-1">
                            {TABS.map(({ id, label, Icon }) => (
                                <TabsTrigger key={id} value={id} className="gap-1.5 text-xs px-4 h-full">
                                    <Icon size={13} /> {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {active === 'prettier'  && <JsonPrettierTab />}
                {active === 'validator' && <JsonValidatorTab />}
                {active === 'converter' && <JsonTypeConverterTab />}
                {active === 'tree'      && <JsonTreeViewTab />}
                {active === 'jsonpath'  && <JsonPathTab />}
                {active === 'format'    && <JsonFormatTab />}
                {active === 'diff'      && <JsonDiffTab />}
                {active === 'nodes'     && <JsonNodeEditorTab />}
                {active === 'flat'      && <JsonFlatTab />}
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Build final**

```bash
npm run build && cd src-tauri && cargo check
```
Expected: sin errores en TypeScript ni Rust.

- [ ] **Step 3: Commit final**

```bash
git add src/components/json-processor/JsonProcessorPanel.tsx
git commit -m "feat: assemble complete JSON processor panel (9 tabs, rust backend)"
```

---

## Resumen de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src-tauri/Cargo.toml` | Modify | Agregar `serde_yaml`, `quick-xml`, `jsonpath-rust` |
| `src-tauri/src/json_processor.rs` | Create | Todos los comandos Tauri de procesamiento JSON |
| `src-tauri/src/lib.rs` | Modify | `mod json_processor` + registrar comandos |
| `src/context/WorkspaceContext.tsx` | Modify | Añadir `'json-processor'` al tipo `AppView` |
| `src/components/layout/Sidebar.tsx` | Modify | Ícono `Braces` para la nueva vista |
| `src/components/ServiceManager.tsx` | Modify | Registrar `<JsonProcessorPanel />` |
| `src/components/json-processor/JsonProcessorPanel.tsx` | Create | Panel raíz con shadcn Tabs (9 tabs) |
| `src/components/json-processor/JsonPrettierTab.tsx` | Create | invoke json_format / json_minify |
| `src/components/json-processor/JsonValidatorTab.tsx` | Create | JS puro — JSON.parse + Monaco decorations |
| `src/components/json-processor/JsonTypeConverterTab.tsx` | Create | invoke json_generate_types |
| `src/components/json-processor/JsonTreeViewTab.tsx` | Create | React puro — árbol colapsable con JsonTreeNode |
| `src/components/json-processor/JsonTreeNode.tsx` | Create | Componente recursivo del árbol |
| `src/components/json-processor/JsonPathTab.tsx` | Create | invoke json_query_path |
| `src/components/json-processor/JsonFormatTab.tsx` | Create | invoke json_convert_format / yaml_to_json_cmd |
| `src/components/json-processor/JsonDiffTab.tsx` | Create | invoke json_diff + react-diff-viewer-continued |
| `src/components/json-processor/JsonFlatTab.tsx` | Create | invoke json_flatten |
| `src/components/json-processor/JsonNodeEditorTab.tsx` | Create | React puro — editor visual de campos |

## Decisiones de arquitectura

| Feature | Dónde | Razón |
|---|---|---|
| format, minify, types, flatten, jsonpath, yaml, xml, csv, diff | **Rust** | Procesamiento real → Rust es más rápido y robusto |
| Validador tiempo real | **JS** | Keystrokes → IPC latency inaceptable |
| Tree View | **React** | Es puro render, no hay procesamiento |
| Editor Visual de Nodos | **React** | Estado de formulario UI |
