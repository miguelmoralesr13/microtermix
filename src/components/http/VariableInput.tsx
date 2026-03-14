import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VariableInputProps {
    value: string;
    onChange: (val: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    className?: string; // class for the input itself
    containerClassName?: string; // class for the wrapper div
    availableVariables: string[];
}

export const VariableInput: React.FC<VariableInputProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    className,
    containerClassName,
    availableVariables = []
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [cursorPos, setCursorPos] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync suggestions when value or cursorPos changes
    useEffect(() => {
        const text = value || '';
        const textAfterCursor = text.substring(0, cursorPos);
        const match = textAfterCursor.match(/\{\{([^}]*)$/);

        if (match) {
            const query = match[1].toLowerCase();
            const filtered = availableVariables.filter(v => v.toLowerCase().includes(query));
            if (filtered.length > 0) {
                setSuggestions(filtered);
                setShowSuggestions(true);
                setSelectedIndex(0);
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    }, [value, cursorPos, availableVariables]);

    const handleSelectSuggestion = (suggestion: string) => {
        const text = value || '';
        const textBeforeCursor = text.substring(0, cursorPos);
        const textAfterCursor = text.substring(cursorPos);
        const lastBracesIdx = textBeforeCursor.lastIndexOf('{{');

        const newValue = textBeforeCursor.substring(0, lastBracesIdx + 2) + suggestion + '}}' + textAfterCursor;
        onChange(newValue);
        setShowSuggestions(false);

        // Return focus to input and move cursor after the inserted variable
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const newPos = lastBracesIdx + 2 + suggestion.length + 2;
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleSelectSuggestion(suggestions[selectedIndex]);
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        } else if (onKeyDown) {
            onKeyDown(e);
        }
    };

    // Helper to render colored variables
    const renderHighlighted = (text: string) => {
        if (!text) return null;
        const parts = text.split(/(\{\{[^}]*\}\})/g);
        return parts.map((part, i) => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                return <span key={i} className="text-microtermix-neon font-bold">{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <div className={cn("relative flex flex-col min-w-0", containerClassName || "flex-1")}>
            {/* The actual input */}
            <input
                ref={inputRef}
                type="text"
                value={value || ''}
                onChange={(e) => {
                    onChange(e.target.value);
                    setCursorPos(e.target.selectionStart || 0);
                }}
                onSelect={(e: any) => setCursorPos(e.target.selectionStart || 0)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || ''}
                className={cn(
                    "bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-transparent caret-white outline-none focus:border-microtermix-neon w-full font-mono",
                    className
                )}
            />

            {/* Overlay for highlighting (positioned exactly over input) */}
            <div className="absolute inset-0 pointer-events-none px-3 py-2 text-sm font-mono whitespace-nowrap overflow-hidden leading-[1.25rem] border border-transparent">
                {renderHighlighted(value || '')}
            </div>

            {/* Simple Suggestions Dropdown */}
            {showSuggestions && (
                <div className="absolute top-full left-0 z-[100] mt-1 bg-slate-900 border border-slate-700 rounded shadow-xl min-w-[150px] max-h-40 overflow-y-auto">
                    {suggestions.map((s, i) => (
                        <div
                            key={s}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectSuggestion(s);
                            }}
                            className={cn(
                                "px-3 py-2 text-xs cursor-pointer transition-colors",
                                i === selectedIndex ? "bg-microtermix-neon text-slate-900 font-bold" : "text-slate-300 hover:bg-slate-800"
                            )}
                        >
                            {s}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
