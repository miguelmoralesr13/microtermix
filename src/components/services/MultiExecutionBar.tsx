import React, { useState } from 'react';
import { Play, Square, RotateCcw, FileCode, Wand2 } from 'lucide-react';
import { Select } from '../ui/NexusSelect';
import { Button } from '../ui/NexusButton';
import { CommandBuilderModal } from './CommandBuilderModal';
import { useWorkspace } from '../../context/WorkspaceContext';

interface MultiExecutionBarProps {
    allScripts: string[];
    multiScript: string;
    onScriptChange: (val: string) => void;
    allEnvs: string[];
    globalEnvName: string;
    onEnvChange: (val: string) => void;
    onPlay: () => void;
    onStop: () => void;
    onRestart: () => void;
    onOpenViteWrapper: () => void;
    selectedCount: number;
}

export const MultiExecutionBar: React.FC<MultiExecutionBarProps> = ({
    allScripts,
    multiScript,
    onScriptChange,
    allEnvs,
    globalEnvName,
    onEnvChange,
    onPlay,
    onStop,
    onRestart,
    onOpenViteWrapper,
    selectedCount,
}) => {
    const disabled = selectedCount === 0;
    const [builderOpen, setBuilderOpen] = useState(false);
    const { state, addSavedCommand } = useWorkspace();

    const savedNames = Object.keys(state.savedCommands || {});

    // The options should include:
    // 1. All standard package.json scripts
    // 2. All saved command names
    // 3. The current multiScript if it somehow isn't in either list
    const extendedScripts = [...new Set([...allScripts, ...savedNames])];
    if (multiScript && !extendedScripts.includes(multiScript)) {
        extendedScripts.push(multiScript);
    }

    return (
        <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    label="Comando"
                    value={multiScript}
                    onChange={(e) => onScriptChange(e.target.value)}
                    options={extendedScripts.map((s) => ({ value: s, label: s }))}
                    className="w-40"
                />
                <button
                    onClick={() => setBuilderOpen(true)}
                    className="p-1.5 bg-slate-800 border border-slate-700 hover:border-nexus-neon text-slate-400 hover:text-nexus-neon rounded transition-colors"
                    title="Command Builder"
                >
                    <Wand2 size={16} />
                </button>
                <Select
                    label="ENV"
                    value={globalEnvName}
                    title={`Fallback env: ${globalEnvName}`}
                    onChange={(e) => onEnvChange(e.target.value)}
                    options={allEnvs.map((env) => ({ value: env, label: env === 'none' ? 'None' : env }))}
                    className="w-20 capitalize"
                />
                <div className="flex items-center gap-1 ml-1 border-l border-slate-700 pl-2">
                    <Button
                        variant="success"
                        size="sm"
                        disabled={disabled}
                        onClick={onPlay}
                        icon={Play}
                        title="Ejecutar en proyectos seleccionados"
                    >
                        <span>Run ({selectedCount})</span>
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        disabled={disabled}
                        onClick={onStop}
                        icon={Square}
                        title="Parar"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={onRestart}
                        icon={RotateCcw}
                        className="bg-slate-700 text-slate-100 hover:bg-slate-600"
                        title="Reiniciar"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenViteWrapper}
                        icon={FileCode}
                        className="text-slate-400 hover:text-nexus-neon hover:border-nexus-neon/50"
                        title="Vite wrapper (remotes MFE)"
                    />
                </div>
            </div>

            {builderOpen && (
                <CommandBuilderModal
                    onClose={() => setBuilderOpen(false)}
                    onSave={(name, cmd, steps) => {
                        addSavedCommand(name, cmd, steps);
                        onScriptChange(name);
                        setBuilderOpen(false);
                    }}
                />
            )}
        </div>
    );
};
