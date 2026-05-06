/**
 * GitStagingPanel - Git staging panel component (Clean Architecture ready).
 *
 * This component uses domain types:
 * - GitStatusEntry from ../../../../git/domain
 *
 * Architecture:
 * - Receives GitStatusEntry[] from parent or hook
 * - Displays file tree with status indicators
 * - Uses domain helpers: parseGitStateCode, hasConflicts, groupByState
 */
export { GitStagingPanel } from '@/components/git/GitStagingPanel';
