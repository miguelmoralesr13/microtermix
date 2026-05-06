import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SonarMetricCardProps {
    label: string;
    value: string | number;
    rating?: string;
    icon: React.ElementType;
    colorClass: string;
}

/** Compact metric display for dashboard grid */
export const SonarMetricCard: React.FC<SonarMetricCardProps> = ({
    label,
    value,
    rating,
    icon: Icon,
    colorClass
}) => (
    <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-border/80 transition-all">
        <div className="p-2 rounded-md bg-muted/50">
            <Icon className={colorClass} size={14} />
        </div>
        <div className="flex-1 min-w-0 text-left">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-foreground leading-none">{value}</span>
                {rating && (
                    <Badge variant="outline" className={cn(
                        "text-[8px] font-bold h-3.5 px-1 min-w-[16px] justify-center",
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
    </div>
);
