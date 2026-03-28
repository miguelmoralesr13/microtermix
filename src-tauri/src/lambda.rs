use serde::{Deserialize, Serialize};
use crate::ec2::Ec2Credentials;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LambdaFunction {
    pub function_name: String,
    pub function_arn: String,
    pub runtime: Option<String>,
    pub role: String,
    pub handler: Option<String>,
    pub code_size: i64,
    pub description: Option<String>,
    pub timeout: Option<i32>,
    pub memory_size: Option<i32>,
    pub last_modified: String,
    pub state: Option<String>,
    pub version: String,
    pub environment: Vec<(String, String)>,
}

async fn lambda_client(c: &Ec2Credentials) -> aws_sdk_lambda::Client {
    let config = crate::ec2::aws_config(c).await;
    aws_sdk_lambda::Client::new(&config)
}

async fn search_lambdas_via_explorer(
    c: &Ec2Credentials,
    search_term: &str,
) -> Result<Vec<LambdaFunction>, String> {
    let config = crate::ec2::aws_config(c).await;
    let client = aws_sdk_resourceexplorer2::Client::new(&config);
    
    // Pattern: mi-func* or automatically add wildcards if none present
    let query = if search_term.contains('*') {
        format!("service:lambda name:{}", search_term)
    } else {
        format!("service:lambda name:*{}*", search_term)
    };
    
    let resp = client.search()
        .query_string(query)
        .max_results(100)
        .send()
        .await
        .map_err(|e| format!("ResourceExplorer no disponible o error: {}", e))?;

    let functions = if let Some(resources) = resp.resources {
        resources.iter().map(|r| {
            let arn = r.arn().unwrap_or_default();
            let name = arn.split(':').last().unwrap_or(arn).to_string();
            
            LambdaFunction {
                function_name: name,
                function_arn: arn.to_string(),
                runtime: None,
                role: "".to_string(),
                handler: None,
                code_size: 0,
                description: None,
                timeout: None,
                memory_size: None,
                last_modified: "".to_string(),
                state: None,
                version: "".to_string(),
                environment: vec![],
            }
        }).collect()
    } else {
        vec![]
    };

    Ok(functions)
}

#[tauri::command]
pub async fn lambda_list_functions(
    credentials: Ec2Credentials,
    search_term: Option<String>,
) -> Result<Vec<LambdaFunction>, String> {
    // Fast path: Try Resource Explorer if searching
    if let Some(st) = &search_term {
        if !st.is_empty() {
            if let Ok(explorer_results) = search_lambdas_via_explorer(&credentials, st).await {
                if !explorer_results.is_empty() {
                    return Ok(explorer_results);
                }
            }
        }
    }

    // Fallback path: Standard paginated list (Optimized without heavy fields) 
    let client = lambda_client(&credentials).await;
    
    let mut functions = Vec::new();
    let max_to_fetch = if search_term.is_some() { 500 } else { 50 };
    let st_lower = search_term.as_ref().map(|s| s.to_lowercase());

    let mut pager = client.list_functions()
        .max_items(50)
        .into_paginator()
        .items()
        .send();

    while let Some(item) = pager.next().await {
        let f = item.map_err(|e| {
            let msg = format!("Lambda: Error paginando funciones: {}", e);
            crate::app_logs::log_error("Lambda", &msg);
            msg
        })?;

        let name = f.function_name().unwrap_or_default();
        
        // Filter by search term if provided
        if let Some(st) = &st_lower {
            if !name.to_lowercase().contains(st) {
                continue;
            }
        }

        functions.push(LambdaFunction {
            function_name: name.to_string(),
            function_arn: f.function_arn().unwrap_or_default().to_string(),
            runtime: f.runtime().map(|r| r.as_str().to_string()),
            role: f.role().unwrap_or_default().to_string(),
            handler: f.handler().map(|h| h.to_string()),
            code_size: f.code_size(),
            description: f.description().map(|d| d.to_string()),
            timeout: f.timeout(),
            memory_size: f.memory_size(),
            last_modified: f.last_modified().unwrap_or_default().to_string(),
            state: f.state().map(|s| s.as_str().to_string()),
            version: f.version().unwrap_or_default().to_string(),
            environment: vec![], // Exclude for performance, fetched via GetFunction
        });

        if functions.len() >= max_to_fetch {
            break;
        }
    }

    Ok(functions)
}

#[tauri::command]
pub async fn lambda_get_function(
    credentials: Ec2Credentials,
    function_name: String,
) -> Result<LambdaFunction, String> {
    let client = lambda_client(&credentials).await;
    
    let resp = client.get_function().function_name(&function_name).send().await.map_err(|e| {
        let msg = format!("Lambda: Error obteniendo función {}: {}", function_name, e);
        crate::app_logs::log_error("Lambda", &msg);
        msg
    })?;

    let f = resp.configuration().ok_or_else(|| "No se encontró la configuración de la función".to_string())?;
    
    let env_vars = f.environment().and_then(|e| e.variables()).map(|vars| {
        vars.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }).unwrap_or_default();

    Ok(LambdaFunction {
        function_name: f.function_name().unwrap_or_default().to_string(),
        function_arn: f.function_arn().unwrap_or_default().to_string(),
        runtime: f.runtime().map(|r| r.as_str().to_string()),
        role: f.role().unwrap_or_default().to_string(),
        handler: f.handler().map(|h| h.to_string()),
        code_size: f.code_size(),
        description: f.description().map(|d| d.to_string()),
        timeout: f.timeout(),
        memory_size: f.memory_size(),
        last_modified: f.last_modified().unwrap_or_default().to_string(),
        state: f.state().map(|s| s.as_str().to_string()),
        version: f.version().unwrap_or_default().to_string(),
        environment: env_vars,
    })
}
