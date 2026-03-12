import React, { useState, useRef, useEffect } from 'react';

interface VariableInputProps {
    value: string;
    onChange: (val: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    placeholder?: string;
    availableVariables?: string[];
    className?: string;
    containerClassName?: string;
}

export const VariableInput: React.FC<VariableInputProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    availableVariables = [],
    className = "",
    containerClassName = "flex-1"
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [cursorPos, setCursorPos] = useState(0);
    const [suggestionFilter, setSuggestionFilter] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Detect if we are inside a {{ }} or just typed {{
    useEffect(() => {
        const textBeforeCursor = value.slice(0, cursorPos);
        const lastOpen = textBeforeCursor.lastIndexOf('{{');
        const lastClose = textBeforeCursor.lastIndexOf('}}');

        if (lastOpen !== -1 && lastOpen > lastClose) {
            const query = textBeforeCursor.slice(lastOpen + 2);
            setSuggestionFilter(query);
            setShowSuggestions(true);
            setSelectedIndex(0);
        } else {
            setShowSuggestions(false);
        }
    }, [value, cursorPos]);

    const filteredVars = availableVariables.filter(v => 
        v.toLowerCase().includes(suggestionFilter.toLowerCase())
    );

    const insertVariable = (varName: string) => {
        const textBeforeCursor = value.slice(0, cursorPos);
        const textAfterCursor = value.slice(cursorPos);
        const lastOpen = textBeforeCursor.lastIndexOf('{{');
        
        const newValue = value.slice(0, lastOpen + 2) + varName + '}}' + textAfterCursor;
        onChange(newValue);
        setShowSuggestions(false);
        
        // Refocus and move cursor
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const newPos = lastOpen + 2 + varName.length + 2;
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showSuggestions && filteredVars.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filteredVars.length);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filteredVars.length) % filteredVars.length);
                return;
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertVariable(filteredVars[selectedIndex]);
                return;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowSuggestions(false);
                return;
            }
        }
        
        // Pass to parent if not consumed
        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    // Simple highlighting by rendering a div behind the input
    // This is hard to get 100% pixel-perfect with scrolling, so we'll use a styled input
    // and maybe just highlight the brackets via a background color logic if we were using a contentEditable.
    // For now, let's keep it simple: A nice input with a floating suggestion list.

    return (
        <div className={`relative flex items-center ${containerClassName}`}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setCursorPos(e.target.selectionStart || 0);
                }}
                onKeyUp={(e: any) => setCursorPos(e.target.selectionStart || 0)}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder={placeholder}
                className={`w-full bg-slate-950/50 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-nexus-neon transition-all hover:bg-slate-900/80 font-mono ${className}`}
            />

            {showSuggestions && filteredVars.length > 0 && (
                <div className="absolute top-full left-0 z-[100] mt-1 w-64 bg-slate-900 border border-slate-700 rounded-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="p-2 border-b border-slate-800 bg-slate-950/50 flex flex-col gap-0.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Environment Variables</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                        {filteredVars.map((v, i) => (
                            <button
                                key={v}
                                onClick={() => insertVariable(v)}
                                onMouseEnter={() => setSelectedIndex(i)}
                                className={`w-full text-left px-3 py-2 text-xs rounded flex items-center justify-between transition-colors ${i === selectedIndex ? 'bg-nexus-neon text-slate-900 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className={i === selectedIndex ? 'text-slate-900' : 'text-nexus-neon'}>{"{{"}</span>
                                    {v}
                                    <span className={i === selectedIndex ? 'text-slate-900' : 'text-nexus-neon'}>{"}}"}</span>
                                </span>
                                {i === selectedIndex && <span className="text-[9px] uppercase tracking-tighter opacity-70">Press Enter</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
