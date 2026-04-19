// A simple service to fetch PRs and Issues from GitHub
import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GithubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    private: boolean;
    language: string | null;
    stargazers_count: number;
    updated_at: string;
    fork: boolean;
    owner: {
        login: string;
        avatar_url: string;
    };
    visibility?: string;
    permissions?: {
        pull: boolean;
        push: boolean;
        admin: boolean;
    };
}

export interface GithubUser {
    login: string;
    id: number;
    avatar_url: string;
}

export async function fetchUserGithubProfile(apiUrl: string, token: string): Promise<GithubUser> {
    const base = apiUrl || GITHUB_API_BASE;
    const response = await fetch(`${base}/user`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
        },
    });
    if (!response.ok) {
        console.error('[GITHUB_DEBUG] Error fetching profile:', response.status, response.statusText);
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const scopes = response.headers.get('X-OAuth-Scopes');
    console.log('[GITHUB_DEBUG] Profile fetched:', data.login, '| Scopes:', scopes || 'no detected');
    return data;
}

export async function fetchUserGithubRepos(apiUrl: string, token: string): Promise<GithubRepo[]> {
    console.log('[GITHUB_DEBUG] fetchUserGithubRepos starting...');
    const base = apiUrl || GITHUB_API_BASE;
    let allRepos: GithubRepo[] = [];
    let page = 1;
    let hasMore = true;

    try {
        const user = await fetchUserGithubProfile(apiUrl, token);
        const myLogin = user.login.toLowerCase();

        while (hasMore && page <= 3) {
            const url = `${base}/user/repos?sort=pushed&per_page=100&page=${page}`;
            console.log(`[GITHUB_DEBUG] Fetching full URL: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${token}`,
                },
            });
            
            if (!response.ok) {
                const scopes = response.headers.get('X-OAuth-Scopes');
                console.error('[GITHUB_DEBUG] Page fetch failed:', response.status, response.statusText, '| Scopes:', scopes);
                const errBody = await response.text().catch(() => '');
                console.error('[GITHUB_DEBUG] Error body:', errBody);
                break;
            }
            
            const data: GithubRepo[] = await response.json();
            console.log(`[GITHUB_DEBUG] Page ${page} RAW count: ${data.length}`);
            if (data.length > 0) {
                console.log('[GITHUB_DEBUG] SAMPLE REPO (first of page):', data[0].full_name, data[0]);
            } else {
                console.warn('[GITHUB_DEBUG] WARNING: GitHub returned zero repos for this account.');
            }
            
            if (data.length === 0) {
                hasMore = false;
            } else {
                // Debug log for filtering
                const relevant = data.filter(r => {
                    const isPrivate = r.private;
                    const isInternal = r.visibility === 'internal';
                    const isOwner = r.owner.login.toLowerCase() === myLogin;
                    const hasPush = r.permissions?.push === true;
                    
                    const keep = isPrivate || isInternal || isOwner || hasPush;
                    
                    if (!keep && page === 1) {
                        // Log a few ignored ones only for the first page to avoid spam
                        console.log(`[GITHUB_DEBUG] Ignoring public non-owned/non-collab repo: ${r.full_name}`, { isPrivate, isInternal, isOwner, hasPush });
                    }
                    
                    return keep;
                });
                
                console.log(`[GITHUB_DEBUG] Kept ${relevant.length} relevant repos on page ${page}`);
                allRepos = [...allRepos, ...relevant];
                
                const link = response.headers.get('Link');
                if (!link || !link.includes('rel="next"')) {
                    hasMore = false;
                } else {
                    page++;
                }
            }
        }
    } catch (e) {
        console.error('[GITHUB_DEBUG] Error in fetchUserGithubRepos:', e);
        throw e;
    }

    console.log(`[GITHUB_DEBUG] Returning total ${allRepos.length} repos`);
    return allRepos;
}

export interface GithubOrg {
    login: string;
    id: number;
    avatar_url: string;
    description: string;
}

export async function fetchUserOrganizations(apiUrl: string, token: string): Promise<GithubOrg[]> {
    const base = apiUrl || GITHUB_API_BASE;
    const response = await fetch(`${base}/user/orgs`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
        },
    });
    if (!response.ok) {
        const err = await response.text().catch(() => '');
        console.error('[GITHUB_DEBUG] Orgs fetch failed:', response.status, err);
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

export async function fetchOrgRepos(apiUrl: string, token: string, org: string): Promise<GithubRepo[]> {
    const base = apiUrl || GITHUB_API_BASE;
    const response = await fetch(`${base}/orgs/${org}/repos?sort=updated&per_page=100`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
        },
    });
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

export async function searchGithubRepos(apiUrl: string, token: string, query: string): Promise<GithubRepo[]> {
    const base = apiUrl || GITHUB_API_BASE;
    
    try {
        const user = await fetchUserGithubProfile(apiUrl, token);
        const myLogin = user.login.toLowerCase();
        
        // Buscamos repositorios donde el usuario tenga acceso (privados o públicos donde colabora)
        // El parámetro 'q' puede incluir 'user:LOGIN' para buscar en sus repos, 
        // pero queremos buscar en TODO a lo que tiene acceso. 
        // Al estar autenticado, el search API devuelve privados donde tiene acceso.
        // Añadimos 'user:LOGIN' opcionalmente o simplemente dejamos que el API filtre,
        // pero el usuario pidió ignorar públicos ajenos.
        
        const response = await fetch(`${base}/search/repositories?q=${encodeURIComponent(query)}+user:${myLogin}&per_page=100`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`,
            },
        });
        
        if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        let items = data.items as GithubRepo[];
        
        // Aplicamos el mismo filtro de relevancia que en el listado general
        return items.filter(r => 
            r.private || 
            r.visibility === 'internal' ||
            r.owner.login.toLowerCase() === myLogin ||
            r.permissions?.push === true
        );
    } catch (e) {
        // Si falla la búsqueda filtrada por usuario (ej: el query es demasiado complejo), 
        // intentamos búsqueda normal pero filtrando resultados finales.
        const response = await fetch(`${base}/search/repositories?q=${encodeURIComponent(query)}&per_page=100`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`,
            },
        });
        if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        const items = data.items as GithubRepo[];
        
        const user = await fetchUserGithubProfile(apiUrl, token);
        const myLogin = user.login.toLowerCase();
        
        return items.filter(r => 
            r.private || 
            r.visibility === 'internal' ||
            r.owner.login.toLowerCase() === myLogin ||
            r.permissions?.push === true
        );
    }
}

export interface GithubPR {
    id: number;
    number: number;
    title: string;
    state: 'open' | 'closed';
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    updated_at: string;
    body: string | null;
    draft: boolean;
    head: { ref: string; sha: string };
    base: { ref: string };
    labels: { id: number; name: string; color: string }[];
    requested_reviewers: { login: string; avatar_url: string }[];
    mergeable_state?: string;
}

export interface GithubIssue {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    body: string;
    pull_request?: any; // If it has this, it's actually a PR, but GitHub API returns both
}

// Cache owner/repo per projectPath so git remote get-url origin is only called once per project
const ownerRepoCache = new Map<string, { owner: string; repo: string }>();

// Extract Owner and Repo from remote URL
export async function getOwnerRepo(projectPath: string): Promise<{ owner: string; repo: string } | null> {
    if (ownerRepoCache.has(projectPath)) {
        return ownerRepoCache.get(projectPath)!;
    }
    try {
        const result: any = await invoke('git_execute', { projectPath, args: ['remote', 'get-url', 'origin'] });
        if (!result.success) return null;

        const url = result.stdout.trim();
        // matches git@github.com:owner/repo.git or https://github.com/owner/repo.git
        const match = url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
        if (match && match.length >= 3) {
            const info = { owner: match[1], repo: match[2] };
            ownerRepoCache.set(projectPath, info);
            return info;
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function fetchGithubPRs(
    projectPath: string,
    token: string,
    apiUrl?: string,
    state: 'open' | 'closed' | 'all' = 'open'
): Promise<GithubPR[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const response = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/pulls?state=${state}&per_page=50`,
        { headers }
    );
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

export async function fetchGithubIssues(projectPath: string, token: string): Promise<GithubIssue[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(`${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}/issues?state=open`, {
        headers
    });

    if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }

    // GitHub API returns PRs as issues too, filter them out
    const data: GithubIssue[] = await response.json();
    return data.filter(item => !item.pull_request);
}

export async function createGithubPR(
    projectPath: string,
    token: string,
    title: string,
    head: string,
    base: string,
    body: string,
    draft = false,
    reviewers: string[] = [],
    apiUrl?: string,
): Promise<GithubPR> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub token is required to create a Pull Request.");
    const baseUrl = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
    };
    const response = await fetch(`${baseUrl}/repos/${info.owner}/${info.repo}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, head, base, body, draft }),
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(`GitHub API Error: ${response.status} ${errData?.message || response.statusText}`);
    }
    const pr: GithubPR = await response.json();
    // GitHub API does not accept requested_reviewers in the PR creation payload;
    // reviewer assignment requires a separate follow-up request.
    if (reviewers.length > 0) {
        await fetch(`${baseUrl}/repos/${info.owner}/${info.repo}/pulls/${pr.number}/requested_reviewers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ reviewers }),
        }).catch(() => null);
    }
    return pr;
}

export interface GithubCommitStatus {
    state: 'pending' | 'success' | 'failure' | 'error';
    statuses: {
        state: string;
        description: string;
        context: string;
        target_url: string;
    }[];
}

export async function fetchGithubCommitStatus(projectPath: string, token: string, commitHash: string): Promise<GithubCommitStatus | null> {
    const info = await getOwnerRepo(projectPath);
    if (!info) return null; // Silently fail if no origin

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    try {
        const response = await fetch(`${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}/commits/${commitHash}/status`, {
            headers
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

export type GithubMergeMethod = 'merge' | 'squash' | 'rebase';

export async function mergeGithubPR(
    projectPath: string,
    token: string,
    prNumber: number,
    method: GithubMergeMethod = 'merge',
    commitTitle?: string,
    commitMessage?: string,
    apiUrl?: string,
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub token is required to merge a Pull Request.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
    };
    const body: Record<string, string> = { merge_method: method };
    if (commitTitle) body.commit_title = commitTitle;
    if (commitMessage) body.commit_message = commitMessage;
    const response = await fetch(`${base}/repos/${info.owner}/${info.repo}/pulls/${prNumber}/merge`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(`GitHub API Error: ${response.status} ${err?.message || response.statusText}`);
    }
}

export interface GithubPRCommit {
    sha: string;
    commit: {
        message: string;
        author: { name: string; date: string };
    };
}

export interface GithubPRFile {
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
}

export async function fetchGithubPRCommits(
    projectPath: string, token: string, prNumber: number, apiUrl?: string
): Promise<GithubPRCommit[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(`${base}/repos/${info.owner}/${info.repo}/pulls/${prNumber}/commits?per_page=100`, { headers });
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
    return res.json();
}

export async function fetchGithubPRFiles(
    projectPath: string, token: string, prNumber: number, apiUrl?: string
): Promise<GithubPRFile[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(`${base}/repos/${info.owner}/${info.repo}/pulls/${prNumber}/files?per_page=100`, { headers });
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
    return res.json();
}

export async function closeGithubPR(
    projectPath: string, token: string, prNumber: number, apiUrl?: string
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub token is required.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
    };
    const res = await fetch(`${base}/repos/${info.owner}/${info.repo}/pulls/${prNumber}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state: 'closed' }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`GitHub API Error: ${res.status} ${err?.message || res.statusText}`);
    }
}

export async function deleteGithubBranch(
    projectPath: string, token: string, branchName: string, apiUrl?: string
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub token is required.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
    };
    await fetch(`${base}/repos/${info.owner}/${info.repo}/git/refs/heads/${branchName}`, {
        method: 'DELETE', headers,
    }); // non-fatal if fails
}

// ── GitHub Actions ────────────────────────────────────────────────────────────

export type WorkflowRunStatus =
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'waiting'
    | 'requested'
    | 'pending';

export type WorkflowRunConclusion =
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | 'neutral'
    | 'stale'
    | null;

export interface WorkflowRun {
    id: number;
    name: string | null;
    display_title: string;
    run_number: number;
    event: string;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion;
    workflow_id: number;
    head_branch: string | null;
    head_sha: string;
    html_url: string;
    created_at: string;
    updated_at: string;
    run_started_at: string | null;
    actor: { login: string; avatar_url: string } | null;
    head_commit: {
        id: string;
        message: string;
        author: { name: string; email: string };
    } | null;
}

export interface WorkflowRunsResponse {
    total_count: number;
    workflow_runs: WorkflowRun[];
}

export interface WorkflowStep {
    name: string;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion;
    number: number;
    started_at: string | null;
    completed_at: string | null;
}

export interface WorkflowJob {
    id: number;
    run_id: number;
    name: string;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion;
    started_at: string | null;
    completed_at: string | null;
    html_url: string;
    steps: WorkflowStep[];
    runner_name: string | null;
    labels: string[];
}

export interface WorkflowJobsResponse {
    total_count: number;
    jobs: WorkflowJob[];
}

export async function fetchWorkflowRuns(
    projectPath: string,
    token: string,
    apiUrl?: string,
    perPage: number = 30
): Promise<WorkflowRun[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/runs?per_page=${perPage}`,
        { headers }
    );
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    const data: WorkflowRunsResponse = await res.json();
    return data.workflow_runs;
}

export async function fetchWorkflowRunJobs(
    projectPath: string,
    token: string,
    runId: number,
    apiUrl?: string
): Promise<WorkflowJob[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/runs/${runId}/jobs?per_page=30`,
        { headers }
    );
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    const data: WorkflowJobsResponse = await res.json();
    return data.jobs;
}

export async function fetchJobLogs(
    projectPath: string,
    token: string,
    jobId: number,
    apiUrl?: string
): Promise<string | null> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/jobs/${jobId}/logs`,
        { headers }
    );

    // GitHub returns a 302 redirect to a signed S3 URL.
    // If the HTTP plugin followed it automatically we get 200; otherwise handle it manually.
    if (res.status === 302 || res.status === 301) {
        const location = res.headers.get('location');
        if (!location) throw new Error('No redirect location in logs response');
        // S3 URL is pre-signed — do NOT forward the Authorization header
        const s3Res = await fetch(location, {});
        if (!s3Res.ok) throw new Error(`Logs fetch failed: ${s3Res.status}`);
        return s3Res.text();
    }

    // 404 during in_progress means logs aren't written yet — return null so UI shows "no logs yet"
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    return res.text();
}

export async function cancelWorkflowRun(
    projectPath: string,
    token: string,
    runId: number,
    apiUrl?: string
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/runs/${runId}/cancel`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`,
            },
        }
    );
    // 202 Accepted is the success response for cancel
    if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => null);
        console.error('[GITHUB_ACTIONS] cancelWorkflowRun error body:', body);
        throw new Error(`GitHub API Error ${res.status}: ${body?.message || res.statusText}`);
    }
}

export async function rerunWorkflowRun(
    projectPath: string,
    token: string,
    runId: number,
    apiUrl?: string
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/runs/${runId}/rerun`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`,
                'Content-Length': '0',
            },
        }
    );
    // 201 Created is the success response for re-run
    if (!res.ok && res.status !== 201) {
        const body = await res.json().catch(() => null);
        console.error('[GITHUB_ACTIONS] rerunWorkflowRun error body:', body);
        throw new Error(`GitHub API Error ${res.status}: ${body?.message || res.statusText}`);
    }
}

export async function rerunFailedJobs(
    projectPath: string,
    token: string,
    runId: number,
    apiUrl?: string
): Promise<void> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    const base = apiUrl || GITHUB_API_BASE;
    const res = await fetch(
        `${base}/repos/${info.owner}/${info.repo}/actions/runs/${runId}/rerun-failed-jobs`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`,
                'Content-Length': '0',
            },
        }
    );
    if (!res.ok && res.status !== 201) {
        const body = await res.json().catch(() => null);
        console.error('[GITHUB_ACTIONS] rerunFailedJobs error body:', body);
        throw new Error(`GitHub API Error ${res.status}: ${body?.message || res.statusText}`);
    }
}

// ── Cloud Explorer helpers ─────────────────────────────────────────────────────

export interface RemoteCompareFile {
    filename: string;
    previousFilename?: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

export interface RemoteComparison {
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    status: string;
    files: RemoteCompareFile[];
}

export async function fetchRepoBranches(
    owner: string,
    repo: string,
    token: string,
    apiBase?: string,
): Promise<{ name: string; protected: boolean }[]> {
    const base = (apiBase || GITHUB_API_BASE).replace(/\/$/, '');
    const branches: { name: string; protected: boolean }[] = [];
    for (let page = 1; page <= 10; page++) {
        const res = await fetch(`${base}/repos/${owner}/${repo}/branches?per_page=100&page=${page}`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const data: { name: string; protected: boolean }[] = await res.json();
        branches.push(...data);
        if (data.length < 100) break;
    }
    return branches;
}

export async function fetchRemoteBranchComparison(
    owner: string,
    repo: string,
    base: string,
    head: string,
    token: string,
    apiBase?: string,
): Promise<RemoteComparison> {
    const apiBaseUrl = (apiBase || GITHUB_API_BASE).replace(/\/$/, '');
    const res = await fetch(
        `${apiBaseUrl}/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
        { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data: {
        ahead_by: number;
        behind_by: number;
        total_commits: number;
        status: string;
        files?: { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; changes: number; patch?: string }[];
    } = await res.json();
    return {
        aheadBy: data.ahead_by,
        behindBy: data.behind_by,
        totalCommits: data.total_commits,
        status: data.status,
        files: (data.files || []).map(f => ({
            filename: f.filename,
            previousFilename: f.previous_filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch,
        })),
    };
}
