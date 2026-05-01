import React from 'react';
import { TerminalTabsBar } from './TerminalTabsBar';
import { TerminalArea } from './TerminalArea';
import { VitePreview } from './VitePreview';
import { EmptyTerminalState } from './EmptyTerminalState';
import { getViteWrapperConfig } from '../../components/project/ViteWrapperModal';

interface ServiceTerminalsProps {
    processIds: string[];
    activeProcesses: Record<string, any>;
    activeTerminalTab: string | null;
    vitePreviewOpen: boolean;
    onVitePreviewToggle: (open: boolean) => void;
    onTabSelect: (id: string | null) => void;
    onTabStop: (id: string) => void;
    onTabRestart: (id: string) => void;
    onTabClose: (id: string) => void;
    onTabCloseAll: () => void;
    onTabCloseFinished: () => void;
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
    onTabCloseAll,
    onTabCloseFinished,
}) => {
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                
                if (processIds.length <= 1) return;
                
                const currentIndex = processIds.indexOf(activeTerminalTab || '');
                let nextIndex;
                
                if (e.shiftKey) {
                    // Ctrl + Shift + Tab
                    nextIndex = (currentIndex - 1 + processIds.length) % processIds.length;
                } else {
                    // Ctrl + Tab
                    nextIndex = (currentIndex + 1) % processIds.length;
                }
                
                onTabSelect(processIds[nextIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [processIds, activeTerminalTab, onTabSelect]);

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
                onTabCloseAll={onTabCloseAll}
                onTabCloseFinished={onTabCloseFinished}
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
                activeTerminalTab={activeTerminalTab}
            />
        </div>
    );
};
