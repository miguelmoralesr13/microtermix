use aws_sigv4::http_request::{sign, SignableBody, SignableRequest, SigningParams, SigningSettings};
use aws_sigv4::sign::v4;
use std::time::SystemTime;
use crate::cloudwatch::CwCredentials;
use aws_credential_types::Credentials;
use aws_smithy_runtime_api::client::identity::Identity;

pub fn sign_request(
    creds: &CwCredentials,
    region: &str,
    service: &str,
    method: &str,
    url: &url::Url,
    headers: &mut reqwest::header::HeaderMap,
    body: &[u8],
) -> Result<(), String> {
    let signing_settings = SigningSettings::default();
    
    let credentials = Credentials::new(
        &creds.access_key_id,
        &creds.secret_access_key,
        creds.session_token.clone(),
        None,
        "microtermix",
    );
    
    let identity = Identity::new(credentials, None);

    let v4_params = v4::SigningParams::builder()
        .identity(&identity)
        .region(region)
        .name(service)
        .time(SystemTime::now())
        .settings(signing_settings)
        .build()
        .map_err(|e| format!("Failed to build v4 signing params: {}", e))?;

    let signing_params = SigningParams::V4(v4_params);

    let signable_request = SignableRequest::new(
        method,
        url.as_str(),
        headers.iter().map(|(k, v)| (k.as_str(), v.to_str().unwrap_or_default())),
        SignableBody::Bytes(body),
    ).map_err(|e| format!("Failed to create signable request: {}", e))?;

    let (signing_instructions, _signature) = sign(signable_request, &signing_params)
        .map_err(|e| format!("Failed to sign request: {}", e))?
        .into_parts();

    for (name, value) in signing_instructions.headers() {
        headers.insert(
            reqwest::header::HeaderName::from_bytes(name.as_bytes()).map_err(|e| e.to_string())?,
            reqwest::header::HeaderValue::from_str(value).map_err(|e| e.to_string())?,
        );
    }

    Ok(())
}
