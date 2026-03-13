import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from './ui/button';
import { Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import type { PipelineStepConfig } from '../types/workspaceConfig';

export const PipelinesPanel: React.FC = () => {
    const { state, executePipeline } = useWorkspace();
    const pipelines = state.pipelines || [];

    return (
        <div className="flex flex-col gap-4 p-6 h-full overflow-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-100">Pipelines de Ejecución</h2>
            </div>

            {pipelines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                    <p className="text-slate-400">No hay pipelines definidos en nexus-workspace.json</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pipelines.map(pipeline => (
                        <Card key={pipeline.id} className="bg-slate-900 border-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg text-slate-100 flex items-center justify-between">
                                    {pipeline.name}
                                    <Button size="icon-sm" variant="ghost" onClick={() => executePipeline(pipeline)}>
                                        <Play size={16} className="text-nexus-neon" />
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-slate-500 mb-3">
                                    {pipeline.steps.length} pasos
                                </div>
                                <div className="space-y-2">
                                    {pipeline.steps.map((step: PipelineStepConfig, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                                            <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-500">
                                                {idx + 1}
                                            </div>
                                            <span className="truncate flex-1">{step.serviceId}</span>
                                            {step.condition && (
                                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 rounded bg-slate-800 text-slate-400 border-none">
                                                    {step.condition.type === 'WaitPort' ? `Port ${step.condition.value}` : `Log "${step.condition.value}"`}
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
