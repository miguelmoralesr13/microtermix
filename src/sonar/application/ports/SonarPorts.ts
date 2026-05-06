/**
 * Application ports — interfaces that define what the Sonar domain needs.
 * Infrastructure layer implements these.
 */
import type { SonarAccount } from '../../domain/SonarAccount';
import type { SonarMetrics, SonarIssue, SonarLocalConfig } from '../../domain/SonarMetrics';
import type { SonarRule } from '../../domain/SonarRule';

/**
 * Port for fetching SonarQube metrics and issues.
 */
export interface SonarApiPort {
  fetchMetrics(
    projectKey: string,
    account: SonarAccount,
    token: string,
  ): Promise<SonarMetrics>;

  fetchIssues(
    projectKey: string,
    account: SonarAccount,
    token: string,
  ): Promise<SonarIssue[]>;

  fetchRules(
    account: SonarAccount,
    token: string,
    projectKey?: string,
    query?: string,
  ): Promise<SonarRule[]>;

  searchProjects(
    query: string,
    account: SonarAccount,
  ): Promise<Array<{ key: string; name: string }>>;
}

/**
 * Port for reading local project configuration files.
 */
export interface SonarConfigPort {
  readTextFile(path: string): Promise<string>;

  readProjectSonarConfig(
    projectPath: string,
    propertiesFileName?: string,
  ): Promise<SonarLocalConfig>;
}

/**
 * Port for executing Sonar scanner commands.
 */
export interface SonarScannerPort {
  executeCommand(
    command: string,
    workingDir: string,
    envVars: Record<string, string>,
    onOutput: (line: string, isError: boolean) => void,
  ): Promise<{ exitCode: number }>;
}
