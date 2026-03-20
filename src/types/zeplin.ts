export interface ZeplinAccount {
    id: string;
    name: string;
    token: string;
}

export interface ZeplinProject {
    id: string;
    name: string;
    type: 'project' | 'styleguide';
    platform: string;
    thumbnail?: string;
}

export interface ZeplinScreen {
    id: string;
    name: string;
    image: {
        original_url: string;
        thumbnails: {
            small: string;
            medium: string;
            large: string;
        };
    };
    section_id?: string;
    updated_at: number;
}

export interface ZeplinConnector {
    id: string;
    source: { id: string; type: 'screen' | 'component' | 'node' };
    target: { id: string; type: 'screen' | 'component' | 'node' };
    label?: string;
}

export interface ZeplinFlowNode {
    id: string;
    screen_id?: string;
    position: { x: number; y: number };
}

export interface ZeplinFlow {
    id: string;
    name: string;
    screens: string[]; 
    nodes?: ZeplinFlowNode[];
    connectors?: ZeplinConnector[];
}

export interface ZeplinSection {
    id: string;
    name: string;
    parent_id?: string;
}

export interface ZeplinLog {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
    responseStatus?: number;
    responseBody?: any;
    duration?: number;
    curl: string;
}

export interface ZeplinState {
    accounts: ZeplinAccount[];
    activeAccountId: string | null;
    projects: ZeplinProject[];
    currentProject: ZeplinProject | null;
    screens: ZeplinScreen[];
    flows: ZeplinFlow[];
    sections: ZeplinSection[];
    selectedScreenId: string | null;
    selectedFlowId: string | null;
    logs: ZeplinLog[];
    isLoading: boolean;
}
