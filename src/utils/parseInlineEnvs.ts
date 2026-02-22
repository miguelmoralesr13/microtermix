/**
 * Parsea un comando que puede tener variables inline al inicio (estilo shell):
 * PORT=4000 API_KEY=abc12345 npx nodemon index.js
 * Devuelve las env extraídas y el comando restante para ejecutar.
 */
export function parseInlineEnvs(script: string): { env: Record<string, string>; command: string } {
  const env: Record<string, string> = {};
  let rest = script.trim();
  if (!rest) return { env, command: '' };

  while (rest.length > 0) {
    const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(\S+))\s*/);
    if (!match) break;
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    env[key] = value;
    rest = rest.slice(match[0].length).trim();
  }

  return { env, command: rest };
}

/**
 * Parsea varios comandos y devuelve un único Record con todas las env encontradas
 * (los últimos valores ganan si se repite la misma clave).
 */
export function parseInlineEnvsFromScripts(scripts: string[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const script of scripts) {
    const { env } = parseInlineEnvs(script);
    Object.assign(merged, env);
  }
  return merged;
}
