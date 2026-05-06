/**
 * Git UI module - Clean Architecture presentation layer.
 *
 * Components are gradually migrated from src/components/git/ to here.
 * New components use domain types directly from ../../git/domain/
 */

// Hooks - domain-aware hooks for Git operations
export * from './hooks';

// Components - re-exported from original location using @ alias
// Core components (domain-aware wrappers)
export { GitPanel } from './components/GitPanel';
export { GitStagingPanel } from './components/GitStagingPanel';
export { GitTimeline } from './components/GitTimeline';
export { GitDiffViewer } from './components/GitDiffViewer';
export { GitConflictResolver } from './components/GitConflictResolver';
export { GitConsole } from './components/GitConsole';

// Secondary components
export { GitSidebar } from '@/components/git/GitSidebar';
export { GitHunkStaging } from '@/components/git/GitHunkStaging';
export { CloudRepoExplorer } from '@/components/git/CloudRepoExplorer';
export { GitInitPanel } from '@/components/git/GitInitPanel';
export { PRSection } from '@/components/git/PRSection';
export { GitJiraCommitButton } from '@/components/git/GitJiraCommitButton';

// Modals
export { AccountManagerModal } from '@/components/git/AccountManagerModal';
export { CloneRepoModal } from '@/components/git/CloneRepoModal';
export { GitConflictModal } from '@/components/git/GitConflictModal';
export { GitAmendModal } from '@/components/git/GitAmendModal';
export { GitSquashModal } from '@/components/git/GitSquashModal';
export { MergeConfirmModal } from '@/components/git/MergeConfirmModal';
export { MergePRModal } from '@/components/git/MergePRModal';
export { CreatePRModal } from '@/components/git/CreatePRModal';
export { PushPreviewModal } from '@/components/git/PushPreviewModal';
export { BranchDiffModal } from '@/components/git/BranchDiffModal';
export { CommitDiffModal } from '@/components/git/CommitDiffModal';
export { StashDiffModal } from '@/components/git/StashDiffModal';
export { FileHistoryModal } from '@/components/git/FileHistoryModal';
export { GitConfigModal } from '@/components/git/GitConfigModal';

// GitHub sub-components
export { GithubPanel } from '@/components/git/GithubPanel';
export { WorkflowRunList } from '@/components/git/github/WorkflowRunList';
export { WorkflowRunModal } from '@/components/git/github/WorkflowRunModal';
export { WorkflowStatusBadge } from '@/components/git/github/WorkflowStatusBadge';
export { JobLogsDrawer } from '@/components/git/github/JobLogsDrawer';

// Shared utilities
export { FileDiffPanel } from '@/components/git/shared/FileDiffPanel';
