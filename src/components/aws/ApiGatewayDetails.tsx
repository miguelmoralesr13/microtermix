import React, { useState, useEffect } from 'react';
import { useApiGatewayStore } from '../../stores/apiGatewayStore';
import { Badge } from '../ui/badge';
import { Loader2, FileJson, X, Download, Copy, CheckCircle2, Server, Zap, ListTree, RefreshCw } from 'lucide-react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { Button } from '../ui/button';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { ApiResourcesTree } from './ApiResourcesTree';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useApiStages, apigwKeys } from '../../hooks/queries/useApiGatewayQueries';
import { useQueryClient } from '@tanstack/react-query';

export const ApiGatewayDetails: React.FC = () => {
    const {
        selectedApi,
        selectedStage,
        setSelectedStage
    } = useApiGatewayStore();

    const queryClient = useQueryClient();
    const { data: stagesData, isLoading: isLoadingStages } = useApiStages(selectedApi?.id, selectedApi?.type === 'rest');

    const [showSwagger, setShowSwagger] = useState(false);
    const [swaggerSpec, setSwaggerSpec] = useState<string | null>(null);
    const [loadingSwagger, setLoadingSwagger] = useState(false);
    const [copied, setCopied] = useState(false);

    const apiStages = stagesData || [];
    const activeStage = selectedApi ? selectedStage[selectedApi.id] : undefined;

    // Auto-select first stage if none selected
    useEffect(() => {
        if (selectedApi && apiStages.length > 0 && !activeStage) {
            setSelectedStage(selectedApi.id, apiStages[0]);
        }
    }, [selectedApi, apiStages, activeStage, setSelectedStage]);

    const handleExportJson = async () => {
        if (!swaggerSpec || !selectedApi) return;
        try {
            const path = await saveDialog({
                title: 'Exportar contrato JSON',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                defaultPath: `${selectedApi.name}-api.json`,
            });
            if (!path) return;
            const pretty = JSON.stringify(JSON.parse(swaggerSpec), null, 2);
            await invoke('notes_write_file', { path, content: pretty });
            toast.success(`Exportado: ${path}`);
        } catch (e) { toast.error(`Error exportando: ${e}`); }
    };

    const handleExportYaml = async () => {
        if (!swaggerSpec || !selectedApi) return;
        try {
            const path = await saveDialog({
                title: 'Exportar contrato YAML',
                filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
                defaultPath: `${selectedApi.name}-api.yaml`,
            });
            if (!path) return;
            const yaml = await invoke<string>('json_convert_format', { input: swaggerSpec, target: 'yaml' });
            await invoke('notes_write_file', { path, content: yaml });
            toast.success(`Exportado: ${path}`);
        } catch (e) { toast.error(`Error exportando: ${e}`); }
    };

    const handleCopy = () => {
        if (!swaggerSpec) return;
        navigator.clipboard.writeText(swaggerSpec);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePreviewSwagger = async () => {
        if (!selectedApi || !activeStage) {
            toast.error("Selecciona un stage para exportar");
            return;
        }
        setLoadingSwagger(true);
        setShowSwagger(true);
        
        try {
            const isRest = selectedApi.type === 'rest';
            const cmd = isRest ? 'apigw_export_api_swagger_rest' : 'apigw_export_api_swagger_http';
            const { useAwsStore } = await import('../../stores/awsStore');
            const c = useAwsStore.getState().credentials;
            const rustCreds = {
                access_key_id: c?.accessKeyId,
                secret_access_key: c?.secretAccessKey,
                region: c?.region,
                session_token: c?.sessionToken || null,
            };
            const args = isRest ? { credentials: rustCreds, restApiId: selectedApi.id, stageName: activeStage } : { credentials: rustCreds, apiId: selectedApi.id, stageName: activeStage };
            const spec = await invoke<string>(cmd, args);
            setSwaggerSpec(spec);
        } catch (e) {
            toast.error("Error al obtener Swagger");
            console.error(e);
        } finally {
            setLoadingSwagger(false);
        }
    };

    const handleRefresh = () => {
        if (selectedApi) {
            queryClient.invalidateQueries({ queryKey: apigwKeys.details(selectedApi.id) });
            queryClient.invalidateQueries({ queryKey: apigwKeys.stages(selectedApi.id) });
        }
    };

    if (!selectedApi) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-900/10">
                <ListTree size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-slate-300">No se ha seleccionado ninguna API</h3>
                <p className="text-sm mt-2 max-w-sm text-center">
                    Selecciona una API del listado de la izquierda para ver sus recursos, rutas y detalles de integración.
                </p>
            </div>
        );
    }

    const isLoading = isLoadingStages;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-slate-950/30">
            {/* Header / Title Area */}
            <div className="p-6 bg-slate-900 border-b border-slate-800 shrink-0 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`p-2 rounded-lg ${selectedApi.type === 'rest' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                            {selectedApi.type === 'rest' ? <Server size={20} className="text-emerald-400" /> : <Zap size={20} className="text-amber-400" />}
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-white tracking-tight">{selectedApi.name}</h2>
                                <Badge variant="outline" className={`font-mono text-[10px] h-5 ${selectedApi.type === 'rest' ? 'text-emerald-400 border-emerald-900/50' : 'text-amber-400 border-amber-900/50'}`}>
                                    {selectedApi.type === 'rest' ? 'v1 (REST)' : 'v2 (HTTP/WS)'}
                                </Badge>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono mt-1">ID: {selectedApi.id}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Stage</span>
                        <Select 
                            value={activeStage} 
                            onValueChange={(val) => setSelectedStage(selectedApi.id, val??"")}
                        >
                            <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs text-slate-300 min-w-[140px]">
                                <SelectValue placeholder="Seleccionar stage" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {apiStages.map(s => (
                                    <SelectItem key={s} value={s} className="text-xs text-slate-300 focus:bg-slate-800">{s}</SelectItem>
                                ))}
                                {apiStages.length === 0 && !isLoadingStages && (
                                    <div className="p-2 text-[10px] text-slate-500 italic">No se encontraron stages</div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                            onClick={handlePreviewSwagger}
                            disabled={loadingSwagger || !activeStage}
                        >
                            {loadingSwagger ? <Loader2 size={14} className="animate-spin mr-2" /> : <FileJson size={14} className="mr-2 text-sky-400" />}
                            Preview Contract
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400 text-xs"
                            onClick={handleRefresh}
                            disabled={isLoading}
                            title="Recargar API (limpia cache)"
                        >
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Swagger Modal Overlay */}
            {showSwagger && (
                <div className="absolute inset-0 z-50 bg-white flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800 shrink-0">
                        <h3 className="text-white font-semibold flex items-center gap-2">
                            <span className="text-sky-400">Swagger UI</span> - {selectedApi.name} <span className="text-slate-500 font-mono text-xs">({activeStage})</span>
                        </h3>
                        <div className="flex items-center gap-2">
                            {swaggerSpec && (
                                <>
                                    <Button size="sm" variant="ghost"
                                        onClick={handleCopy}
                                        className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                                        {copied
                                            ? <><CheckCircle2 size={13} className="text-emerald-400" /> Copiado</>
                                            : <><Copy size={13} /> Copiar JSON</>}
                                    </Button>
                                    <Button size="sm" variant="ghost"
                                        onClick={handleExportJson}
                                        className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                                        <Download size={13} /> JSON
                                    </Button>
                                    <Button size="sm" variant="ghost"
                                        onClick={handleExportYaml}
                                        className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-100">
                                        <Download size={13} /> YAML
                                    </Button>
                                    <div className="w-px h-5 bg-slate-700 mx-1" />
                                </>
                            )}
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={() => setShowSwagger(false)}>
                                <X size={20} />
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-white swagger-container p-4">
                        {loadingSwagger ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                                <Loader2 className="animate-spin" size={32} />
                                <p>Obteniendo especificación OpenAPI desde AWS...</p>
                            </div>
                        ) : swaggerSpec ? (
                            <div className="max-w-7xl mx-auto">
                                <SwaggerUI spec={swaggerSpec} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 max-w-lg mx-auto text-center">
                                <FileJson size={48} className="text-slate-700 mb-2" />
                                <h4 className="text-white text-lg font-medium">Previsualización no disponible</h4>
                                <p className="text-slate-400">Error al cargar la especificación OpenAPI / Swagger.</p>
                                <Button variant="outline" className="mt-4" onClick={() => setShowSwagger(false)}>Cerrar</Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Content Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-slate-950/50">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p>Cargando árbol de recursos...</p>
                    </div>
                ) : (
                    <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl overflow-hidden shadow-xl max-w-5xl mx-auto">
                        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">HTTP Endpoints & Integrations</span>
                            <span className="text-[10px] text-slate-600 font-mono italic">Selecciona un método para ver detalles</span>
                        </div>
                        <ApiResourcesTree />
                    </div>
                )}
            </div>
        </div>
    );
};
