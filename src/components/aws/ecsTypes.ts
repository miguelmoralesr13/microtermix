export interface EcsCluster {
    cluster_arn: String;
    cluster_name: String;
    status: String;
    running_tasks_count: number;
    active_services_count: number;
}

export interface EcsService {
    service_arn: string;
    service_name: string;
    status: string;
    desired_count: number;
    running_count: number;
    pending_count: number;
    launch_type: string;
    cpu?: string;
    memory?: string;
    cluster_arn: string;
    task_definition_arn: string;
}

export interface EcsContainer {
    name: string;
    image: string;
    last_status: string;
    exit_code?: number;
    reason?: string;
}

export interface EcsTask {
    task_arn: string;
    cluster_arn: string;
    service_name?: string;
    last_status: string;
    desired_status: string;
    cpu: string;
    memory: string;
    containers: EcsContainer[];
    health_status: string;
    launch_type: string;
    created_at?: number;
    task_definition_arn: string;
}

export interface EcsContainerDefinition {
    name: string;
    image: string;
    log_group?: string;
    log_region?: string;
    log_stream_prefix?: string;
    environment: [string, string][];
    secrets: [string, string][];
}

export interface EcsTaskDefinition {
    task_definition_arn: string;
    container_definitions: EcsContainerDefinition[];
}
