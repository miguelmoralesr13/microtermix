import React from 'react';
import { ProcessState } from '../../stores/processStore';
import { TerminalView } from './TerminalView';

interface TerminalAreaProps {
    processIds: string[];
    activeProcesses: Record<string, ProcessState>;
    activeTerminalTab: string | null;
}

export const TerminalArea: React.FC<TerminalAreaProps> = ({
    processIds,
    activeProcesses,
    activeTerminalTab,
}) => {
    return (
        <div className="flex-1 flex flex-col p-2 overflow-hidden bg-microtermix-darker relative">
            {processIds.map(serviceId => (
                <div
                    key={`${serviceId}-${activeProcesses[serviceId]?.restarts || 0}`}
                    className={`absolute inset-2 ${activeTerminalTab === serviceId ? 'visible opacity-100 z-10' : 'invisible opacity-0 z-0'}`}
                >
                    <TerminalView serviceId={serviceId} />
                </div>
            ))}
        </div>
    );
};
