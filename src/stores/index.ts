// Centralized hooks for all stores
// These hooks now consume instances from StoreProvider context
export {
    useGitStore,
    useJiraStore,
    useProcessStore,
    useSonarStore,
    useJenkinsStore,
    useTempoStore,
    useToolStore,
    useMockStore,
    useApiGatewayStore,
    // Raw stores for getState/setState
    useGitStoreRaw,
    useJiraStoreRaw,
    useProcessStoreRaw,
    useSonarStoreRaw,
    useJenkinsStoreRaw,
    useTempoStoreRaw,
    useToolStoreRaw,
    useMockStoreRaw,
    useApiGatewayStoreRaw
} from '../context/StoreProvider';

// Re-export specific types and constants from individual stores
// Git
export { EMPTY_REPO_DATA, defaultRepoData } from './gitStore';
export type { GitStore, GitRepoData, GitStatusEntry, RawCommit, AheadBehind, GitAccount, CloneFavorite, GitUi, BranchFilter } from './gitStore';

// Jira
export { DEFAULT_STATE as JIRA_DEFAULT_STATE } from './jiraStore';
export type { JiraStoreState, StoriesSelection } from './jiraStore';

// Process
export { batchedAppendLogs } from './processStore';
export type { ProcessStore, ProcessState, ProcessStatus } from './processStore';

// Sonar
export { DEFAULT_SONAR_CONFIG } from './sonarStore';
export type { SonarStore, SonarConfig } from './sonarStore';

// Jenkins
export type { JenkinsStore } from './jenkinsStore';

// Tempo
export type { TempoStore, TempoWorklog, IssueWorklog } from './tempoStore';

// Tool
export type { ToolStore, JdkInfo } from './toolStore';

// Mock
export type { MockStoreState, MockNode, MockEdge } from './mockStore';

// Api Gateway
export type { ApiGatewayState, SelectedApi, RestApiInfo, RestApiResource, HttpApiRoute, RestMethodDetails, HttpRouteIntegrationDetails, AwsCredentials } from './useApiGatewayStore';
