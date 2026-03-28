use serde::{Deserialize, Serialize};
use crate::ec2::Ec2Credentials;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EcsCluster {
    pub cluster_arn: String,
    pub cluster_name: String,
    pub status: String,
    pub running_tasks_count: i32,
    pub active_services_count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EcsService {
    pub service_arn: String,
    pub service_name: String,
    pub status: String,
    pub desired_count: i32,
    pub running_count: i32,
    pub pending_count: i32,
    pub launch_type: String, // FARGATE | EC2 | EXTERNAL
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub cluster_arn: String,
    pub task_definition_arn: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EcsTask {
    pub task_arn: String,
    pub cluster_arn: String,
    pub service_name: Option<String>,
    pub last_status: String,
    pub desired_status: String,
    pub cpu: String,
    pub memory: String,
    pub containers: Vec<EcsContainer>,
    pub health_status: String,
    pub launch_type: String,
    pub created_at: Option<i64>,
    pub task_definition_arn: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EcsContainer {
    pub name: String,
    pub image: String,
    pub last_status: String,
    pub exit_code: Option<i32>,
    pub reason: Option<String>,
}

async fn ecs_client(c: &Ec2Credentials) -> aws_sdk_ecs::Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id,
        &c.secret_access_key,
        token,
        None,
        "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .load()
        .await;
    aws_sdk_ecs::Client::new(&cfg)
}

#[tauri::command]
pub async fn ecs_list_clusters(
    credentials: Ec2Credentials,
) -> Result<Vec<EcsCluster>, String> {
    let client = ecs_client(&credentials).await;
    
    let list_resp = client.list_clusters().send().await.map_err(|e| {
        let msg = format!("ECS: Error enumerando clusters: {}", e);
        crate::app_logs::log_error("ECS", &msg);
        msg
    })?;
    let arns = list_resp.cluster_arns();
    
    if arns.is_empty() {
        return Ok(vec![]);
    }

    let desc_resp = client.describe_clusters()
        .set_clusters(Some(arns.to_vec()))
        .send()
        .await
        .map_err(|e| {
            let msg = format!("ECS: Error describiendo clusters: {}", e);
            crate::app_logs::log_error("ECS", &msg);
            msg
        })?;

    let clusters = desc_resp.clusters().iter().map(|c| EcsCluster {
        cluster_arn: c.cluster_arn().unwrap_or_default().to_string(),
        cluster_name: c.cluster_name().unwrap_or_default().to_string(),
        status: c.status().unwrap_or_default().to_string(),
        running_tasks_count: c.running_tasks_count(),
        active_services_count: c.active_services_count(),
    }).collect();

    Ok(clusters)
}

#[tauri::command]
pub async fn ecs_list_services(
    credentials: Ec2Credentials,
    cluster_arn: String,
) -> Result<Vec<EcsService>, String> {
    let client = ecs_client(&credentials).await;
    
    let mut service_arns = Vec::new();
    let mut pager = client.list_services().cluster(&cluster_arn).into_paginator().send();
    
    while let Some(page) = pager.next().await {
        let page = page.map_err(|e| {
            let msg = format!("ECS: Error enumerando servicios en {}: {}", cluster_arn, e);
            crate::app_logs::log_error("ECS", &msg);
            msg
        })?;
        service_arns.extend(page.service_arns().to_vec());
    }

    if service_arns.is_empty() {
        return Ok(vec![]);
    }

    let mut services = Vec::new();
    // describe_services has a limit of 10 per call
    for chunk in service_arns.chunks(10) {
        let resp = client.describe_services()
            .cluster(&cluster_arn)
            .set_services(Some(chunk.to_vec()))
            .send()
            .await
            .map_err(|e| {
                let msg = format!("ECS: Error describiendo servicios en {}: {}", cluster_arn, e);
                crate::app_logs::log_error("ECS", &msg);
                msg
            })?;
            
        for s in resp.services() {
            services.push(EcsService {
                service_arn: s.service_arn().unwrap_or_default().to_string(),
                service_name: s.service_name().unwrap_or_default().to_string(),
                status: s.status().unwrap_or_default().to_string(),
                desired_count: s.desired_count(),
                running_count: s.running_count(),
                pending_count: s.pending_count(),
                launch_type: s.launch_type().map(|l| l.as_str().to_string()).unwrap_or_default(),
                cpu: None,
                memory: None,
                cluster_arn: cluster_arn.clone(),
                task_definition_arn: s.task_definition().unwrap_or_default().to_string(),
            });
        }
    }

    Ok(services)
}

#[tauri::command]
pub async fn ecs_list_tasks(
    credentials: Ec2Credentials,
    cluster_arn: String,
    service_name: Option<String>,
) -> Result<Vec<EcsTask>, String> {
    let client = ecs_client(&credentials).await;
    
    let mut req = client.list_tasks().cluster(&cluster_arn);
    if let Some(sn) = service_name {
        req = req.service_name(sn);
    }
    
    let list_resp = req.send().await.map_err(|e| {
        let msg = format!("ECS: Error enumerando tareas en {}: {}", cluster_arn, e);
        crate::app_logs::log_error("ECS", &msg);
        msg
    })?;
    let arns = list_resp.task_arns();
    
    if arns.is_empty() {
        return Ok(vec![]);
    }

    let desc_resp = client.describe_tasks()
        .cluster(&cluster_arn)
        .set_tasks(Some(arns.to_vec()))
        .send()
        .await
        .map_err(|e| {
            let msg = format!("ECS: Error describiendo tareas en {}: {}", cluster_arn, e);
            crate::app_logs::log_error("ECS", &msg);
            msg
        })?;

    let tasks = desc_resp.tasks().iter().map(|t| EcsTask {
        task_arn: t.task_arn().unwrap_or_default().to_string(),
        cluster_arn: cluster_arn.clone(),
        service_name: t.group().map(|g| g.replace("service:", "")),
        last_status: t.last_status().unwrap_or_default().to_string(),
        desired_status: t.desired_status().unwrap_or_default().to_string(),
        cpu: t.cpu().unwrap_or_default().to_string(),
        memory: t.memory().unwrap_or_default().to_string(),
        health_status: t.health_status().map(|h| h.as_str().to_string()).unwrap_or_else(|| "UNKNOWN".to_string()),
        launch_type: t.launch_type().map(|l| l.as_str().to_string()).unwrap_or_default(),
        created_at: t.created_at().map(|d| d.secs()),
        task_definition_arn: t.task_definition_arn().unwrap_or_default().to_string(),
        containers: t.containers().iter().map(|c| EcsContainer {
            name: c.name().unwrap_or_default().to_string(),
            image: c.image().unwrap_or_default().to_string(),
            last_status: c.last_status().unwrap_or_default().to_string(),
            exit_code: c.exit_code(),
            reason: c.reason().map(|r| r.to_string()),
        }).collect(),
    }).collect();

    Ok(tasks)
}

#[derive(Debug, Serialize, Clone)]
pub struct EcsTaskDefinition {
    pub task_definition_arn: String,
    pub container_definitions: Vec<EcsContainerDefinition>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EcsContainerDefinition {
    pub name: String,
    pub image: String,
    pub log_group: Option<String>,
    pub log_region: Option<String>,
    pub log_stream_prefix: Option<String>,
    pub environment: Vec<(String, String)>,
    pub secrets: Vec<(String, String)>,
}

#[tauri::command]
pub async fn ecs_get_task_definition(
    credentials: Ec2Credentials,
    task_definition_arn: String,
) -> Result<EcsTaskDefinition, String> {
    let client = ecs_client(&credentials).await;
    
    let resp = client.describe_task_definition()
        .task_definition(&task_definition_arn)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("ECS: Error describiendo task definition {}: {}", task_definition_arn, e);
            crate::app_logs::log_error("ECS", &msg);
            msg
        })?;

    let td = resp.task_definition().ok_or("No task definition found")?;
    
    let container_definitions = td.container_definitions().iter().map(|c| {
        let log_conf = c.log_configuration();
        let options = log_conf.and_then(|lc| lc.options());
        
        let environment = c.environment().iter().map(|e| {
            (e.name().unwrap_or("").to_string(), e.value().unwrap_or("").to_string())
        }).collect();

        let secrets = c.secrets().iter().map(|s| {
            (s.name().to_string(), s.value_from().to_string())
        }).collect();

        EcsContainerDefinition {
            name: c.name().unwrap_or_default().to_string(),
            image: c.image().unwrap_or_default().to_string(),
            log_group: options.and_then(|o| o.get("awslogs-group").cloned()),
            log_region: options.and_then(|o| o.get("awslogs-region").cloned()),
            log_stream_prefix: options.and_then(|o| o.get("awslogs-stream-prefix").cloned()),
            environment,
            secrets,
        }
    }).collect();

    Ok(EcsTaskDefinition {
        task_definition_arn: td.task_definition_arn().unwrap_or_default().to_string(),
        container_definitions,
    })
}

#[tauri::command]
pub async fn ecs_resolve_secret(
    credentials: Ec2Credentials,
    value_from: String,
) -> Result<String, String> {
    if value_from.starts_with("arn:aws:secretsmanager:") {
        let config = crate::ec2::aws_config(&credentials).await;
        let client = aws_sdk_secretsmanager::Client::new(&config);
        
        let resp = client.get_secret_value()
            .secret_id(&value_from)
            .send()
            .await
            .map_err(|e| {
                let msg = format!("SecretsManager: Error resolviendo {}: {}", value_from, e);
                crate::app_logs::log_error("SecretsManager", &msg);
                msg
            })?;
            
        Ok(resp.secret_string().unwrap_or("").to_string())
    } else {
        // Assume SSM Parameter Store
        let config = crate::ec2::aws_config(&credentials).await;
        let client = aws_sdk_ssm::Client::new(&config);
        
        let resp = client.get_parameter()
            .name(&value_from)
            .with_decryption(true)
            .send()
            .await
            .map_err(|e| {
                let msg = format!("SSM: Error resolviendo parámetro {}: {}", value_from, e);
                crate::app_logs::log_error("SSM", &msg);
                msg
            })?;
            
        Ok(resp.parameter().and_then(|p| p.value()).unwrap_or("").to_string())
    }
}
