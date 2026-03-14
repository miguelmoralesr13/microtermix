import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'monospace',
    themeVariables: {
        primaryColor: '#0f172a',
        primaryTextColor: '#fff',
        primaryBorderColor: '#38bdf8',
        lineColor: '#94a3b8',
        secondaryColor: '#1e293b',
        tertiaryColor: '#020617'
    }
});

interface MermaidRendererProps {
    chart: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current && chart) {
            containerRef.current.removeAttribute('data-processed');
            mermaid.contentLoaded();
            
            // Generate a unique ID for each render
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
            
            mermaid.render(id, chart).then(({ svg }) => {
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            }).catch(err => {
                console.error("Mermaid render error:", err);
            });
        }
    }, [chart]);

    return (
        <div 
            ref={containerRef} 
            className="mermaid flex items-center justify-center w-full h-full overflow-auto bg-slate-950/50 rounded-lg p-4"
        />
    );
};
