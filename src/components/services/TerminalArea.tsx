import React from 'react';
import { TerminalView } from './TerminalView';

interface TerminalAreaProps {
    processIds: string[];
    activeTerminalTab: string | null;
}

export const TerminalArea: React.FC<TerminalAreaProps> = ({
    processIds,
    activeTerminalTab,
}) => {
    return (
        <div className="flex-1 flex flex-col p-2 overflow-hidden bg-microtermix-darker relative">
            {processIds.map(serviceId => (
                <div
                    key={serviceId}
                    className={`absolute inset-2 ${activeTerminalTab === serviceId ? 'visible opacity-100 z-10' : 'invisible opacity-0 z-0'}`}
                >
                    <TerminalView serviceId={serviceId} />
                </div>
            ))}
        </div>
    );
};
