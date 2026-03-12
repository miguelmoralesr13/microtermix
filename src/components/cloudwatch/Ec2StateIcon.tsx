import React from 'react';
import { CheckCircle, X, Loader, Circle, AlertCircle } from 'lucide-react';
import { ec2StateColor } from './ec2Types';

interface Ec2StateIconProps {
    state: string;
}

export function Ec2StateIcon({ state }: Ec2StateIconProps) {
    const color = ec2StateColor(state);
    if (state === 'running') return <CheckCircle size={14} style={{ color }} />;
    if (state === 'stopped') return <X size={14} style={{ color }} />;
    if (['pending', 'stopping', 'shutting-down'].includes(state))
        return <Loader size={14} style={{ color }} className="animate-spin" />;
    if (state === 'terminated') return <Circle size={14} style={{ color }} />;
    return <AlertCircle size={14} style={{ color }} />;
}
