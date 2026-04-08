import { useRef } from 'react';
import { AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InvokerJsonEditorProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    minHeight?: string;
    className?: string;
}

export function InvokerJsonEditor({
    label,
    value,
    onChange,
    placeholder = '{\n  \n}',
    minHeight = '160px',
    className,
}: InvokerJsonEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isValidJson = (() => {
        if (!value.trim()) return true;
        try { JSON.parse(value); return true; } catch { return false; }
    })();

    const handleFormat = () => {
        try {
            onChange(JSON.stringify(JSON.parse(value), null, 2));
        } catch {
            // leave as-is if invalid
        }
    };

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleFormat}
                    disabled={!value.trim() || !isValidJson}
                    className="h-5 px-2 text-[10px] text-slate-500 hover:text-slate-200"
                >
                    <AlignLeft size={10} className="mr-1" /> Format
                </Button>
            </div>
            <div className={cn(
                'relative rounded-lg border font-mono text-xs transition-colors',
                isValidJson ? 'border-slate-800' : 'border-red-500/50',
            )}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    style={{ minHeight }}
                    className="w-full resize-none bg-slate-950/60 text-slate-200 placeholder-slate-700 p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-microtermix-neon/30 text-[12px] leading-relaxed font-mono"
                />
                {!isValidJson && (
                    <div className="absolute bottom-2 right-2 text-[9px] text-red-400 font-bold uppercase tracking-widest bg-red-950/80 px-2 py-0.5 rounded">
                        JSON inválido
                    </div>
                )}
            </div>
        </div>
    );
}
