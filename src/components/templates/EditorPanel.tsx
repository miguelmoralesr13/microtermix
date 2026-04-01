import React from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '../../hooks/useMonacoTheme';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

interface EditorPanelProps {
    title: string;
    icon: LucideIcon;
    value: string;
    onChange?: (val: string | undefined) => void;
    language: string;
    readOnly?: boolean;
    headerRight?: React.ReactNode;
    footerRight?: React.ReactNode;
    className?: string;
    isLoading?: boolean;
    loadingTitle?: string;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
    title,
    icon: Icon,
    value,
    onChange,
    language,
    readOnly = false,
    headerRight,
    footerRight,
    className,
    isLoading = false,
    loadingTitle = 'Cargando...',
}) => {
    const monacoTheme = useMonacoTheme();

    return (
        <div className={cn("flex flex-col h-full bg-slate-900/20 border-r border-white/5", className)}>
            {/* Header */}
            <div className="shrink-0 h-10 px-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">{title}</span>
                </div>
                <div className="flex items-center gap-3">
                    {isLoading && (
                        <div className="text-[9px] font-black text-microtermix-neon animate-pulse uppercase tracking-widest">
                            {loadingTitle}
                        </div>
                    )}
                    {headerRight}
                </div>
            </div>

            {/* Editor Container */}
            <div className="flex-1 relative overflow-hidden group">
                <Editor
                    height="100%"
                    language={language}
                    theme={monacoTheme}
                    value={value}
                    onChange={onChange}
                    options={{
                        fontSize: 12,
                        fontFamily: 'JetBrains Mono, monospace',
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbersMinChars: 3,
                        backgroundColor: 'transparent',
                        padding: { top: 16 },
                        readOnly,
                        automaticLayout: true,
                        wordWrap: 'on'
                    }}
                />
                
                {/* Visual Overlay for Loaders or State */}
                {isLoading && (
                    <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] pointer-events-none z-10 flex items-center justify-center">
                        <div className="w-1 h-1 bg-microtermix-neon rounded-full animate-ping" />
                    </div>
                )}
            </div>

            {/* Optional Footer */}
            {footerRight && (
                <div className="shrink-0 h-8 px-4 border-t border-white/5 flex items-center justify-end bg-black/10">
                    {footerRight}
                </div>
            )}
        </div>
    );
};
