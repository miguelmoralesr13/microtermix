import { invoke } from '@tauri-apps/api/core';
import type { ProjectScannerPort } from '../application/ports/ProjectScannerPort';
import type { Project } from '../domain';

interface RustProject {
  name: string;
  path: string;
  project_type: string;
  framework?: string;
  build_system?: string;
  package_manager?: string;
  scripts: string[];
}

function mapRustProject(r: RustProject): Project {
  return {
    name: r.name,
    path: r.path,
    projectType: r.project_type as Project['projectType'],
    framework: r.framework,
    buildSystem: r.build_system,
    packageManager: r.package_manager,
    scripts: r.scripts,
  };
}

/**
 * Tauri adapter for project scanning.
 * Implements ProjectScannerPort by invoking Tauri commands.
 */
export class TauriProjectScanner implements ProjectScannerPort {
  async scan(path: string): Promise<Project[]> {
    const projects = await invoke<RustProject[]>('scan_projects', { rootPath: path });
    return projects.map(mapRustProject);
  }
}
