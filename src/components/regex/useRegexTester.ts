import { useState, useMemo } from 'react';

export interface RegexMatch {
    index: number;
    value: string;
    groups: (string | undefined)[];
}

export interface RegexResult {
    matches: RegexMatch[];
    error: string | null;
    execTimeMs: number;
}

export function useRegexTester() {
    const [pattern, setPattern] = useState('');
    const [flags, setFlags] = useState('g');
    const [testText, setTestText] = useState('');
    
    const result = useMemo<RegexResult>(() => {
        if (!pattern) return { matches: [], error: null, execTimeMs: 0 };
        
        const startTime = performance.now();
        try {
            const regex = new RegExp(pattern, flags);
            const matches: RegexMatch[] = [];
            
            if (flags.includes('g')) {
                let match;
                let iterations = 0;
                // Safety break for infinite loops with empty matches
                while ((match = regex.exec(testText)) !== null && iterations < 10000) {
                    matches.push({
                        index: match.index,
                        value: match[0],
                        groups: Array.from(match),
                    });
                    if (match.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                    iterations++;
                }
            } else {
                const match = regex.exec(testText);
                if (match) {
                    matches.push({
                        index: match.index,
                        value: match[0],
                        groups: Array.from(match),
                    });
                }
            }
            
            return {
                matches,
                error: null,
                execTimeMs: performance.now() - startTime,
            };
        } catch (e: any) {
            return {
                matches: [],
                error: e.message,
                execTimeMs: performance.now() - startTime,
            };
        }
    }, [pattern, flags, testText]);

    return {
        pattern,
        setPattern,
        flags,
        setFlags,
        testText,
        setTestText,
        result,
    };
}
