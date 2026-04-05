import React from 'react';
import { Settings} from 'lucide-react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/Checkbox';

interface SonarSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    link: any;
    onLinkChange: (patch: any) => void;
}

export const SonarSettingsDialog: React.FC<SonarSettingsDialogProps> = ({ 
    isOpen, 
    onOpenChange, 
    link, 
    onLinkChange 
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-slate-950 border-white/5 p-6 rounded-2xl shadow-3xl ring-1 ring-white/10">
                <DialogHeader className="mb-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/10 flex items-center justify-center shrink-0">
                            <Settings size={18} />
                        </div>
                        <div className="text-left space-y-0.5 min-w-0">
                            <DialogTitle className="text-xs font-black uppercase tracking-[0.2em] text-white truncate">Project Preferences</DialogTitle>
                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none">SonarScanner Core Configuration</p>
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="space-y-6 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 text-left">
                            <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-0.5">Project Key</Label>
                            <Input 
                                value={link.projectKey || ''} 
                                onChange={e => onLinkChange({ projectKey: e.target.value })} 
                                className="h-9 bg-black/40 border-slate-800 rounded-lg text-xs font-mono" 
                            />
                        </div>
                        <div className="space-y-1.5 text-left">
                            <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-0.5">Sources Path</Label>
                            <Input 
                                value={link.sources || '.'} 
                                onChange={e => onLinkChange({ sources: e.target.value })} 
                                className="h-9 bg-black/40 border-slate-800 rounded-lg text-xs font-mono" 
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-left">
                            {[
                                { id: 'includeHostUrl', label: 'Host URL' },
                                { id: 'includeToken', label: 'Token' },
                                { id: 'includeOrganization', label: 'Organization' },
                                { id: 'includeBranch', label: 'Branch' },
                                { id: 'debug', label: 'Debug Mode' }
                            ].map(item => (
                                <div key={item.id} className="flex items-center justify-between pb-1.5 border-b border-white/5">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</span>
                                    <Checkbox 
                                        checked={link[item.id] ?? (item.id !== 'debug')} 
                                        onChange={e => onLinkChange({ [item.id]: e.target.checked })} 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-8 gap-2">
                    <Button 
                        variant="ghost" 
                        onClick={() => onOpenChange(false)} 
                        className="text-[9px] font-black uppercase tracking-widest text-slate-600 h-9"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => onOpenChange(false)} 
                        className="bg-blue-600 hover:bg-blue-500 text-white font-black px-6 h-9 rounded-lg uppercase tracking-widest text-[9px] ring-1 ring-white/10"
                    >
                        Save Setup
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
