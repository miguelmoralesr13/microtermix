import React, { useState, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSquare } from 'lucide-react';
import { Terminal } from '@/components/ui/terminal';
import { TERMINAL_PREFIXES } from '../ui/terminal/terminal.constants';

interface GitConsoleProps {
    projectPath: string;
}

export const GitConsole: React.FC<GitConsoleProps> = ({ projectPath }) => {
    const [terminalHeight, setTerminalHeight] = useState(256);
    // Trackeamos los comandos enviados por el usuario para no filtrarlos
    const userCommandsRef = useRef<Set<string>>(new Set());

    // El nombre de la carpeta actual para el prompt
    const projectName = useMemo(() => projectPath.split(/[/\\]/).filter(Boolean).pop() || 'repo', [projectPath]);

    const handleCommand = useCallback(async (cmd: string) => {
        if (!cmd.trim()) return;

        // Parsear comando
        const cleanCmd = cmd.trim();
        const fullCmd = cleanCmd.startsWith('git ') ? cleanCmd : `git ${cleanCmd}`;
        const args = fullCmd.split(' ').slice(1);

        // Registrar como comando de usuario para evitar el filtro
        userCommandsRef.current.add(fullCmd);

        try {
            await invoke('git_execute', { 
                projectPath, 
                args 
            });
        } catch (e) {
            console.error('[GitConsole] Error executing command:', e);
            userCommandsRef.current.delete(fullCmd);
        }
    }, [projectPath]);

    const terminalEvents = useMemo(() => [
        {
            event: 'git-log',
            prefix: TERMINAL_PREFIXES.GIT,
            format: (payload: any) => {
                const { command, stdout, stderr } = payload;
                
                const NOISY_INTERNAL = ['git config', 'git rev-parse', 'git show'];
                const isNoisy = NOISY_INTERNAL.some(noisy => command.startsWith(noisy));
                const isCommon = ['git status', 'git branch'].some(c => command.startsWith(c));
                
                let isUserInitiated = userCommandsRef.current.has(command);
                
                if (isUserInitiated) {
                    userCommandsRef.current.delete(command);
                } else {
                    if (isNoisy && !stderr) return null;
                    if (isCommon && !stderr) return null;
                }

                let output = `\x1b[38;5;39m➜\x1b[0m \x1b[1m${command}\x1b[0m\n`;
                if (stdout.trim()) output += `\x1b[38;5;250m${stdout.trim()}\x1b[0m\n`;
                if (stderr.trim()) output += `\x1b[31m${stderr.trim()}\x1b[0m\n`;
                
                return output;
            }
        }
    ], []);

    return (
        <Terminal
            mode="log-stream"
            variant="panel"
            title="Git Terminal"
            icon={<TerminalSquare size={14} />}
            projectPath={projectPath}
            resizable={true}
            height={terminalHeight}
            onHeightChange={setTerminalHeight}
            className="z-10 shadow-2xl shadow-black"
            onCommand={handleCommand}
            commandPrompt={projectName} /* Mostramos el nombre del repo en el input */
            events={terminalEvents}
        />
    );
};
