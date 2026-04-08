import React from 'react';
import { useApiGatewayStore } from '../../stores/apiGatewayStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { X, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { ApiTesterView } from './ApiTesterView';
import { useCwStore } from '../../stores/cwStore';

export const ApiGatewayTester: React.FC = () => {
    const { 
        testerOpen, 
        closeTester, 
        testerEndpoint, 
    } = useApiGatewayStore();
    const activeCwTab = useCwStore(s => s.activeTab);

    if (!testerEndpoint || !testerOpen || activeCwTab === 'invoke-tester') return null;

    return (
        <Dialog open={testerOpen} onOpenChange={(open) => !open && closeTester()}>
            <DialogContent className="p-0 flex flex-col gap-0 bg-slate-900 border-slate-700 shadow-2xl w-[90vw] max-w-5xl h-[85vh] max-h-[85vh] overflow-hidden" showCloseButton={false}>
                <DialogHeader className="p-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-microtermix-neon/10 border border-microtermix-neon/20 shadow-[0_0_15px_rgba(50,255,100,0.1)]">
                                <Globe size={18} className="text-microtermix-neon" />
                            </div>
                            <div>
                                <DialogTitle className="text-sm font-bold uppercase tracking-widest text-white">API Gateway Tester</DialogTitle>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="font-mono text-[9px] h-4.5 bg-slate-900 border-slate-700 text-sky-400">{testerEndpoint.method}</Badge>
                                    <span className="text-[10px] text-slate-500 font-mono truncate max-w-[400px]">{testerEndpoint.path}</span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={closeTester} className="text-slate-500 hover:text-white transition-colors">
                            <X size={18} />
                        </Button>
                    </div>
                </DialogHeader>

                <ApiTesterView endpoint={testerEndpoint} showClose={true} />
            </DialogContent>
        </Dialog>
    );
};
