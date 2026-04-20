import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useJenkinsStore } from '../stores/jenkinsStore';
import * as api from '../services/jenkinsApi';

/** Hook to fetch all top-level Jenkins jobs */
export function useJenkinsJobs() {
  const activeAccountId = useJenkinsStore((s) => s.activeAccountId);
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'jobs', activeAccountId],
    queryFn: () => api.jenkinsGetJobs(config),
    enabled: !!config.baseUrl,
    refetchInterval: false, // Disabling global polling for todos as per request
  });
}

/** Hook to fetch children of a folder/multibranch.
 *  When `enabled` the query polls every 10 s so branch statuses stay live. */
export function useJenkinsChildren(jobPath: string, enabled = false) {
  const activeAccountId = useJenkinsStore((s) => s.activeAccountId);
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'children', activeAccountId, jobPath],
    queryFn: () => api.jenkinsGetChildren(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: enabled ? 10_000 : false,
  });
}

/** Hook to fetch specific job status.
 *  When `enabled` the query polls every 5 s (the main card status dot). */
export function useJenkinsJobStatus(jobPath: string, enabled = false) {
  const activeAccountId = useJenkinsStore((s) => s.activeAccountId);
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'job-status', activeAccountId, jobPath],
    queryFn: () => api.jenkinsGetJobStatus(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: enabled ? 5_000 : false,
  });
}

/** Hook to fetch build history.
 *  When `enabled` the query polls every 10 s so running builds appear. */
export function useJenkinsBuilds(jobPath: string, enabled = false) {
  const activeAccountId = useJenkinsStore((s) => s.activeAccountId);
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'builds', activeAccountId, jobPath],
    queryFn: () => api.jenkinsGetBuilds(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: enabled ? 10_000 : false,
  });
}

/** Hook to fetch pipeline stages */
export function useJenkinsPipelineStages(jobPath: string, buildNumber: number, live: boolean) {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'stages', config.baseUrl, jobPath, buildNumber],
    queryFn: () => api.jenkinsGetPipelineStages(config, jobPath, buildNumber),
    enabled: !!config.baseUrl && buildNumber > 0,
    refetchInterval: live ? 6_000 : false,
  });
}

/** Hook to fetch nodes for a stage */
export function useJenkinsStageNodes(jobPath: string, buildNumber: number, stageId: string, enabled = false) {
    const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
    return useQuery({
        queryKey: ['jenkins', 'stage-nodes', config.baseUrl, jobPath, buildNumber, stageId],
        queryFn: () => api.jenkinsGetStageNodes(config, jobPath, buildNumber, stageId),
        enabled: enabled && !!config.baseUrl,
    });
}

/** Hook to fetch log for a node */
export function useJenkinsStageLog(jobPath: string, buildNumber: number, nodeId: string, enabled = false) {
    const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
    return useQuery({
        queryKey: ['jenkins', 'stage-log', config.baseUrl, jobPath, buildNumber, nodeId],
        queryFn: () => api.jenkinsGetStageLog(config, jobPath, buildNumber, nodeId),
        enabled: enabled && !!config.baseUrl,
    });
}

/** Mutation to trigger a build */
export function useJenkinsTriggerBuild() {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (jobPath: string) => api.jenkinsTriggerBuild(config, jobPath),
    onSuccess: (_, jobPath) => {
        // Invalidate relevant queries to show the new build
        queryClient.invalidateQueries({ queryKey: ['jenkins', 'job-status', config.baseUrl, jobPath] });
        queryClient.invalidateQueries({ queryKey: ['jenkins', 'builds', config.baseUrl, jobPath] });
        queryClient.invalidateQueries({ queryKey: ['jenkins', 'jobs', config.baseUrl] });
    }
  });
}

/** Mutation to abort a build */
export function useJenkinsAbortBuild() {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobPath, buildNumber }: { jobPath: string; buildNumber: number }) => 
      api.jenkinsAbortBuild(config, jobPath, buildNumber),
    onSuccess: (_, { jobPath }) => {
        queryClient.invalidateQueries({ queryKey: ['jenkins', 'job-status', config.baseUrl, jobPath] });
        queryClient.invalidateQueries({ queryKey: ['jenkins', 'builds', config.baseUrl, jobPath] });
    }
  });
}
