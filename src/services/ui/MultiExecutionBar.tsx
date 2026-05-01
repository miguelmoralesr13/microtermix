import React, { useMemo } from 'react';
import { Play, Square, RotateCcw, Coffee, Terminal } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components//ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components//ui/tooltip';
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
    selectedCount,
    activeSelectionType,
}) => {
    const disabled = selectedCount === 0;
    const { state } = useWorkspace();

    const filteredSavedNames = useMemo(() => {
        return Object.keys(state.savedCommands || {}).filter(name => {
            const savedType = state.savedCommandTypes?.[name];
            if (!savedType) return true;
            return savedType === activeSelectionType;
        });
    }, [state.savedCommands, state.savedCommandTypes, activeSelectionType]);

    const extendedScripts = useMemo(() => {
        let list = [...new Set([...allScripts, ...filteredSavedNames])];

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
                if (forbiddenKeywords.some(kw => slc.includes(kw))) return false;
                return true;
            });
        }

        if (multiScript && !list.includes(multiScript)) {
            list.push(multiScript);
        }
        return list;
    }, [allScripts, filteredSavedNames, activeSelectionType, multiScript]);

    const isJava = activeSelectionType === 'java';

    return (
        <div className={`border-b border-slate-800/60 px-2 py-1.5 shrink-0 transition-colors ${isJava ? 'bg-orange-500/5 border-orange-500/20' : 'bg-slate-900/80'}`}>
            <TooltipProvider delay={400}>
                <div className="flex items-center gap-1.5">
                    {/* Type badge */}
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/60 border border-slate-800/50 shrink-0">
                        {isJava ? (
                            <Coffee size={10} className="text-orange-400" />
                        ) : (
                            <Terminal size={10} className="text-microtermix-neon" />
                        )}
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                            {activeSelectionType || 'All'}
                        </span>
                    </div>

                    {/* Script select */}
                    <Select value={multiScript || undefined} onValueChange={(v) => v != null && onScriptChange(v)}>
                        <SelectTrigger size="sm" className={`h-6 w-48 text-[11px] ${isJava ? 'border-orange-500/30 text-orange-400' : ''}`}>
                            <SelectValue placeholder="Script" />
                        </SelectTrigger>
                        <SelectContent>
                            {extendedScripts.map((s: string) => (
                                <SelectItem key={s} value={s} className="font-mono text-[11px]">{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Env select */}
                    <Select value={globalEnvName} onValueChange={(v) => v != null && onEnvChange(v)}>
                        <SelectTrigger size="sm" className="h-6 w-20 text-[11px]">
                            <SelectValue placeholder="ENV" />
                        </SelectTrigger>
                        <SelectContent>
                            {allEnvs.map(env => (
                                <SelectItem key={env} value={env}>{env === 'none' ? 'None' : env}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Execution buttons */}
                    <div className="flex items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="ghost" size="sm" disabled={disabled} onClick={onPlay}
                                    className="h-6 px-2 bg-microtermix-neon/10 text-microtermix-neon hover:bg-microtermix-neon/20 border border-microtermix-neon/30 hover:border-microtermix-neon/60 gap-1 text-[10px]" />
                            }>
                                <Play size={11} />
                                <span>Run</span>
                                {selectedCount > 0 && (
                                    <span className="bg-microtermix-neon text-slate-900 text-[9px] font-bold px-1 py-0 rounded-full leading-tight">
                                        {selectedCount}
                                    </span>
                                )}
                            </TooltipTrigger>
                            <TooltipContent>Ejecutar en proyectos seleccionados</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="destructive" size="icon-xs" disabled={disabled} onClick={onStop}
                                    className="h-6 w-6" />
                            }>
                                <Square size={11} />
                            </TooltipTrigger>
                            <TooltipContent>Parar todos</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger render={
                                <Button variant="outline" size="icon-xs" disabled={disabled} onClick={onRestart}
                                    className="h-6 w-6 text-slate-400 hover:text-white" />
                            }>
                                <RotateCcw size={11} />
                            </TooltipTrigger>
                            <TooltipContent>Reiniciar todos</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </TooltipProvider>
        </div>
    );
};
