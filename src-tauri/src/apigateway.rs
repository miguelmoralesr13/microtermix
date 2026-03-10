use aws_sdk_apigateway::Client as ApiGatewayClient;
use aws_sdk_apigatewayv2::Client as ApiGatewayV2Client;
use serde::{Deserialize, Serialize};
use crate::cloudwatch::CwCredentials;

// ==========================================
// CLIENT BUILDERS
// ==========================================

async fn apigateway_client(c: &CwCredentials) -> ApiGatewayClient {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        token, None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .behavior_version(aws_config::BehaviorVersion::latest())
        .load().await;
    ApiGatewayClient::new(&cfg)
}

async fn apigateway_v2_client(c: &CwCredentials) -> ApiGatewayV2Client {
    use aws_config::Region;
    use aws_credential_types::Credentials;
    let token = c.session_token.as_deref().filter(|s| !s.trim().is_empty()).map(String::from);
    let creds = Credentials::new(
        &c.access_key_id, &c.secret_access_key,
        token, None, "microtermix",
    );
    let cfg = aws_config::from_env()
        .credentials_provider(creds)
        .region(Region::new(c.region.clone()))
        .behavior_version(aws_config::BehaviorVersion::latest())
        .load().await;
    ApiGatewayV2Client::new(&cfg)
}

// ==========================================
// V1 (REST APIs)
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RestApiInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_date: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RestApiResource {
    pub id: String,
    pub parent_id: Option<String>,
    pub path: String,
    pub methods: Vec<String>,
}

#[tauri::command]
pub async fn apigw_get_rest_apis(credentials: CwCredentials) -> Result<Vec<RestApiInfo>, String> {
    let client = apigateway_client(&credentials).await;

    let mut apis = Vec::new();
    let mut position = None;

    loop {
        let mut req = client.get_rest_apis().limit(500);
        if let Some(pos) = position {
            req = req.position(pos);
        }

        match req.send().await {
            Ok(resp) => {
                for item in resp.items() {
                    apis.push(RestApiInfo {
                        id: item.id().unwrap_or_default().to_string(),
                        name: item.name().unwrap_or_default().to_string(),
                        description: item.description().map(|s| s.to_string()),
                        created_date: item.created_date().map(|d| d.secs()),
                    });
                }

                if let Some(pos) = resp.position() {
                    position = Some(pos.to_string());
                } else {
                    break;
                }
            }
            Err(err) => {
                return Err(format!("Failed to list REST APIs: {:?}", err));
            }
        }
    }

    Ok(apis)
}

#[tauri::command]
pub async fn apigw_get_rest_api_resources(credentials: CwCredentials, rest_api_id: String) -> Result<Vec<RestApiResource>, String> {
    let client = apigateway_client(&credentials).await;

    let mut resources = Vec::new();
    let mut position = None;

    loop {
        let mut req = client.get_resources().rest_api_id(&rest_api_id).limit(500);
        if let Some(pos) = position {
            req = req.position(pos);
        }

        match req.send().await {
            Ok(resp) => {
                for item in resp.items() {
                    let mut methods = Vec::new();
                    if let Some(methods_map) = item.resource_methods() {
                        for k in methods_map.keys() {
                            methods.push(k.to_string());
                        }
                    }
                    resources.push(RestApiResource {
                        id: item.id().unwrap_or_default().to_string(),
                        parent_id: item.parent_id().map(|s| s.to_string()),
                        path: item.path().unwrap_or_default().to_string(),
                        methods,
                    });
                }

                if let Some(pos) = resp.position() {
                    position = Some(pos.to_string());
                } else {
                    break;
                }
            }
            Err(err) => {
                return Err(format!("Failed to list REST API resources: {:?}", err));
            }
        }
    }

    Ok(resources)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RestMethodDetails {
    pub http_method: String,
    pub authorization_type: Option<String>,
    pub api_key_required: bool,
    pub request_parameters: std::collections::HashMap<String, bool>,
    pub request_models: std::collections::HashMap<String, String>,
    
    // Integration details
    pub integration_type: Option<String>,
    pub integration_http_method: Option<String>,
    pub integration_uri: Option<String>,
    pub integration_timeout: Option<i32>,

    // Responses
    pub method_responses: Vec<String>, // Just HTTP status codes
}

#[tauri::command]
pub async fn apigw_get_rest_method_details(
    credentials: CwCredentials,
    rest_api_id: String,
    resource_id: String,
    http_method: String,
) -> Result<RestMethodDetails, String> {
    let client = apigateway_client(&credentials).await;

    // Fetch the method details + integration details
    let resp = client
        .get_method()
        .rest_api_id(&rest_api_id)
        .resource_id(&resource_id)
        .http_method(&http_method)
        .send()
        .await
        .map_err(|e| format!("Failed to get method details: {:?}", e))?;

    let mut request_parameters = std::collections::HashMap::new();
    if let Some(params) = resp.request_parameters() {
        for (k, v) in params {
            request_parameters.insert(k.clone(), *v);
        }
    }

    let mut request_models = std::collections::HashMap::new();
    if let Some(models) = resp.request_models() {
        for (k, v) in models {
            request_models.insert(k.clone(), v.clone());
        }
    }

    let mut method_responses = Vec::new();
    if let Some(responses) = resp.method_responses() {
        for (status, _) in responses {
            method_responses.push(status.clone());
        }
    }

    let integration = resp.method_integration();
    
    let inet_type = integration.and_then(|i| i.r#type().map(|t| t.as_str().to_string()));
    let inet_http_method = integration.and_then(|i| i.http_method().map(|s| s.to_string()));
    let inet_uri = integration.and_then(|i| i.uri().map(|s| s.to_string()));
    let inet_timeout = integration.and_then(|i| Some(i.timeout_in_millis()));

    Ok(RestMethodDetails {
        http_method: resp.http_method().unwrap_or(&http_method).to_string(),
        authorization_type: resp.authorization_type().map(|s| s.to_string()),
        api_key_required: resp.api_key_required().unwrap_or(false),
        request_parameters,
        request_models,
        integration_type: inet_type,
        integration_http_method: inet_http_method,
        integration_uri: inet_uri,
        integration_timeout: inet_timeout,
        method_responses,
    })
}

// ==========================================
// V2 (HTTP / WebSocket APIs)
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HttpApiInfo {
    pub api_id: String,
    pub name: String,
    pub protocol_type: String, // HTTP or WEBSOCKET
    pub description: Option<String>,
    pub created_date: Option<i64>,
    pub api_endpoint: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HttpApiRoute {
    pub route_id: String,
    pub route_key: String,
    pub target: Option<String>,
}

#[tauri::command]
pub async fn apigw_get_http_apis(credentials: CwCredentials) -> Result<Vec<HttpApiInfo>, String> {
    let client = apigateway_v2_client(&credentials).await;

    let mut apis = Vec::new();
    let mut next_token = None;

    loop {
        let mut req = client.get_apis().max_results("100".to_string());
        if let Some(token) = next_token {
            req = req.next_token(token);
        }

        match req.send().await {
            Ok(resp) => {
                for item in resp.items() {
                    apis.push(HttpApiInfo {
                        api_id: item.api_id().unwrap_or_default().to_string(),
                        name: item.name().unwrap_or_default().to_string(),
                        protocol_type: item.protocol_type().map(|p| p.as_str().to_string()).unwrap_or_else(|| "UNKNOWN".to_string()),
                        description: item.description().map(|s| s.to_string()),
                        created_date: item.created_date().map(|d| d.secs()),
                        api_endpoint: item.api_endpoint().map(|s| s.to_string()),
                    });
                }

                if let Some(token) = resp.next_token() {
                    next_token = Some(token.to_string());
                } else {
                    break;
                }
            }
            Err(err) => {
                return Err(format!("Failed to list HTTP APIs: {:?}", err));
            }
        }
    }

    Ok(apis)
}

#[tauri::command]
pub async fn apigw_get_http_api_routes(credentials: CwCredentials, api_id: String) -> Result<Vec<HttpApiRoute>, String> {
    let client = apigateway_v2_client(&credentials).await;

    let mut routes = Vec::new();
    let mut next_token = None;

    loop {
        let mut req = client.get_routes().api_id(&api_id).max_results("500".to_string());
        if let Some(token) = next_token {
            req = req.next_token(token);
        }

        match req.send().await {
            Ok(resp) => {
                for item in resp.items() {
                    routes.push(HttpApiRoute {
                        route_id: item.route_id().unwrap_or_default().to_string(),
                        route_key: item.route_key().unwrap_or_default().to_string(),
                        target: item.target().map(|s| s.to_string()),
                    });
                }

                if let Some(token) = resp.next_token() {
                    next_token = Some(token.to_string());
                } else {
                    break;
                }
            }
            Err(err) => {
                return Err(format!("Failed to list HTTP API routes: {:?}", err));
            }
        }
    }

    Ok(routes)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HttpRouteIntegrationDetails {
    pub integration_id: Option<String>,
    pub integration_type: Option<String>,
    pub integration_uri: Option<String>,
    pub integration_method: Option<String>,
    pub connection_type: Option<String>,
    pub payload_format_version: Option<String>,
    pub timeout_in_millis: Option<i32>,
}

#[tauri::command]
pub async fn apigw_get_http_route_integration(
    credentials: CwCredentials,
    api_id: String,
    route_id: String,
) -> Result<HttpRouteIntegrationDetails, String> {
    let client = apigateway_v2_client(&credentials).await;

    // 1. Get the route to find its target (which contains the integration ID)
    let route_resp = client
        .get_route()
        .api_id(&api_id)
        .route_id(&route_id)
        .send()
        .await
        .map_err(|e| format!("Failed to get route details: {:?}", e))?;

    let target = route_resp.target();
    
    // The target usually looks like "integrations/123xyz"
    let integration_id = if let Some(t) = target {
        if t.starts_with("integrations/") {
            Some(t.replace("integrations/", ""))
        } else {
            return Ok(HttpRouteIntegrationDetails {
                integration_id: None,
                integration_type: None,
                integration_uri: None,
                integration_method: None,
                connection_type: None,
                payload_format_version: None,
                timeout_in_millis: None,
            });
        }
    } else {
        return Ok(HttpRouteIntegrationDetails {
            integration_id: None,
            integration_type: None,
            integration_uri: None,
            integration_method: None,
            connection_type: None,
            payload_format_version: None,
            timeout_in_millis: None,
        });
    };

    let int_id = integration_id.unwrap();

    // 2. Fetch the integration details
    let int_resp = client
        .get_integration()
        .api_id(&api_id)
        .integration_id(&int_id)
        .send()
        .await
        .map_err(|e| format!("Failed to get integration details: {:?}", e))?;

    Ok(HttpRouteIntegrationDetails {
        integration_id: Some(int_id),
        integration_type: int_resp.integration_type().map(|t| t.as_str().to_string()),
        integration_uri: int_resp.integration_uri().map(|s| s.to_string()),
        integration_method: int_resp.integration_method().map(|s| s.to_string()),
        connection_type: int_resp.connection_type().map(|t| t.as_str().to_string()),
        payload_format_version: int_resp.payload_format_version().map(|s| s.to_string()),
        timeout_in_millis: int_resp.timeout_in_millis(),
    })
}

#[tauri::command]
pub async fn apigw_export_api_swagger_rest(credentials: CwCredentials, rest_api_id: String, mut stage_name: String) -> Result<String, String> {
    let client = apigateway_client(&credentials).await;

    // To prevent "Invalid stage identifier", we fetch stages first if we can.
    if let Ok(stages_req) = client.get_stages().rest_api_id(&rest_api_id).send().await {
        let stages: &[aws_sdk_apigateway::types::Stage] = stages_req.item();
        let existing_stages: Vec<&str> = stages.iter().filter_map(|s: &aws_sdk_apigateway::types::Stage| s.stage_name()).collect();
        if !existing_stages.contains(&stage_name.as_str()) && !existing_stages.is_empty() {
            // The requested stage doesn't exist, pick the first one available
            stage_name = existing_stages[0].to_string();
        }
    }

    let req = client.get_export()
        .rest_api_id(&rest_api_id)
        .stage_name(&stage_name)
        .export_type("swagger")
        .accepts("application/json");

    match req.send().await {
        Ok(output) => {
            if let Some(body) = output.body() {
                let bytes = body.clone().into_inner();
                match String::from_utf8(bytes.to_vec()) {
                    Ok(s) => Ok(s),
                    Err(e) => Err(format!("Failed to parse JSON body: {}", e))
                }
            } else {
                Err("Export returned no body data.".to_string())
            }
        }
        Err(err) => {
            let err_msg = format!("Failed to export swagger definition for stage '{}': {:#?}", stage_name, err);
            println!("{}", err_msg);
            Err(err_msg)
        }
    }
}

#[tauri::command]
pub async fn apigw_export_api_swagger_http(credentials: CwCredentials, api_id: String, mut stage_name: String) -> Result<String, String> {
    let client = apigateway_v2_client(&credentials).await;

    // Fetch v2 stages
    if let Ok(stages_req) = client.get_stages().api_id(&api_id).send().await {
        let stages: &[aws_sdk_apigatewayv2::types::Stage] = stages_req.items();
        let existing_stages: Vec<&str> = stages.iter().filter_map(|s: &aws_sdk_apigatewayv2::types::Stage| s.stage_name()).collect();
        if !existing_stages.contains(&stage_name.as_str()) && !existing_stages.is_empty() {
            // The requested stage doesn't exist, pick the first one available
            stage_name = existing_stages[0].to_string();
        }
    }

    let req = client.export_api()
        .api_id(&api_id)
        .stage_name(&stage_name)
        .specification("OAS30")
        .output_type("JSON");

    match req.send().await {
        Ok(output) => {
            if let Some(body) = output.body() {
                let bytes = body.clone().into_inner();
                match String::from_utf8(bytes.to_vec()) {
                    Ok(s) => Ok(s),
                    Err(e) => Err(format!("Failed to parse JSON body: {}", e))
                }
            } else {
                Err("Export returned no body data.".to_string())
            }
        }
        Err(err) => {
            let err_msg = format!("Failed to export OpenAPI definition for stage '{}': {:#?}", stage_name, err);
            println!("{}", err_msg);
            Err(err_msg)
        }
    }
}
