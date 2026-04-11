import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getOwnerRepo } from '../services/githubApi';

interface GitHubActionsWatcherPayload {
  watcherId: string;
  accountId: string;
  changedRuns: Array<{
    id: number;
    status: string;
    conclusion: string | null;
    updatedAt: string;
  }>;
}

interface UseGithubActionsWatcherOptions {
  projectPath: string | null;
  token: string;
  apiUrl: string | undefined;
  accountId: string | undefined;
  /** Polling interval in ms. */
  intervalMs?: number;
  enabled?: boolean;
  /** Called when one or more runs change status/conclusion. */
  onUpdate: () => void;
}

/**
 * Manages a backend GitHub Actions watcher worker.
 *
 * - Effect 1: resolves owner/repo from git remote, then starts the Rust worker.
 *   Stops the worker on unmount or when deps change.
 * - Effect 2: listens for `github-actions-update::{watcherId}` events
 *   and calls `onUpdate` to trigger a React Query invalidation.
 */
export function useGithubActionsWatcher({
  projectPath: rawProjectPath,
  token,
  apiUrl,
  accountId,
  intervalMs = 15_000,
  enabled = true,
  onUpdate,
}: UseGithubActionsWatcherOptions): void {
  const [ownerRepo, setOwnerRepo] = useState<{ owner: string; repo: string } | null>(null);

  // Normalize path: remove trailing slash
  const projectPath = rawProjectPath?.replace(/\/+$/, '') || null;

  // Resolve owner/repo once per projectPath — cached in githubApi module.
  useEffect(() => {
    if (!projectPath || !enabled) return;
    getOwnerRepo(projectPath).then(result => {
        if (result) {
            console.log(`[Watcher] Resolved repo for ${projectPath}: ${result.owner}/${result.repo}`);
            setOwnerRepo(result);
        } else {
            console.warn(`[Watcher] Could not resolve GitHub repo for path: ${projectPath}`);
        }
    });
  }, [projectPath, enabled]);

  const watcherId = projectPath && ownerRepo && accountId
    ? `github_actions::${accountId}::${ownerRepo.owner}/${ownerRepo.repo}`
    : null;

  // Effect 1: worker lifecycle.
  useEffect(() => {
    if (!enabled || !watcherId || !ownerRepo || !token || !projectPath) {
        if (enabled && !watcherId) {
            console.log(`[Watcher] Waiting for dependencies... (ownerRepo: ${!!ownerRepo}, accountId: ${!!accountId})`);
        }
        return;
    }

    console.log(`[Watcher] STARTING worker: "${watcherId}" | Path: ${projectPath}`);
    invoke('start_watcher', {
      watcherId,
      watcherType: 'github_actions',
      config: {
        token,
        apiUrl: apiUrl ?? 'https://api.github.com',
        owner: ownerRepo.owner,
        repo: ownerRepo.repo,
        accountId: accountId ?? '',
      },
      intervalMs,
    }).catch(err => console.error(`[Watcher] Failed to start:`, err));

    return () => {
      console.log(`[Watcher] STOPPING worker: "${watcherId}"`);
      invoke('stop_watcher', { watcherId }).catch(console.error);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watcherId, enabled, token, apiUrl, intervalMs]);

  // Effect 2: event listener.
  useEffect(() => {
    if (!enabled || !watcherId) return;

    const eventName = `github-actions-update::${watcherId}`;
    const unlistenPromise = listen<GitHubActionsWatcherPayload>(eventName, (event) => {
      console.log(`[Watcher] Received update event:`, event.payload);
      onUpdate();
    });

    return () => {
        unlistenPromise.then(unlisten => unlisten());
    };
  }, [watcherId, enabled, onUpdate]);
}
