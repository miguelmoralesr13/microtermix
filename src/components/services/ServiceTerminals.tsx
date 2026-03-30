import React from 'react';
import { TerminalTabsBar } from './TerminalTabsBar';
import { TerminalArea } from './TerminalArea';
import { VitePreview } from './VitePreview';
import { EmptyTerminalState } from './EmptyTerminalState';
import { getViteWrapperConfig } from '../project/ViteWrapperModal';

interface ServiceTerminalsProps {
    processIds: string[];
    activeProcesses: Record<string, any>;
    activeTerminalTab: string | null;
    vitePreviewOpen: boolean;
    onVitePreviewToggle: (open: boolean) => void;
    onTabSelect: (id: string | null) => void;
    onTabStop: (e: React.MouseEvent, id: string) => void;
    onTabRestart: (e: React.MouseEvent, id: string) => void;
    onTabClose: (e: React.MouseEvent, id: string) => void;
}

export const ServiceTerminals: React.FC<ServiceTerminalsProps> = ({
    processIds,
    activeProcesses,
    activeTerminalTab,
    vitePreviewOpen,
    onVitePreviewToggle,
    onTabSelect,
    onTabStop,
    onTabRestart,
    onTabClose,
}) => {
    if (processIds.length === 0) {
        return <EmptyTerminalState />;
    }

    const activeProjectRemotes = activeTerminalTab ? (() => {
        const projectPath = activeTerminalTab.split('::')[0];
        const viteConfig = getViteWrapperConfig(projectPath);
        return viteConfig?.remotes && Object.keys(viteConfig.remotes).length > 0 ? viteConfig.remotes : null;
    })() : null;

    return (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950/50 relative">
            <TerminalTabsBar
                processIds={processIds}
                activeProcesses={activeProcesses}
                activeTerminalTab={activeTerminalTab}
                onTabSelect={onTabSelect}
                onTabStop={onTabStop}
                onTabRestart={onTabRestart}
                onTabClose={onTabClose}
            />

            {activeProjectRemotes && (
                <VitePreview
                    isOpen={vitePreviewOpen}
                    onToggle={() => onVitePreviewToggle(!vitePreviewOpen)}
                    remotes={activeProjectRemotes}
                />
            )}

            <TerminalArea
                processIds={processIds}
                activeProcesses={activeProcesses}
                activeTerminalTab={activeTerminalTab}
            />
        </div>
    );
};
