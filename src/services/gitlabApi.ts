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
