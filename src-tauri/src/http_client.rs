use reqwest::{Client, Method, header::{HeaderMap, HeaderName, HeaderValue}};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Deserialize)]
pub struct HttpRequestPayload {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub time_ms: u64,
    pub is_error: bool,
    pub error_msg: Option<String>,
}

#[tauri::command]
pub async fn execute_http_request(
    request: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    make_http_request(request.url, request.method, request.headers, request.body).await
}

pub async fn make_http_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<HttpResponsePayload, String> {
    let start_time = Instant::now();
    let client = Client::builder()
        .danger_accept_invalid_certs(true) // Helpful for local dev environments
        .build()
        .map_err(|e| e.to_string())?;

    let req_method = match method.to_uppercase().as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "DELETE" => Method::DELETE,
        "PATCH" => Method::PATCH,
        "HEAD" => Method::HEAD,
        "OPTIONS" => Method::OPTIONS,
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    let mut req_headers = HeaderMap::new();
    for (k, v) in headers.into_iter() {
        if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(&v)) {
            req_headers.insert(name, value);
        }
    }

    let mut builder = client.request(req_method, &url).headers(req_headers);

    if let Some(b) = body {
        if !b.is_empty() {
            builder = builder.body(b);
        }
    }

    match builder.send().await {
        Ok(res) => {
            let status = res.status();
            let mut res_headers = HashMap::new();
            for (k, v) in res.headers().iter() {
                res_headers.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
            }

            // Read body as text
            let body_text = res.text().await.unwrap_or_default();
            let elapsed = start_time.elapsed().as_millis() as u64;

            Ok(HttpResponsePayload {
                status: status.as_u16(),
                status_text: status.canonical_reason().unwrap_or("").to_string(),
                headers: res_headers,
                body: body_text,
                time_ms: elapsed,
                is_error: false,
                error_msg: None,
            })
        }
        Err(e) => {
            let elapsed = start_time.elapsed().as_millis() as u64;
            Ok(HttpResponsePayload {
                status: 0,
                status_text: "ERROR".to_string(),
                headers: HashMap::new(),
                body: "".to_string(),
                time_ms: elapsed,
                is_error: true,
                error_msg: Some(e.to_string()),
            })
        }
    }
}
