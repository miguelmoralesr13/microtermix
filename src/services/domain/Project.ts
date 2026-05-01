/**
 * Domain entity representing a discovered project in the workspace.
 * Pure domain model — no framework dependencies.
 */
export interface Project {
  name: string;
  path: string;
  projectType: ProjectType;
  framework?: string;
  buildSystem?: string;
  packageManager?: string;
  scripts: string[];
}

export type ProjectType =
  | 'node'
  | 'bun'
  | 'go'
  | 'rust'
  | 'python'
  | 'java'
  | 'git-repo'
  | 'unknown';

/**
 * Determines the project type from a project's scripts or metadata.
 */
export function isJavaProject(project: Project): boolean {
  return project.projectType === 'java';
}

export function isNodeProject(project: Project): boolean {
  return project.projectType === 'node' || project.projectType === 'bun';
}
