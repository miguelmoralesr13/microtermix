/**
 * GitPanel - Main Git panel component (Clean Architecture ready).
 *
 * This is a re-export of the existing GitPanel.
 * The existing component is gradually being updated to use domain types.
 *
 * Architecture:
 * - Uses useGitStaging and useGitTimelineView hooks which return domain types
 * - UI components import GitStatusEntry, GitCommit from ../../git/domain
 * - Infrastructure calls go through Tauri adapters
 */
export { GitPanel } from '@/components/git/GitPanel';
