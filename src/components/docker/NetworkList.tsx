import React from 'react';
import { useDockerNetworks } from '@/hooks/useDocker';
import { RefreshCw, Globe } from 'lucide-react';

export const NetworkList: React.FC = () => {
    const { data: networks = [], isLoading } = useDockerNetworks();

    if (isLoading) {
        return (
            <div className="flex justify-center p-12 text-slate-500 animate-pulse text-xs">
                <RefreshCw className="animate-spin mr-2" size={14} />
                Cargando redes...
            </div>
        );
    }

    if (networks.length === 0) {
        return <div className="p-8 text-center text-slate-500 italic text-xs">No hay redes de Docker.</div>;
    }

    return (
        <div className="flex-1 overflow-auto scrollbar-hide px-4 pt-2 pb-6">
            <table className="w-full text-xs border-separate border-spacing-y-1.5">
                <thead>
                    <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest bg-slate-900/50">
                        <th className="text-left py-2 px-3 rounded-l-lg w-10"></th>
                        <th className="text-left py-2 px-3">Nombre</th>
                        <th className="text-left py-2 px-3">Driver</th>
                        <th className="text-left py-2 px-3">Scope</th>
                        <th className="text-left py-2 px-3 rounded-r-lg">ID</th>
                    </tr>
                </thead>
                <tbody>
                    {networks.map(network => (
                        <tr key={network.id} className="bg-slate-900/40 border border-slate-800 hover:bg-slate-800/60 transition-all group">
                            <td className="py-2.5 px-3 rounded-l-lg text-slate-500 group-hover:text-microtermix-neon transition-colors">
                                <Globe size={14} />
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-300">
                                {network.name}
                            </td>
                            <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-semibold">
                                    {network.driver}
                                </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[10px]">
                                {network.scope}
                            </td>
                            <td className="py-2.5 px-3 rounded-r-lg font-mono text-[10px] text-slate-500">
                                {network.id}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
