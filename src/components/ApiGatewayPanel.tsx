import React, { useEffect, useState } from 'react';
import { useApiGatewayStore } from '../stores/useApiGatewayStore';
import { ApiGatewayList } from './ApiGatewayList';
import { ApiGatewayDetails } from './ApiGatewayDetails';
import { RefreshCw, Network } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AwsCredentials } from '../stores/useApiGatewayStore';

interface ApiGatewayPanelProps {
    credentials?: AwsCredentials;
}

export const ApiGatewayPanel: React.FC<ApiGatewayPanelProps> = ({ credentials }) => {
    const fetchApis = useApiGatewayStore(state => state.fetchApis);
    const loadingApis = useApiGatewayStore(state => state.loadingApis);
    const error = useApiGatewayStore(state => state.error);

    const [searchTerm, setSearchTerm] = useState('');
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (credentials?.accessKeyId && credentials?.region) {
            fetchApis(credentials);
        }
    }, [fetchApis, credentials?.accessKeyId, credentials?.region, credentials?.sessionToken]);

    const handleRefresh = () => {
        if (credentials?.accessKeyId) {
            fetchApis(credentials);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-white tracking-wide">API Gateway</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={loadingApis}
                        className="text-slate-400 hover:text-white"
                    >
                        <RefreshCw size={16} className={`mr-2 ${loadingApis ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="w-64">
                    <Input
                        placeholder="Search APIs... (Press Enter)"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                setSearchTerm(inputValue);
                            }
                        }}
                        className="h-8 bg-slate-800 border-slate-700 text-sm"
                    />
                </div>
            </div>

            {/* Main Content Area: Master / Detail */}
            <div className="flex flex-1 overflow-hidden min-h-0 relative">

                {!credentials?.accessKeyId && (
                    <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 text-slate-400 max-w-sm text-center">
                            <Network size={48} className="opacity-20" />
                            <div>Please configure your AWS Credentials in the <span className="text-microtermix-neon">Settings</span> tab to view API Gateways.</div>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="absolute inset-x-0 top-0 z-10 bg-red-900/90 text-red-100 text-xs px-4 py-2 text-center shadow-md">
                        {error}
                    </div>
                )}

                {/* Left Pane: List */}
                <div className="w-[380px] shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col h-full overflow-hidden">
                    <ApiGatewayList searchTerm={searchTerm} credentials={credentials} />
                </div>

                {/* Right Pane: Details */}
                <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden">
                    <ApiGatewayDetails credentials={credentials} />
                </div>
            </div>
        </div>
    );
};
