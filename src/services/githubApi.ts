// A simple service to fetch PRs and Issues from GitHub
import { invoke } from '@tauri-apps/api/core';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GithubPR {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    created_at: string;
    body: string;
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

// Extract Owner and Repo from remote URL
async function getOwnerRepo(projectPath: string): Promise<{ owner: string; repo: string } | null> {
    try {
        const result: any = await invoke('git_execute', { projectPath, args: ['remote', 'get-url', 'origin'] });
        if (!result.success) return null;

        const url = result.stdout.trim();
        // matches git@github.com:owner/repo.git or https://github.com/owner/repo.git
        const match = url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
        if (match && match.length >= 3) {
            return { owner: match[1], repo: match[2] };
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function fetchGithubPRs(projectPath: string, token: string): Promise<GithubPR[]> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(`${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}/pulls?state=open`, {
        headers
    });

    if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
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

export async function createGithubPR(projectPath: string, token: string, title: string, head: string, base: string, body: string): Promise<GithubPR> {
    const info = await getOwnerRepo(projectPath);
    if (!info) throw new Error("Could not determine GitHub repository from 'origin' remote.");
    if (!token) throw new Error("GitHub PAT Token is required to create a Pull Request.");

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(`${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, head, base, body })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(`GitHub API Error: ${response.status} ${errData?.message || response.statusText}`);
    }
    return response.json();
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
