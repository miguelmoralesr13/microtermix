/**
 * Value object representing a parsed script command.
 * Immutable — all mutations return a new instance.
 */
export interface ScriptCommand {
  readonly raw: string;
  readonly hasEnvsPlaceholder: boolean;
  readonly projectType: string;
}

/**
 * Creates a ScriptCommand from a raw script string.
 */
export function createScriptCommand(
  raw: string,
  projectType: string,
): ScriptCommand {
  return {
    raw,
    hasEnvsPlaceholder: raw.includes('{{ENVS}}'),
    projectType,
  };
}

/**
 * Checks if a script name is a saved command alias vs an actual script.
 * Saved commands typically don't contain spaces or common script patterns.
 */
export function isSavedCommandAlias(name: string): boolean {
  return !name.includes(' ') && !name.startsWith('npm') && !name.startsWith('yarn') && !name.startsWith('bun') && !name.startsWith('npx');
}
