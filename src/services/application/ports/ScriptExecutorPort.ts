/**
 * Configuration for executing a project script.
 */
export interface ScriptExecutionConfig {
  serviceId: string;
  projectPath: string;
  script: string;
  envVarsJson: string;
  scriptDisplay?: string;
  useViteWrapper?: boolean;
  viteWrapperRemotes?: Record<string, string>;
  viteWrapperBase?: string;
  viteWrapperSourcemap?: boolean;
  viteWrapperHost?: string;
  customJavaHome?: string;
}

/**
 * Port interface for executing project scripts.
 * Implemented by infrastructure layer (Tauri adapter).
 */
export interface ScriptExecutorPort {
  /**
   * Executes a project script as an async child process.
   * Logs stream via Tauri events (service-logs).
   */
  execute(config: ScriptExecutionConfig): Promise<void>;
}
