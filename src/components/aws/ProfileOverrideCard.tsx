import React from 'react';
import { HardDrive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { useAwsStore } from '../../stores/awsStore';

interface ProfileOverrideCardProps {
    accountId: string;
    draftPath: string;
    onDraftPathChange: (path: string) => void;
    isEditing: boolean;
}

export const ProfileOverrideCard: React.FC<ProfileOverrideCardProps> = ({ 
    accountId, 
    draftPath, 
    onDraftPathChange, 
    isEditing 
}) => {
    const { globalSettings, updateAccount } = useAwsStore();

    const handleChange = (val: string) => {
        onDraftPathChange(val);
        if (!isEditing) {
            updateAccount(accountId, { ssmPluginPath: val });
        }
    };

    return (
        <Card className="border-white/5 bg-slate-900/40 backdrop-blur-sm">
            <CardHeader className="py-4">
                <div className="flex items-center justify-between px-1">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-500">
                        <Badge variant="outline" className="text-[8px] px-1 h-3.5 border-microtermix-neon/20 text-microtermix-neon">Override</Badge> Profile Configuration
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="pb-6">
                <div className="space-y-3">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-slate-600 px-1">Ruta Session Manager Plugin (Específica)</Label>
                    <Input 
                        value={draftPath} 
                        onChange={e => handleChange(e.target.value)}
                        placeholder={globalSettings.ssmPluginPath || "Usar ruta sistema / global"}
                        className="bg-black/60 border-white/5 h-10 rounded-xl font-mono text-[10px] text-microtermix-neon/80 italic"
                    />
                </div>
            </CardContent>
        </Card>
    );
};
