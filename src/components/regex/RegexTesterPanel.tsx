import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { 
    Regex, 
    Copy, 
    Check, 
    AlertCircle, 
    Clock, 
    BookOpen,
    Search
} from 'lucide-react';
import { useRegexTester } from './useRegexTester';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const REGEX_LIBRARY = [
    { label: 'Email', value: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
    { label: 'URL', value: 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)' },
    { label: 'IPv4', value: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$' },
    { label: 'UUID', value: '^[0-9a-fA-F]{8}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{12}$' },
    { label: 'Date (YYYY-MM-DD)', value: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' },
];

export const RegexTesterPanel: React.FC = () => {
    const { 
        pattern, setPattern, 
        flags, setFlags, 
        testText, setTestText, 
        result 
    } = useRegexTester();
    
    const monacoTheme = useMonacoTheme();
    const [copied, setCopied] = useState(false);

    const handleCopyPattern = () => {
        navigator.clipboard.writeText(`/${pattern}/${flags}`);
        setCopied(true);
        toast.success('Regex copiado');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <Regex size={18} className="text-pink-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Regex Laboratory</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        {result.execTimeMs.toFixed(2)}ms
                    </div>
                    <Button variant="ghost" size="xs" className="h-7 text-xs gap-1.5" onClick={handleCopyPattern}>
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        Copy Regex
                    </Button>
                </div>
            </div>

            {/* Config Bar */}
            <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">/</span>
                        <Input 
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder="regex pattern here..."
                            className="pl-6 pr-12 font-mono text-sm bg-slate-950 border-slate-800 focus:border-pink-500/50"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">/</span>
                    </div>
                    <div className="w-24 relative group">
                        <Input 
                            value={flags}
                            onChange={e => setFlags(e.target.value)}
                            placeholder="flags"
                            className="font-mono text-sm bg-slate-950 border-slate-800 focus:border-pink-500/50"
                        />
                        <div className="absolute top-full left-0 mt-1 hidden group-focus-within:block z-50 p-2 bg-slate-800 border border-slate-700 rounded-md text-[10px] text-slate-400 w-48 shadow-xl">
                            g: global, i: ignore case, m: multiline, s: dotall, u: unicode, y: sticky
                        </div>
                    </div>
                </div>

                {/* Library Chips */}
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider mr-2">
                        <BookOpen size={12} /> Library:
                    </div>
                    {REGEX_LIBRARY.map(item => (
                        <Badge 
                            key={item.label}
                            variant="outline"
                            className="cursor-pointer hover:bg-slate-800 transition-colors text-[10px] py-0.5 border-slate-700 text-slate-400"
                            onClick={() => setPattern(item.value)}
                        >
                            {item.label}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Error Message if any */}
            {result.error && (
                <div className="shrink-0 px-4 py-2 bg-rose-950/40 border-b border-rose-800/50 flex items-center gap-2 text-rose-400 text-xs font-medium">
                    <AlertCircle size={14} /> {result.error}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                {/* Input Area */}
                <div className="flex-1 min-w-0 border-r border-slate-800 flex flex-col">
                    <div className="shrink-0 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/30 border-b border-slate-800">
                        Test Text
                    </div>
                    <div className="flex-1 min-h-0 relative">
                        <Editor 
                            height="100%"
                            defaultLanguage="plaintext"
                            theme={monacoTheme}
                            value={testText}
                            onChange={(v) => setTestText(v ?? '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: 'on',
                                padding: { top: 12 },
                                scrollBeyondLastLine: false,
                                wordWrap: 'on'
                            }}
                        />
                    </div>
                </div>

                {/* Results Area */}
                <div className="w-full lg:w-96 shrink-0 flex flex-col bg-slate-950/20">
                    <div className="shrink-0 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/30 border-b border-slate-800 flex items-center justify-between">
                        <span>Matches ({result.matches.length})</span>
                        <div className="flex items-center gap-1">
                            <Clock size={10} />
                            <span>{result.execTimeMs.toFixed(2)}ms</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-3 space-y-3">
                            {result.matches.map((match, i) => (
                                <div key={i} className="group rounded-md border border-slate-800 bg-slate-900/50 overflow-hidden">
                                    <div className="px-2 py-1 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-mono text-pink-400">Match {i + 1}</span>
                                        <span className="text-[9px] text-slate-500 font-mono">Index: {match.index}</span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        <div className="text-[11px] font-mono text-slate-200 bg-slate-950 p-1.5 rounded border border-slate-800/50 break-all">
                                            {match.value}
                                        </div>
                                        
                                        {match.groups.length > 1 && (
                                            <div className="space-y-1">
                                                <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Captures</div>
                                                <div className="space-y-1">
                                                    {match.groups.slice(1).map((group, gi) => (
                                                        <div key={gi} className="flex gap-2 items-start text-[10px]">
                                                            <span className="text-slate-500 shrink-0 tabular-nums">Group {gi + 1}:</span>
                                                            <span className="text-slate-300 font-mono break-all bg-slate-950/50 px-1 rounded">
                                                                {group ?? <span className="text-slate-600 italic">null</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {result.matches.length === 0 && !result.error && pattern && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-600 italic text-center">
                                    <Search size={24} className="mb-2 opacity-20" />
                                    <p className="text-xs">No matches found</p>
                                </div>
                            )}

                            {!pattern && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-600 italic text-center">
                                    <Regex size={24} className="mb-2 opacity-20" />
                                    <p className="text-xs">Enter a pattern to see results</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
