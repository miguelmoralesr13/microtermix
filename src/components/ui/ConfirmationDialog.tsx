import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './dialog';
import { Button } from './button';
import { AlertTriangle, Info, Trash2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'question';

interface ConfirmationDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: ConfirmType;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
    isOpen,
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    type = 'info',
    onConfirm,
    onCancel,
    isLoading = false,
}) => {
    const getIcon = () => {
        switch (type) {
            case 'danger': return <Trash2 className="text-red-500" size={20} />;
            case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
            case 'question': return <HelpCircle className="text-blue-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    const getConfirmButtonClass = () => {
        switch (type) {
            case 'danger': return 'bg-red-600 hover:bg-red-700 text-white';
            case 'warning': return 'bg-amber-600 hover:bg-amber-700 text-white';
            default: return 'bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon/90';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onCancel()}>
            <DialogContent className="max-w-md bg-slate-900 border-slate-800 shadow-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                            "p-2 rounded-lg bg-opacity-10",
                            type === 'danger' ? "bg-red-500" : type === 'warning' ? "bg-amber-500" : "bg-blue-500"
                        )}>
                            {getIcon()}
                        </div>
                        <DialogTitle className="text-slate-100 text-base font-bold uppercase tracking-tight">
                            {title}
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-slate-400 text-sm leading-relaxed">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="mt-6 gap-2">
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={isLoading}
                        className="text-slate-500 hover:text-white hover:bg-slate-800"
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={cn("font-bold", getConfirmButtonClass())}
                    >
                        {isLoading ? 'Procesando...' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
