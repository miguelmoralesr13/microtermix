import React, { useState, useMemo } from 'react';
import { Play, Square, RotateCcw, FileCode, Wand2, Coffee, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
    activeSelectionType: string | null;
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
    activeSelectionType,
}) => {
    const disabled = selectedCount === 0;
    const [builderOpen, setBuilderOpen] = useState(false);
    const { state, addSavedCommand } = useWorkspace();

    const filteredSavedNames = useMemo(() => {
        return Object.keys(state.savedCommands || {}).filter(name => {
            const savedType = state.savedCommandTypes?.[name];
            if (!savedType) return true; // Global
            return savedType === activeSelectionType;
        });
    }, [state.savedCommands, state.savedCommandTypes, activeSelectionType]);

    const extendedScripts = useMemo(() => {
        let list = [...new Set([...allScripts, ...filteredSavedNames])];
        
        // Smart Filter by Active Selection Type
        if (activeSelectionType === 'java') {
            const javaKeywords = ['mvn', 'gradle', 'java', 'javac', 'jar', 'spring-boot', 'bootRun'];
            list = list.filter(s => {
                const slc = s.toLowerCase();
                return javaKeywords.some(kw => slc.includes(kw));
            });
        } else if (activeSelectionType === 'node' || activeSelectionType === 'bun') {
            const forbiddenKeywords = ['mvn', 'gradle', './gradlew', 'java -jar', 'javac', 'spring-boot', 'bootRun'];
            
            list = list.filter(s => {
                const slc = s.toLowerCase();
                // Hide Java stuff explicitly
                if (forbiddenKeywords.some(kw => slc.includes(kw))) return false;
                return true;
            });
        }
        
        if (multiScript && !list.includes(multiScript)) {
            list.push(multiScript);
        }
        return list;
    }, [allScripts, filteredSavedNames, activeSelectionType, multiScript]);

    return (
        <div className={`bg-slate-900 border-b border-slate-800 px-3 py-2 shrink-0 transition-colors ${activeSelectionType === 'java' ? 'bg-orange-500/5 border-orange-500/20' : ''}`}>
            <TooltipProvider delay={400}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 shrink-0">
                    {activeSelectionType === 'java' ? (
                        <Coffee size={12} className="text-orange-400" />
                    ) : (
                        <Terminal size={12} className="text-nexus-neon" />
                    )}
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                        {activeSelectionType || 'General'}
                    </span>
                </div>

                <Select value={multiScript || undefined} onValueChange={(v) => v != null && onScriptChange(v)}>
                    <SelectTrigger size="sm" className={`w-56 ${activeSelectionType === 'java' ? 'border-orange-500/30 text-orange-400' : ''}`}>
                        <SelectValue placeholder="Comando por lote" />
                    </SelectTrigger>
                    <SelectContent>
                        {extendedScripts.map((s: string) => (
                            <SelectItem key={s} value={s} className="font-mono text-[11px]">{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Tooltip>
                    <TooltipTrigger render={
                        <Button variant="outline" size="icon-sm" onClick={() => setBuilderOpen(true)}
                            className="text-slate-400 hover:text-nexus-neon hover:border-nexus-neon/50" />
                    }>
                        <Wand2 size={14} />
                    </TooltipTrigger>
                    <TooltipContent>Command Builder</TooltipContent>
                </Tooltip>

                <Select value={globalEnvName} onValueChange={(v) => v != null && onEnvChange(v)}>
                    <SelectTrigger size="sm" className="w-24">
                        <SelectValue placeholder="ENV" />
                    </SelectTrigger>
                    <SelectContent>
                        {allEnvs.map(env => (
                            <SelectItem key={env} value={env}>{env === 'none' ? 'None' : env}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Separator orientation="vertical" className="h-6 mx-1" />

                <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="ghost" size="sm" disabled={disabled} onClick={onPlay}
                                    className="bg-nexus-neon/10 text-nexus-neon hover:bg-nexus-neon/20 border border-nexus-neon/30 hover:border-nexus-neon/60 gap-1.5" />
                            }>
                                <Play size={13} />
                                <span>Run</span>
                                {selectedCount > 0 && (
                                    <span className="ml-0.5 bg-nexus-neon text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                                        {selectedCount}
                                    </span>
                                )}
                            </TooltipTrigger>
                            <TooltipContent>Ejecutar en proyectos seleccionados</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="destructive" size="icon-sm" disabled={disabled} onClick={onStop} />
                            }>
                                <Square size={13} />
                            </TooltipTrigger>
                            <TooltipContent>Parar todos</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="outline" size="icon-sm" disabled={disabled} onClick={onRestart}
                                    className="text-slate-300 hover:text-white" />
                            }>
                                <RotateCcw size={13} />
                            </TooltipTrigger>
                            <TooltipContent>Reiniciar todos</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="ghost" size="icon-sm" onClick={onOpenViteWrapper}
                                    className="text-slate-400 hover:text-nexus-neon" />
                            }>
                                <FileCode size={13} />
                            </TooltipTrigger>
                            <TooltipContent>Vite wrapper (remotes MFE)</TooltipContent>
                        </Tooltip>
                </div>
            </div>
            </TooltipProvider>

            <CommandBuilderModal
                open={builderOpen}
                onOpenChange={setBuilderOpen}
                onSave={(name, cmd, steps, projectType) => {
                    addSavedCommand(name, cmd, steps, projectType);
                    onScriptChange(name);
                    setBuilderOpen(false);
                }}
            />
        </div>
    );
};
