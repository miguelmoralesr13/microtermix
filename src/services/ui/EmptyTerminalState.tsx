import React from 'react';

export const EmptyTerminalState: React.FC = () => {
    return (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm bg-slate-900/50">
            <p>No active terminals. Start a service from the left panel.</p>
        </div>
    );
};
