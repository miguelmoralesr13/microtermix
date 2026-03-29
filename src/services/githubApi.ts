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
}

export async function fetchUserGithubRepos(apiUrl: string, token: string): Promise<GithubRepo[]> {
    const base = apiUrl || GITHUB_API_BASE;
    const response = await fetch(`${base}/user/repos?type=all&sort=updated&per_page=50`, {
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
    const response = await fetch(`${base}/search/repositories?q=${encodeURIComponent(query)}&per_page=30`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
        },
    });
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    const data = await response.json();
    return data.items as GithubRepo[];
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
async function getOwnerRepo(projectPath: string): Promise<{ owner: string; repo: string } | null> {
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
