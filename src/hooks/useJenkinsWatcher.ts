import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { JenkinsConfig } from '../services/jenkinsApi';

export interface WatcherJobStatus {
  url: string;
  color: string;
  lastBuildNumber: number | null;
  lastBuildResult: string | null;
  building: boolean;
  estimatedDuration: number | null;
  timestamp: number | null;
}

interface JenkinsStatusUpdatePayload {
  watcherId: string;
  accountId: string;
  changedJobs: WatcherJobStatus[];
}

interface UseJenkinsWatcherOptions {
  watcherId: string;
  /** Full job URLs from favorites (e.g. "https://jenkins.example.com/job/my-pipeline/") */
  jobUrls: string[];
  config: JenkinsConfig | undefined;
  /** Polling interval in ms. Re-invoking with a different value restarts the worker. */
  intervalMs?: number;
  enabled?: boolean;
  onUpdate: (changed: WatcherJobStatus[]) => void;
}

/**
 * Manages a backend Jenkins watcher worker.
 *
 * - Effect 1: starts the Rust worker on mount, stops it on unmount.
 *   Re-runs (restart) when account, job list, or interval changes.
 * - Effect 2: listens for `jenkins-status-update::{watcherId}` events
 *   and calls `onUpdate` with the changed jobs.
 */
export function useJenkinsWatcher({
  watcherId,
  jobUrls,
  config,
  intervalMs = 30_000,
  enabled = true,
  onUpdate,
}: UseJenkinsWatcherOptions): void {
  // Effect 1: worker lifecycle (start on mount, stop on unmount/dep change).
  useEffect(() => {
    if (!enabled || !config?.baseUrl || !config.id || jobUrls.length === 0) return;

    invoke('start_watcher', {
      watcherId,
      watcherType: 'jenkins',
      config: {
        baseUrl: config.baseUrl,
        user: config.user,
        token: config.token,
        jobUrls,
        accountId: config.id,
      },
      intervalMs,
    }).catch(console.error);

    return () => {
      invoke('stop_watcher', { watcherId }).catch(console.error);
    };
  // jobUrls.join(',') gives a stable primitive that changes only when URLs actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watcherId, enabled, config?.baseUrl, config?.user, config?.token, config?.id, intervalMs, jobUrls.join(',')]);

  // Effect 2: subscribe to Tauri events from this watcher.
  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    const eventName = `jenkins-status-update::${watcherId}`;

    listen<JenkinsStatusUpdatePayload>(eventName, (e) => {
      onUpdate(e.payload.changedJobs);
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [watcherId, enabled, onUpdate]);
}
