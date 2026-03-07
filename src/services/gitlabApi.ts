import { invoke } from '@tauri-apps/api/core';

export interface GitlabProject {
    id: number;
    name: string;
    path_with_namespace: string;
    description: string | null;
    web_url: string;
    http_url_to_repo: string;
    ssh_url_to_repo: string;
    visibility: 'public' | 'internal' | 'private';
    star_count: number;
    last_activity_at: string;
    namespace: { name: string; path: string };
}

export async function fetchUserGitlabProjects(apiUrl: string, token: string): Promise<GitlabProject[]> {
    const base = apiUrl || 'https://gitlab.com';
    const response = await fetch(`${base}/api/v4/projects?membership=true&order_by=last_activity_at&per_page=50`, {
        headers: { 'PRIVATE-TOKEN': token },
    });
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

export async function searchGitlabProjects(apiUrl: string, token: string, query: string): Promise<GitlabProject[]> {
    const base = apiUrl || 'https://gitlab.com';
    const response = await fetch(`${base}/api/v4/projects?membership=true&search=${encodeURIComponent(query)}&per_page=30`, {
        headers: { 'PRIVATE-TOKEN': token },
    });
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

export interface GitlabMR {
    id: number;
    iid: number;
    title: string;
    state: 'opened' | 'closed' | 'merged' | 'locked';
    web_url: string;
    author: { name: string; username: string; avatar_url: string };
    created_at: string;
    updated_at: string;
    description: string | null;
    draft: boolean;
    source_branch: string;
    target_branch: string;
    labels: string[];
    reviewers: { name: string; username: string }[];
    merge_status: string;
    head_pipeline?: { status: string };
}

const gitlabPathCache = new Map<string, string>();

async function getGitlabProjectPath(projectPath: string): Promise<string | null> {
    if (gitlabPathCache.has(projectPath)) return gitlabPathCache.get(projectPath)!;
    try {
        const result: any = await invoke('git_execute', {
            projectPath,
            args: ['remote', 'get-url', 'origin'],
        });
        if (!result.success) return null;
        const url = result.stdout.trim();
        // Matches git@gitlab.com:group/repo.git or https://gitlab.com/group/repo.git
        const match = url.match(/gitlab[^/]*[:/](.+?)(\.git)?$/i);
        if (!match) return null;
        const path = match[1];
        gitlabPathCache.set(projectPath, path);
        return path;
    } catch {
        return null;
    }
}

export async function fetchGitlabMRs(
    projectPath: string,
    token: string,
    apiUrl?: string,
    state: 'opened' | 'closed' | 'merged' | 'all' = 'opened'
): Promise<GitlabMR[]> {
    const glPath = await getGitlabProjectPath(projectPath);
    if (!glPath) throw new Error("Could not determine GitLab project from 'origin' remote.");
    const base = (apiUrl || 'https://gitlab.com').replace(/\/$/, '');
    const encoded = encodeURIComponent(glPath);
    const response = await fetch(
        `${base}/api/v4/projects/${encoded}/merge_requests?state=${state}&per_page=50&order_by=updated_at`,
        { headers: { 'PRIVATE-TOKEN': token } }
    );
    if (!response.ok) throw new Error(`GitLab API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

export async function createGitlabMR(
    projectPath: string,
    token: string,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    description = '',
    draft = false,
    apiUrl?: string,
): Promise<GitlabMR> {
    const glPath = await getGitlabProjectPath(projectPath);
    if (!glPath) throw new Error("Could not determine GitLab project from 'origin' remote.");
    if (!token) throw new Error("GitLab token is required to create a Merge Request.");
    const base = (apiUrl || 'https://gitlab.com').replace(/\/$/, '');
    const encoded = encodeURIComponent(glPath);
    // GitLab marks MRs as drafts by prefixing the title
    const mrTitle = draft ? `Draft: ${title}` : title;
    const response = await fetch(`${base}/api/v4/projects/${encoded}/merge_requests`, {
        method: 'POST',
        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: mrTitle,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            description,
        }),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(`GitLab API Error: ${response.status} ${err?.message || response.statusText}`);
    }
    return response.json();
}
