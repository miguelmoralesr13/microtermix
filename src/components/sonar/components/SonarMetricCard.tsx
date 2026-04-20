import React from 'react';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';

interface SonarMetricCardProps {
    label: string;
    value: string | number;
    rating?: string;
    icon: React.ElementType;
    colorClass: string;
}

export const SonarMetricCard: React.FC<SonarMetricCardProps> = ({ 
    label, 
    value, 
    rating, 
    icon: Icon, 
    colorClass 
}) => (
    <Card className="bg-card border-border p-4 flex items-center gap-4 hover:border-border/80 transition-all shadow-none">
        <div className="p-3 rounded-lg bg-muted/50">
            <Icon className={colorClass} size={18} />
        </div>
        <div className="flex-1 min-w-0 text-left">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-foreground leading-none">{value}</span>
                {rating && (
                    <Badge variant="outline" className={cn(
                        "text-[9px] font-black h-4 px-1.5 min-w-[18px] justify-center mt-0.5",
                        rating === 'A' ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" :
                        rating === 'B' ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" :
                        rating === 'C' ? "text-orange-400 border-orange-500/30 bg-orange-500/5" :
                        "text-red-400 border-red-500/30 bg-red-500/5"
                    )}>
                        {rating}
                    </Badge>
                )}
            </div>
        </div>
    </Card>
);
