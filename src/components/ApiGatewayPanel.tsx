import React, { useState } from 'react';
import { ApiGatewayList } from './ApiGatewayList';
import { ApiGatewayDetails } from './ApiGatewayDetails';
import { RefreshCw, Network, Search, Layout } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useAwsStore } from '../stores/awsStore';
import { ApiGatewayTester } from './ApiGatewayTester';
import { useApiGatewayList, apigwKeys } from '../hooks/queries/useApiGatewayQueries';
import { useQueryClient } from '@tanstack/react-query';

export const ApiGatewayPanel: React.FC = () => {
    const credentials = useAwsStore(s => s.credentials);
    const isConfigured = !!credentials?.accessKeyId;
    const { isLoading, error } = useApiGatewayList();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState('');
    const [inputValue, setInputValue] = useState('');

    const handleRefresh = () => {
        if (isConfigured) {
            queryClient.invalidateQueries({ queryKey: apigwKeys.lists() });
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Layout size={18} className="text-microtermix-neon" />
                        <h2 className="text-lg font-bold text-white tracking-wide uppercase tracking-tighter">API Gateway</h2>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="text-slate-400 hover:text-white"
                    >
                        <RefreshCw size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="relative w-64">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                        placeholder="Buscar APIs..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                setSearchTerm(inputValue);
                            }
                        }}
                        className="h-8 bg-slate-800 border-slate-700 pl-9 text-sm focus:border-microtermix-neon/50"
                    />
                </div>
            </div>

            {/* Main Content Area: Master / Detail */}
            <div className="flex flex-1 overflow-hidden min-h-0 relative">

                {!isConfigured && (
                    <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 text-slate-400 max-w-sm text-center">
                            <Network size={48} className="opacity-20" />
                            <div>Por favor configura tus <span className="text-microtermix-neon">credenciales de AWS</span> en la pestaña de Ajustes (CloudWatch o EC2) para ver tus API Gateways.</div>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="absolute inset-x-0 top-0 z-10 bg-red-900/90 text-red-100 text-xs px-4 py-2 text-center shadow-md font-mono">
                        {String(error)}
                    </div>
                )}

                {/* Left Pane: List */}
                <div className="w-[380px] shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col h-full overflow-hidden">
                    <ApiGatewayList searchTerm={searchTerm} />
                </div>

                {/* Right Pane: Details */}
                <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden">
                    <ApiGatewayDetails />
                </div>
            </div>

            {/* Tester Drawer/Modal */}
            <ApiGatewayTester />
        </div>
    );
};
