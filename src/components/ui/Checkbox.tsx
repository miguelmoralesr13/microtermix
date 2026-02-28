import React, { InputHTMLAttributes } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    containerClassName?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    label,
    className = '',
    containerClassName = '',
    ...props
}) => {
    return (
        <label className={`flex items-center gap-1 cursor-pointer shrink-0 ${containerClassName} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
                type="checkbox"
                className={`accent-nexus-neon shrink-0 ${className}`}
                {...props}
            />
            {label && <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>}
        </label>
    );
};
