import type { Project } from '../../domain';

/**
 * Port interface for scanning projects in a workspace path.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface ProjectScannerPort {
  /**
   * Scans the given path for projects.
   * If the path itself is a project, returns it.
   * Otherwise scans immediate children.
   */
  scan(path: string): Promise<Project[]>;
}
