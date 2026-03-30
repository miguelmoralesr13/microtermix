import React, { useCallback, useEffect, useState } from 'react';

interface ResizableDividerProps {
    onResize: (delta: number) => void;
    direction: 'horizontal' | 'vertical';
    className?: string;
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({ onResize, direction, className = '' }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = direction === 'horizontal' ? e.movementX : e.movementY;
            onResize(delta);
        };

        const handleMouseUp = () => setIsDragging(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, direction, onResize]);

    const isVertical = direction === 'vertical';
    return (
        <div
            onMouseDown={handleMouseDown}
            className={`shrink-0 select-none flex items-center justify-center group ${isVertical ? 'cursor-row-resize w-full min-h-[12px]' : 'cursor-col-resize w-1'} ${className}`}
            style={{ minWidth: isVertical ? undefined : 4, minHeight: isVertical ? 12 : undefined }}
            title={isVertical ? 'Drag to resize height' : 'Drag to resize width'}
        >
            <div
                className={`bg-slate-700 group-hover:bg-microtermix-neon transition-colors ${isDragging ? 'bg-microtermix-neon' : ''} ${isVertical ? 'w-full h-0.5 rounded-full' : 'h-8 w-0.5 rounded-full'}`}
            />
        </div>
    );
};
