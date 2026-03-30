
export interface ScriptProcessor {
    process(script: string, envString: string, javaPropsString: string): string;
}

class NodeScriptProcessor implements ScriptProcessor {
    process(script: string, envString: string): string {
        let builtScript = script;
        if (builtScript.includes('{{ENVS}}') && !builtScript.includes('cross-env') && envString) {
            builtScript = builtScript.replace(/\{\{ENVS\}\}/g, `npx cross-env ${envString}`);
        } else {
            builtScript = builtScript.replace(/\{\{ENVS\}\}/g, envString);
        }
        return builtScript;
    }
}

class JavaScriptProcessor implements ScriptProcessor {
    process(script: string, _envString: string, javaPropsString: string): string {
        let builtScript = script;
        if (builtScript.includes('{{ENVS}}')) {
            const firstWord = builtScript.trim().split(' ')[0];
            if (['mvn', 'gradle', './gradlew', 'gradlew.bat'].includes(firstWord)) {
                builtScript = builtScript.replace(firstWord, `${firstWord} ${javaPropsString}`);
            } else {
                builtScript = builtScript.replace(/\{\{ENVS\}\}/g, javaPropsString);
            }
        }
        return builtScript;
    }
}

class PythonScriptProcessor implements ScriptProcessor {
    process(script: string, envString: string): string {
        if (script.includes('{{ENVS}}')) {
            return script.replace(/\{\{ENVS\}\}/g, envString);
        }
        return script;
    }
}

class GenericScriptProcessor implements ScriptProcessor {
    process(script: string, envString: string): string {
        if (script.includes('{{ENVS}}')) {
            return script.replace(/\{\{ENVS\}\}/g, envString);
        }
        return script;
    }
}

export class ScriptProcessorFactory {
    static getProcessor(projectType?: string): ScriptProcessor {
        switch (projectType) {
            case 'node':
            case 'bun':
                return new NodeScriptProcessor();
            case 'java':
                return new JavaScriptProcessor();
            case 'python':
                return new PythonScriptProcessor();
            default:
                return new GenericScriptProcessor();
        }
    }
}

/**
 * Realiza la limpieza final de marcadores para todos los lenguajes.
 */
export function finalizeBuiltScript(builtScript: string): string {
    return builtScript.replace(/npx\s+cross-env\s+\{\{ENVS\}\}\s*/g, '')
        .replace(/cross-env\s+\{\{ENVS\}\}\s*/g, '')
        .replace(/\{\{ENVS\}\}\s*/g, '').trim();
}
