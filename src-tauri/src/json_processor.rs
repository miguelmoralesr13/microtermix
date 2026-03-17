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

#[derive(Serialize)]
pub struct DiffResult {
    pub left: String,
    pub right: String,
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

fn parse_json_with_line(input: &str) -> Result<Value, JsonError> {
    serde_json::from_str(input).map_err(|e| JsonError {
        message: e.to_string(),
        line: e.line(),
    })
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

// ─── format / minify / validate / flatten ────────────────────────────────────

#[tauri::command]
pub fn json_format(input: String, indent: Indent) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;
    let pretty = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    let result = match indent {
        Indent::Two => pretty,
        Indent::Four => pretty.replace("  ", "    "),
        Indent::Tab => pretty.replace("  ", "\t"),
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
pub fn json_escape(input: String) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;
    let minified = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    // serde_json::to_string of a String value handles the escaping
    Ok(serde_json::to_string(&minified).unwrap_or_default())
}

#[tauri::command]
pub fn json_unescape(input: String) -> Result<String, String> {
    // 1. Try to parse as a JSON value first (this handles if it's already a quoted escaped string)
    let val: Value = match serde_json::from_str(&input) {
        Ok(v) => v,
        Err(_) => {
            // If not a valid JSON literal, maybe it's just the raw escaped content without surrounding quotes
            // Wrap in quotes and try again
            let wrapped = format!("\"{}\"", input);
            serde_json::from_str(&wrapped).map_err(|e| format!("No es un string escapado válido: {}", e))?
        }
    };

    if let Some(inner_str) = val.as_str() {
        // Now try to parse the inner string as JSON
        let inner_val: Value = serde_json::from_str(inner_str)
            .map_err(|e| format!("El contenido escapado no es un JSON válido: {}", e))?;
        serde_json::to_string_pretty(&inner_val).map_err(|e| e.to_string())
    } else {
        Err("La entrada no es un string de JSON.".into())
    }
}

#[tauri::command]
pub fn json_validate(input: String) -> ValidateResult {
    match parse_json_with_line(&input) {
        Ok(_) => ValidateResult { valid: true, error: None },
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
                let key = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", prefix, k)
                };
                flatten_value(v, key, out);
            }
        }
        Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                let key = format!("{}[{}]", prefix, i);
                flatten_value(v, key, out);
            }
        }
        _ => {
            out.insert(prefix, val.clone());
        }
    }
}

// ─── Generador de tipos ───────────────────────────────────────────────────────

#[tauri::command]
pub fn json_generate_types(
    input: String,
    lang: TargetLang,
    root_name: String,
) -> Result<String, String> {
    let value = parse_json_with_line(&input)
        .map_err(|e| format!("Línea {}: {}", e.line, e.message))?;
    let name = if root_name.trim().is_empty() {
        "Root".to_string()
    } else {
        root_name.trim().to_string()
    };
    Ok(match lang {
        TargetLang::Typescript => gen_typescript(&value, &name),
        TargetLang::Csharp => gen_csharp(&value, &name),
        TargetLang::Go => gen_go(&value, &name),
        TargetLang::Python => gen_python(&value, &name),
    })
}

// TypeScript
fn gen_typescript(val: &Value, name: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    ts_interface(val, name, &mut out);
    out.join("\n\n")
}

fn ts_interface(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("interface {} {{", name)];
        for (k, v) in map {
            let child = capitalize(k);
            lines.push(format!("  {}: {};", k, ts_type(v, &child, out)));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn ts_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null => "null".into(),
        Value::Bool(_) => "boolean".into(),
        Value::Number(_) => "number".into(),
        Value::String(_) => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() {
                return "unknown[]".into();
            }
            format!("{}[]", ts_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => {
            ts_interface(val, name, out);
            name.to_string()
        }
    }
}

// C#
fn gen_csharp(val: &Value, name: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    cs_class(val, name, &mut out);
    out.join("\n\n")
}

fn cs_class(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("public class {}", name), "{".to_string()];
        for (k, v) in map {
            let prop = capitalize(k);
            let child = format!("{}{}", name, prop);
            lines.push(format!(
                "    public {} {} {{ get; set; }}",
                cs_type(v, &child, out),
                prop
            ));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn cs_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null => "object?".into(),
        Value::Bool(_) => "bool".into(),
        Value::Number(n) => {
            if n.is_f64() {
                "double".into()
            } else {
                "int".into()
            }
        }
        Value::String(_) => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() {
                return "List<object>".into();
            }
            format!(
                "List<{}>",
                cs_type(&arr[0], &format!("{}Item", name), out)
            )
        }
        Value::Object(_) => {
            cs_class(val, name, out);
            name.to_string()
        }
    }
}

// Go
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
            lines.push(format!(
                "\t{} {} `json:\"{}\"`",
                field,
                go_type(v, &child, out),
                k
            ));
        }
        lines.push("}".to_string());
        out.push(lines.join("\n"));
    }
}

fn go_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null => "interface{}".into(),
        Value::Bool(_) => "bool".into(),
        Value::Number(n) => {
            if n.is_f64() {
                "float64".into()
            } else {
                "int".into()
            }
        }
        Value::String(_) => "string".into(),
        Value::Array(arr) => {
            if arr.is_empty() {
                return "[]interface{}".into();
            }
            format!("[]{}", go_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => {
            go_struct(val, name, out);
            name.to_string()
        }
    }
}

// Python
fn gen_python(val: &Value, name: &str) -> String {
    let mut out = vec![
        "from typing import Any, List, Optional\nfrom typing_extensions import TypedDict\n"
            .to_string(),
    ];
    py_class(val, name, &mut out);
    out.join("\n")
}

fn py_class(val: &Value, name: &str, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        let mut lines = vec![format!("class {}(TypedDict):", name)];
        if map.is_empty() {
            lines.push("    pass".into());
        }
        for (k, v) in map {
            let child = format!("{}{}", name, capitalize(k));
            lines.push(format!("    {}: {}", k, py_type(v, &child, out)));
        }
        out.push(lines.join("\n"));
    }
}

fn py_type(val: &Value, name: &str, out: &mut Vec<String>) -> String {
    match val {
        Value::Null => "Optional[Any]".into(),
        Value::Bool(_) => "bool".into(),
        Value::Number(n) => {
            if n.is_f64() {
                "float".into()
            } else {
                "int".into()
            }
        }
        Value::String(_) => "str".into(),
        Value::Array(arr) => {
            if arr.is_empty() {
                return "List[Any]".into();
            }
            format!("List[{}]", py_type(&arr[0], &format!("{}Item", name), out))
        }
        Value::Object(_) => {
            py_class(val, name, out);
            name.to_string()
        }
    }
}

// ─── Conversión de formatos ───────────────────────────────────────────────────

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
    use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
    use quick_xml::Writer;
    use std::io::Cursor;

    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);

    fn write_val(
        writer: &mut Writer<Cursor<Vec<u8>>>,
        val: &Value,
        tag: &str,
    ) -> Result<(), String> {
        writer
            .write_event(Event::Start(BytesStart::new(tag)))
            .map_err(|e| e.to_string())?;
        match val {
            Value::Object(map) => {
                for (k, v) in map {
                    write_val(writer, v, k)?;
                }
            }
            Value::Array(arr) => {
                for item in arr {
                    write_val(writer, item, "item")?;
                }
            }
            _ => {
                let text = match val {
                    Value::Null => "null".to_string(),
                    Value::Bool(b) => b.to_string(),
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.clone(),
                    _ => unreachable!(),
                };
                writer
                    .write_event(Event::Text(BytesText::new(&text)))
                    .map_err(|e| e.to_string())?;
            }
        }
        writer
            .write_event(Event::End(BytesEnd::new(tag)))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    write_val(&mut writer, val, tag)?;
    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| e.to_string())
}

fn json_to_csv(val: &Value) -> Result<String, String> {
    let arr = val
        .as_array()
        .ok_or("El JSON debe ser un array de objetos para convertir a CSV.")?;
    if arr.is_empty() {
        return Ok(String::new());
    }
    let first = arr[0]
        .as_object()
        .ok_or("Los elementos del array deben ser objetos.")?;
    let headers: Vec<String> = first.keys().cloned().collect();
    let mut rows = vec![headers.join(",")];
    for item in arr {
        if let Value::Object(map) = item {
            let row: Vec<String> = headers
                .iter()
                .map(|h| {
                    let v = map.get(h).unwrap_or(&Value::Null);
                    let s = match v {
                        Value::Null => String::new(),
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    if s.contains(',') || s.contains('"') || s.contains('\n') {
                        format!("\"{}\"", s.replace('"', "\"\""))
                    } else {
                        s
                    }
                })
                .collect();
            rows.push(row.join(","));
        }
    }
    Ok(rows.join("\n"))
}

// ─── JSONPath ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn json_query_path(input: String, expression: String) -> Result<String, String> {
    use jsonpath_rust::JsonPath;
    use std::str::FromStr;

    let value: Value = serde_json::from_str(&input)
        .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;

    let path =
        JsonPath::from_str(&expression).map_err(|e| format!("JSONPath inválido: {}", e))?;

    let result = path.find(&value);
    serde_json::to_string_pretty(&result).map_err(|e| e.to_string())
}

// ─── JSON Schema ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn json_generate_schema(input: String) -> Result<String, String> {
    let value: Value = serde_json::from_str(&input)
        .map_err(|e| format!("JSON inválido línea {}: {}", e.line(), e))?;
    
    let schema = infer_schema(&value);
    serde_json::to_string_pretty(&schema).map_err(|e| e.to_string())
}

fn infer_schema(val: &Value) -> Value {
    let mut obj = serde_json::Map::new();
    match val {
        Value::Null => {
            obj.insert("type".into(), "null".into());
        }
        Value::Bool(_) => {
            obj.insert("type".into(), "boolean".into());
        }
        Value::Number(n) => {
            if n.is_f64() {
                obj.insert("type".into(), "number".into());
            } else {
                obj.insert("type".into(), "integer".into());
            }
        }
        Value::String(_) => {
            obj.insert("type".into(), "string".into());
        }
        Value::Array(arr) => {
            obj.insert("type".into(), "array".into());
            if !arr.is_empty() {
                obj.insert("items".into(), infer_schema(&arr[0]));
            }
        }
        Value::Object(map) => {
            obj.insert("type".into(), "object".into());
            let mut props = serde_json::Map::new();
            let mut required = Vec::new();
            for (k, v) in map {
                props.insert(k.clone(), infer_schema(v));
                required.push(Value::String(k.clone()));
            }
            if !props.is_empty() {
                obj.insert("properties".into(), Value::Object(props));
                obj.insert("required".into(), Value::Array(required));
            }
        }
    }
    Value::Object(obj)
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn json_diff(left: String, right: String) -> Result<DiffResult, String> {
    let left_val: Value = serde_json::from_str(&left)
        .map_err(|e| format!("JSON izquierdo línea {}: {}", e.line(), e))?;
    let right_val: Value = serde_json::from_str(&right)
        .map_err(|e| format!("JSON derecho línea {}: {}", e.line(), e))?;

    let left_fmt = serde_json::to_string_pretty(&left_val).map_err(|e| e.to_string())?;
    let right_fmt = serde_json::to_string_pretty(&right_val).map_err(|e| e.to_string())?;

    Ok(DiffResult {
        left: left_fmt,
        right: right_fmt,
    })
}
