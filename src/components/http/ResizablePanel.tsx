import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelProps {
    direction: 'horizontal' | 'vertical';
    initialSize: number;
    minSize?: number;
    children: [React.ReactNode, React.ReactNode];
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
    direction,
    initialSize,
    minSize = 100,
    children,
}) => {
    const [size, setSize] = useState(initialSize);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            let newSize = 0;
            if (direction === 'horizontal') {
                newSize = e.clientX - containerRect.left;
            } else {
                newSize = e.clientY - containerRect.top;
            }
            if (newSize < minSize) newSize = minSize;

            const maxSize = direction === 'horizontal' ? containerRect.width - minSize : containerRect.height - minSize;
            if (newSize > maxSize) newSize = maxSize;

            setSize(newSize);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [direction, minSize]);

    const handleMouseDown = () => {
        isDragging.current = true;
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    };

    return (
        <div ref={containerRef} className={`flex w-full h-full overflow-hidden ${direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
            <div style={{ flexBasis: `${size}px`, flexShrink: 0, overflow: 'hidden' }}>
                {children[0]}
            </div>

            <div
                onMouseDown={handleMouseDown}
                className={`transition-colors hover:bg-microtermix-neon/50 z-10
                    ${direction === 'horizontal'
                        ? 'w-1 cursor-col-resize hover:w-1 bg-slate-800'
                        : 'h-1 cursor-row-resize hover:h-1 bg-slate-800'
                    }`}
            />

            <div className="flex-1 overflow-hidden">
                {children[1]}
            </div>
        </div>
    );
};
