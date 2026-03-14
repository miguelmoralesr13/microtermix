import React, { ButtonHTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    iconSize?: number;
    variant?: 'ghost' | 'danger' | 'success' | 'outline' | 'default';
}

export const IconButton: React.FC<IconButtonProps> = ({
    icon: Icon,
    iconSize = 14,
    variant = 'ghost',
    className = '',
    ...props
}) => {
    let variantClasses = '';
    switch (variant) {
        case 'ghost':
            variantClasses = 'text-slate-500 hover:text-microtermix-neon hover:bg-slate-800';
            break;
        case 'danger':
            variantClasses = 'text-slate-500 hover:text-microtermix-danger hover:bg-microtermix-danger/10';
            break;
        case 'success':
            variantClasses = 'text-slate-500 hover:text-microtermix-success hover:bg-slate-700';
            break;
        case 'outline':
            variantClasses = 'text-slate-500 hover:text-microtermix-neon border border-slate-700 hover:border-slate-600';
            break;
        default:
            variantClasses = 'text-slate-500 hover:text-slate-200';
    }

    return (
        <button
            type="button"
            className={`p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
            {...props}
        >
            <Icon size={iconSize} />
        </button>
    );
};
