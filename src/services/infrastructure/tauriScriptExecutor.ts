import { invoke } from '@tauri-apps/api/core';
import type { ScriptExecutorPort, ScriptExecutionConfig } from '../application/ports/ScriptExecutorPort';

/**
 * Tauri adapter for script execution.
 * Implements ScriptExecutorPort by invoking Tauri commands.
 * Logs stream via Tauri events (service-logs), not via return value.
 */
export class TauriScriptExecutor implements ScriptExecutorPort {
  async execute(config: ScriptExecutionConfig): Promise<void> {
    await invoke('execute_service_script', {
      serviceId: config.serviceId,
      projectPath: config.projectPath,
      script: config.script,
      envVarsJson: config.envVarsJson,
      scriptDisplay: config.scriptDisplay,
      useViteWrapper: config.useViteWrapper,
      viteWrapperRemotes: config.viteWrapperRemotes,
      viteWrapperBase: config.viteWrapperBase,
      viteWrapperSourcemap: config.viteWrapperSourcemap,
      viteWrapperHost: config.viteWrapperHost,
      customJavaHome: config.customJavaHome,
    });
  }
}
