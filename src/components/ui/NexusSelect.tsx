import React, { SelectHTMLAttributes } from 'react';

interface Option {
    value: string | number;
    label: string | React.ReactNode;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    options: Option[];
    containerClassName?: string;
    label?: string;
}

export const Select: React.FC<SelectProps> = ({
    options,
    className = '',
    containerClassName = '',
    label,
    ...props
}) => {
    return (
        <div className={`flex items-center gap-2 ${containerClassName}`}>
            {label && <span className="text-slate-500 text-[10px] uppercase tracking-wider shrink-0">{label}</span>}
            <select
                {...props}
                className={`bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-nexus-neon focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
};
