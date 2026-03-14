import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useStore } from 'zustand';
import { useWorkspace } from './WorkspaceContext';

// Import creators and types from SPECIFIC files to avoid circular dependencies
import { createGitStore, GitStore } from '../stores/gitStore';
import { createJiraStore, JiraStoreState } from '../stores/jiraStore';
import { createProcessStore, ProcessStore } from '../stores/processStore';
import { createSonarStore, SonarStore } from '../stores/sonarStore';
import { createJenkinsStore, JenkinsStore } from '../stores/jenkinsStore';
import { createTempoStore, TempoStore } from '../stores/tempoStore';
import { createToolStore, ToolStore } from '../stores/toolStore';
import { createMockStore, MockStoreState } from '../stores/mockStore';
import { createApiGatewayStore, ApiGatewayState } from '../stores/useApiGatewayStore';

// Types for the stores (return types of factory functions)
type GitStoreInstance = ReturnType<typeof createGitStore>;
type JiraStoreInstance = ReturnType<typeof createJiraStore>;
type ProcessStoreInstance = ReturnType<typeof createProcessStore>;
type SonarStoreInstance = ReturnType<typeof createSonarStore>;
type JenkinsStoreInstance = ReturnType<typeof createJenkinsStore>;
type TempoStoreInstance = ReturnType<typeof createTempoStore>;
type ToolStoreInstance = ReturnType<typeof createToolStore>;
type MockStoreInstance = ReturnType<typeof createMockStore>;
type ApiGatewayStoreInstance = ReturnType<typeof createApiGatewayStore>;

// Contexts
const GitStoreContext = createContext<GitStoreInstance | null>(null);
const JiraStoreContext = createContext<JiraStoreInstance | null>(null);
const ProcessStoreContext = createContext<ProcessStoreInstance | null>(null);
const SonarStoreContext = createContext<SonarStoreInstance | null>(null);
const JenkinsStoreContext = createContext<JenkinsStoreInstance | null>(null);
const TempoStoreContext = createContext<TempoStoreInstance | null>(null);
const ToolStoreContext = createContext<ToolStoreInstance | null>(null);
const MockStoreContext = createContext<MockStoreInstance | null>(null);
const ApiGatewayStoreContext = createContext<ApiGatewayStoreInstance | null>(null);

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { state } = useWorkspace();
    const currentPath = state.currentPath;

    // We use currentPath as a dependency to RE-CREATE all stores when the workspace changes.
    // This provides true isolation between workspaces.
    const stores = useMemo(() => ({
        git: createGitStore(),
        jira: createJiraStore(),
        process: createProcessStore(),
        sonar: createSonarStore(),
        jenkins: createJenkinsStore(),
        tempo: createTempoStore(),
        tool: createToolStore(),
        mock: createMockStore(),
        apiGateway: createApiGatewayStore(),
    }), [currentPath]);

    return (
        <GitStoreContext.Provider value={stores.git}>
            <JiraStoreContext.Provider value={stores.jira}>
                <ProcessStoreContext.Provider value={stores.process}>
                    <SonarStoreContext.Provider value={stores.sonar}>
                        <JenkinsStoreContext.Provider value={stores.jenkins}>
                            <TempoStoreContext.Provider value={stores.tempo}>
                                <ToolStoreContext.Provider value={stores.tool}>
                                    <MockStoreContext.Provider value={stores.mock}>
                                        <ApiGatewayStoreContext.Provider value={stores.apiGateway}>
                                            {children}
                                        </ApiGatewayStoreContext.Provider>
                                    </MockStoreContext.Provider>
                                </ToolStoreContext.Provider>
                            </TempoStoreContext.Provider>
                        </JenkinsStoreContext.Provider>
                    </SonarStoreContext.Provider>
                </ProcessStoreContext.Provider>
            </JiraStoreContext.Provider>
        </GitStoreContext.Provider>
    );
};

// Generic hook helper
function useStoreFromContext<S, T>(
    context: React.Context<any>,
    selector?: (state: S) => T,
    hookName: string
): T {
    const store = useContext(context);
    if (!store) {
        throw new Error(`${hookName} must be used within a StoreProvider`);
    }
    // If no selector is provided, useStore returns the whole state S as T
    return useStore(store, (selector || ((s: any) => s)) as any);
}

// Re-export original hook names to minimize component changes
export const useGitStore = <T = GitStore,>(selector?: (s: GitStore) => T): T => 
    useStoreFromContext<GitStore, T>(GitStoreContext, selector, 'useGitStore');

export const useJiraStore = <T = JiraStoreState,>(selector?: (s: JiraStoreState) => T): T => 
    useStoreFromContext<JiraStoreState, T>(JiraStoreContext, selector, 'useJiraStore');

export const useProcessStore = <T = ProcessStore,>(selector?: (s: ProcessStore) => T): T => 
    useStoreFromContext<ProcessStore, T>(ProcessStoreContext, selector, 'useProcessStore');

export const useSonarStore = <T = SonarStore,>(selector?: (s: SonarStore) => T): T => 
    useStoreFromContext<SonarStore, T>(SonarStoreContext, selector, 'useSonarStore');

export const useJenkinsStore = <T = JenkinsStore,>(selector?: (s: JenkinsStore) => T): T => 
    useStoreFromContext<JenkinsStore, T>(JenkinsStoreContext, selector, 'useJenkinsStore');

export const useTempoStore = <T = TempoStore,>(selector?: (s: TempoStore) => T): T => 
    useStoreFromContext<TempoStore, T>(TempoStoreContext, selector, 'useTempoStore');

export const useToolStore = <T = ToolStore,>(selector?: (s: ToolStore) => T): T => 
    useStoreFromContext<ToolStore, T>(ToolStoreContext, selector, 'useToolStore');

export const useMockStore = <T = MockStoreState,>(selector?: (s: MockStoreState) => T): T => 
    useStoreFromContext<MockStoreState, T>(MockStoreContext, selector, 'useMockStore');

export const useApiGatewayStore = <T = ApiGatewayState,>(selector?: (s: ApiGatewayState) => T): T => 
    useStoreFromContext<ApiGatewayState, T>(ApiGatewayStoreContext, selector, 'useApiGatewayStore');

/**
 * Access the raw vanilla store instance from context.
 * Useful for accessing getState() or setState() outside of React rendering (e.g. in callbacks).
 */
export const useGitStoreRaw = () => useContext(GitStoreContext);
export const useJiraStoreRaw = () => useContext(JiraStoreContext);
export const useProcessStoreRaw = () => useContext(ProcessStoreContext);
export const useSonarStoreRaw = () => useContext(SonarStoreContext);
export const useJenkinsStoreRaw = () => useContext(JenkinsStoreContext);
export const useTempoStoreRaw = () => useContext(TempoStoreContext);
export const useToolStoreRaw = () => useContext(ToolStoreContext);
export const useMockStoreRaw = () => useContext(MockStoreContext);
export const useApiGatewayStoreRaw = () => useContext(ApiGatewayStoreContext);
