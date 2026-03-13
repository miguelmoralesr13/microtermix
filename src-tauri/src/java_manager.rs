use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager};
use std::io::Cursor;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JdkInfo {
    pub name: String,
    pub path: String,
    pub version: String,
}

fn get_jdks_dir(app: &AppHandle) -> PathBuf {
    let mut path = app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push(".microtermix");
    path.push("tools");
    path.push("jdks");
    let _ = fs::create_dir_all(&path);
    path
}

#[tauri::command]
pub fn list_local_jdks(app: AppHandle) -> Result<Vec<JdkInfo>, String> {
    let jdks_dir = get_jdks_dir(&app);
    let mut jdks = Vec::new();

    if let Ok(entries) = fs::read_dir(jdks_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                // Basic detection: look for release file or bin/java
                let release_file = path.join("release");
                let mut version = "unknown".to_string();
                
                if let Ok(content) = fs::read_to_string(release_file) {
                    for line in content.lines() {
                        if line.starts_with("JAVA_VERSION=") {
                            version = line.replace("JAVA_VERSION=", "").replace("\"", "");
                            break;
                        }
                    }
                }

                jdks.push(JdkInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    version,
                });
            }
        }
    }

    Ok(jdks)
}

#[tauri::command]
pub async fn download_jdk(_app: AppHandle, version: u32) -> Result<String, String> {
    let os = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "mac" } else { "linux" };
    let arch = if cfg!(target_arch = "x86_64") { "x64" } else { "aarch64" };
    
    // Adoptium API URL for OpenJDK
    // Note: 'eclipse' is the vendor name used in the API for Temurin binaries
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse?project=jdk",
        version, os, arch
    );

    println!("Downloading JDK from: {}", url);

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e: reqwest::Error| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e: reqwest::Error| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download JDK: status {} for URL {}", response.status(), url));
    }

    let bytes = response.bytes().await.map_err(|e: reqwest::Error| e.to_string())?;
    let jdks_dir = get_jdks_dir(&_app);
    let target_name = format!("jdk-{}", version);
    let target_path = jdks_dir.join(&target_name);

    if target_path.exists() {
        let _ = fs::remove_dir_all(&target_path);
    }
    fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;

    // Extraction logic based on OS (tar.gz for unix, zip for windows)
    if os == "windows" {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e: zip::result::ZipError| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e: zip::result::ZipError| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => {
                    // Usually zip contains a root folder like "jdk-17.0.8+7", we want to strip it
                    let components: Vec<std::path::Component> = path.components().collect();
                    if components.len() > 1 {
                        let sub_path: PathBuf = components.iter().skip(1).collect();
                        target_path.join(sub_path)
                    } else {
                        continue;
                    }
                },
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
    } else {
        use flate2::read::GzDecoder;
        use tar::Archive;

        let tar = GzDecoder::new(Cursor::new(bytes));
        let mut archive = Archive::new(tar);
        
        for entry in archive.entries().map_err(|e: std::io::Error| e.to_string())? {
            let mut entry = entry.map_err(|e: std::io::Error| e.to_string())?;
            let path = entry.path().map_err(|e: std::io::Error| e.to_string())?.to_path_buf();
            
            // Strip the root directory from the tarball
            let components: Vec<std::path::Component> = path.components().collect();
            if components.len() > 1 {
                let sub_path: PathBuf = components.iter().skip(1).collect();
                let full_out_path = target_path.join(sub_path);
                entry.unpack(full_out_path).map_err(|e: std::io::Error| e.to_string())?;
            }
        }
    }

    Ok(target_path.to_string_lossy().to_string())
}
