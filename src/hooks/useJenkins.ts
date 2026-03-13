import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useJenkinsStore } from '../stores/jenkinsStore';
import * as api from '../services/jenkinsApi';

/** Hook to fetch all top-level Jenkins jobs */
export function useJenkinsJobs() {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'jobs', config.baseUrl],
    queryFn: () => api.jenkinsGetJobs(config),
    enabled: !!config.baseUrl,
    refetchInterval: (query) => {
        const data = query.state.data;
        const anyBuilding = Array.isArray(data) && data.some(api.isBuilding);
        // If something is building, refresh every 10s. Otherwise every 30s.
        return anyBuilding ? 10_000 : 30_000;
    },
  });
}

/** Hook to fetch children of a folder/multibranch */
export function useJenkinsChildren(jobPath: string, enabled = false) {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'children', config.baseUrl, jobPath],
    queryFn: () => api.jenkinsGetChildren(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: (query) => {
        const data = query.state.data;
        const building = Array.isArray(data) && data.some(api.isBuilding);
        // If child is building, 10s. Otherwise 30s.
        return building ? 10_000 : 30_000;
    }
  });
}

/** Hook to fetch specific job status */
export function useJenkinsJobStatus(jobPath: string, enabled = false) {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'job-status', config.baseUrl, jobPath],
    queryFn: () => api.jenkinsGetJobStatus(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: (query) => {
        const data = query.state.data;
        return (data && api.isBuilding(data)) ? 10_000 : 30_000;
    },
  });
}

/** Hook to fetch build history */
export function useJenkinsBuilds(jobPath: string, enabled = false) {
  const config = useJenkinsStore((s) => s.accounts.find(a => a.id === s.activeAccountId) || { baseUrl: '', user: '', token: '' });
  return useQuery({
    queryKey: ['jenkins', 'builds', config.baseUrl, jobPath],
    queryFn: () => api.jenkinsGetBuilds(config, jobPath),
    enabled: enabled && !!config.baseUrl,
    refetchInterval: (query) => {
        const data = query.state.data;
        const building = Array.isArray(data) && data.some(b => b.building);
        return building ? 10_000 : 30_000;
    },
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
