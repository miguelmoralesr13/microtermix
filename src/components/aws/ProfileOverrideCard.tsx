import React from 'react';
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
        <Card className="border-border bg-card shadow-none">
            <CardHeader className="py-3 px-5">
                <CardTitle className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                    <Badge variant="outline" className="text-[7px] px-1 h-3.5 border-microtermix-neon/20 text-microtermix-neon">Override</Badge>
                    Profile Configuration
                </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
                <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Ruta Session Manager Plugin (Específica)
                    </Label>
                    <Input
                        value={draftPath}
                        onChange={e => handleChange(e.target.value)}
                        placeholder={globalSettings.ssmPluginPath || "Usar ruta sistema / global"}
                        className="h-9 rounded-xl font-mono text-[10px] text-microtermix-neon/80 italic border-border"
                    />
                </div>
            </CardContent>
        </Card>
    );
};
