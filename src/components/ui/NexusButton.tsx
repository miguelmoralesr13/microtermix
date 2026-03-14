import React, { ButtonHTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'success' | 'danger' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    icon?: LucideIcon;
    iconSize?: number;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'outline',
    size = 'md',
    icon: Icon,
    iconSize = 14,
    className = '',
    ...props
}) => {
    let variantClasses = '';
    switch (variant) {
        case 'primary':
            variantClasses = 'bg-microtermix-neon/10 border border-microtermix-neon/30 text-microtermix-neon hover:bg-microtermix-neon hover:text-white hover:border-microtermix-neon';
            break;
        case 'success':
            variantClasses = 'bg-microtermix-success text-slate-900 hover:bg-opacity-80';
            break;
        case 'danger':
            variantClasses = 'bg-microtermix-danger/20 border border-microtermix-danger/50 text-microtermix-danger hover:bg-microtermix-danger hover:text-white';
            break;
        case 'outline':
            variantClasses = 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-microtermix-neon';
            break;
        case 'ghost':
            variantClasses = 'text-slate-500 hover:text-microtermix-neon';
            break;
    }

    let sizeClasses = '';
    switch (size) {
        case 'sm':
            sizeClasses = 'px-2 py-1 text-[11px] font-bold';
            break;
        case 'md':
            sizeClasses = 'px-3 py-1.5 text-xs font-bold';
            break;
        case 'lg':
            sizeClasses = 'px-6 py-3 text-sm font-semibold';
            break;
    }

    return (
        <button
            {...props}
            className={`flex items-center justify-center gap-1.5 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${sizeClasses} ${className}`}
        >
            {Icon && <Icon size={iconSize} />}
            {children}
        </button>
    );
};
