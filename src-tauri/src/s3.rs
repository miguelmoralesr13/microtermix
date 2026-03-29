use serde::Serialize;
use crate::cloudwatch::CwCredentials;

async fn s3_client(c: &CwCredentials) -> aws_sdk_s3::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        token, None, "microtermix",
    );
    let cfg = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load().await;
    aws_sdk_s3::Client::new(&cfg)
}

#[derive(Debug, Serialize)]
pub struct S3Bucket {
    pub name: String,
    pub creation_date: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<i64>,
    pub storage_class: String,
    pub is_folder: bool,
}

#[tauri::command]
pub async fn s3_list_buckets(credentials: CwCredentials) -> Result<Vec<S3Bucket>, String> {
    let client = s3_client(&credentials).await;
    match client.list_buckets().send().await {
        Ok(output) => {
            let buckets = output.buckets().iter().map(|b| S3Bucket {
                name: b.name().unwrap_or("unknown").to_string(),
                creation_date: b.creation_date().map(|d| d.secs()),
            }).collect();
            Ok(buckets)
        }
        Err(e) => Err(format!("S3 Error: {:?}", e)),
    }
}

#[tauri::command]
pub async fn s3_list_objects(
    credentials: CwCredentials,
    bucket: String,
    prefix: Option<String>,
    delimiter: Option<String>,
) -> Result<Vec<S3Object>, String> {
    let client = s3_client(&credentials).await;
    let mut request = client.list_objects_v2().bucket(bucket);
    if let Some(p) = prefix.clone() { request = request.prefix(p); }
    if let Some(d) = delimiter { request = request.delimiter(d); }

    match request.send().await {
        Ok(output) => {
            let mut results = Vec::new();

            // En SDK v1, common_prefixes() devuelve &[CommonPrefix] directamente
            for p in output.common_prefixes() {
                results.push(S3Object {
                    key: p.prefix().unwrap_or("").to_string(),
                    size: 0,
                    last_modified: None,
                    storage_class: "DIRECTORY".to_string(),
                    is_folder: true,
                });
            }

            // En SDK v1, contents() devuelve &[Object] directamente
            for o in output.contents() {
                let key = o.key().unwrap_or("").to_string();
                if let Some(ref p) = prefix {
                    if &key == p { continue; }
                }
                
                results.push(S3Object {
                    key,
                    size: o.size().unwrap_or(0),
                    last_modified: o.last_modified().map(|d| d.secs()),
                    storage_class: o.storage_class().map(|s| s.as_str().to_string()).unwrap_or_default(),
                    is_folder: false,
                });
            }

            Ok(results)
        }
        Err(e) => Err(format!("S3 Error: {:?}", e)),
    }
}

#[tauri::command]
pub async fn s3_download_object(
    credentials: CwCredentials,
    bucket: String,
    key: String,
    local_path: String,
) -> Result<(), String> {
    let client = s3_client(&credentials).await;
    match client.get_object().bucket(bucket).key(key).send().await {
        Ok(output) => {
            use tokio::io::AsyncWriteExt;
            let mut file = tokio::fs::File::create(local_path).await
                .map_err(|e| format!("File Error: {}", e))?;
            
            let data = output.body.collect().await
                .map_err(|e| format!("Download Error: {}", e))?;
            
            file.write_all(&data.into_bytes()).await
                .map_err(|e| format!("Write Error: {}", e))?;
            
            Ok(())
        }
        Err(e) => Err(format!("AWS Error: {:?}", e)),
    }
}
