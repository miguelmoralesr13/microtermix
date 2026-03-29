import React from 'react';
import { SfnMachineSelector } from './SfnMachineSelector';
import { SfnExecutionList } from './SfnExecutionList';
import { SfnExecutionInspector } from './SfnExecutionInspector';

export const StepFunctionsTab: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* Left: Machine Selector & Execution List */}
        <div className="w-1/3 flex flex-col border-r border-slate-800 bg-slate-900/30">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-sm font-semibold mb-4 text-microtermix-neon">State Machines</h3>
            <SfnMachineSelector />
          </div>
          <div className="flex-1 overflow-auto">
            <SfnExecutionList />
          </div>
        </div>

        {/* Right: Execution Inspector */}
        <div className="w-2/3 flex flex-col bg-slate-950">
          <SfnExecutionInspector />
        </div>
      </div>
    </div>
  );
};
