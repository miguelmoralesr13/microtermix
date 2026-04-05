import React from 'react';
import { useDockerContainers } from '@/hooks/useDocker';
import { ContainerRow } from './ContainerRow';
import { Loader2, Info } from 'lucide-react';

export const ContainerList: React.FC = () => {
    const { data: containers = [], isLoading, error } = useDockerContainers();

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
                <Loader2 size={32} className="animate-spin text-microtermix-neon/40" />
                <span className="text-sm font-medium animate-pulse">Obteniendo contenedores...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="m-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex flex-col gap-2">
                <span className="font-bold">Error conectando al demonio de Docker</span>
                <span>{(error as Error).message}</span>
                <span className="opacity-70 mt-2">Asegúrate de que Docker Desktop u Orbstack estén corriendo.</span>
            </div>
        );
    }

    if (containers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-2 text-center">
                <Info size={40} className="opacity-20 mb-2" />
                <p className="text-sm font-medium text-slate-400">No tienes contenedores creados.</p>
                <p className="text-xs max-w-xs leading-relaxed opacity-60">
                    Crea un contenedor de Docker para verlo listado aquí.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto scrollbar-hide px-4 pt-2 pb-6">
            <table className="w-full text-xs border-separate border-spacing-y-1.5">
                <thead>
                    <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                        <th className="text-left py-2 px-3">Contenedor / ID</th>
                        <th className="text-left py-2 px-3">Imagen</th>
                        <th className="text-left py-2 px-3">Puertos</th>
                        <th className="text-left py-2 px-3">Creado / Uptime</th>
                        <th className="text-left py-2 px-3">Estado</th>
                        <th className="w-32 px-3" />
                    </tr>
                </thead>
                <tbody>
                    {containers.map(c => (
                        <ContainerRow key={c.id} container={c} />
                    ))}
                </tbody>
            </table>
        </div>
    );
};
