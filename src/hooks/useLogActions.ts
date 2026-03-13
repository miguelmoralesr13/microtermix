import { useCallback } from 'react';

export interface LogAction {
    label: string;
    action: () => void;
    icon?: string;
}

export const useLogActions = () => {
    const parseLogLine = useCallback((line: string): LogAction[] => {
        const actions: LogAction[] = [];

        // Example: Detect Git Push rejected
        if (line.includes('rejected') && line.includes('push')) {
            actions.push({
                label: 'Pull & Rebase',
                action: () => {
                    // Logic to trigger git pull --rebase
                    console.log('Triggering Pull & Rebase');
                }
            });
        }

        // Example: Detect Port already in use
        if (line.includes('EADDRINUSE') || line.includes('address already in use')) {
            const portMatch = line.match(/:(\d+)/);
            if (portMatch) {
                const port = portMatch[1];
                actions.push({
                    label: `Kill process on port ${port}`,
                    action: () => {
                        console.log(`Killing process on port ${port}`);
                        // invoke('kill_process_on_port', { port })
                    }
                });
            }
        }

        return actions;
    }, []);

    return { parseLogLine };
};
