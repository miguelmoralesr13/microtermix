/**
 * GitTimeline - Git commit timeline component (Clean Architecture ready).
 *
 * This component uses domain types:
 * - GitCommit from ../../../../git/domain
 *
 * Architecture:
 * - Receives GitCommit[] from useGitTimelineView hook
 * - Uses domain helpers: getCommitSubject, isMergeCommit, parseRefs
 */
export { GitTimeline } from '@/components/git/GitTimeline';
