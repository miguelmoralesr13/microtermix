import React from 'react';
import { MockSidebar } from './MockSidebar';
import { MockEditor } from './MockEditor';
import { MockServerControls } from './MockServerControls';

export const MockPanel: React.FC = () => {
    return (
        <div className="flex-1 flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
            {/* Top Toolbar */}
            <MockServerControls />

            {/* Main Content Split */}
            <div className="flex flex-1 min-h-0">
                <MockSidebar />
                <MockEditor />
            </div>
        </div>
    );
};
