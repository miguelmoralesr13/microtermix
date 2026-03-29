import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/stores/uiStore';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

const UTILITIES = [
    { id: 'services', label: 'Servicios' },
    { id: 'git', label: 'Git' },
    { id: 'jira', label: 'Jira' },
    { id: 'processes', label: 'Procesos' },
    { id: 'proxy', label: 'Proxy' },
    { id: 'fileServer', label: 'Servidor de Archivos' },
    { id: 'tests', label: 'Tests' },
    { id: 'sonar', label: 'Sonar' },
    { id: 'cloudwatch', label: 'CloudWatch' },
    { id: 'http', label: 'HTTP Client' },
    { id: 'jenkins', label: 'Jenkins' },
    { id: 'lib-cipher', label: 'Lib Cipher' },
    { id: 'mocks', label: 'Mocks' },
    { id: 'json-processor', label: 'JSON Processor' },
    { id: 'regex', label: 'Regex Tester' },
    { id: 'notes', label: 'Notas' },
    { id: 'swagger', label: 'Swagger' },
    { id: 'designer', label: 'Designer' },
    { id: 'semgrep', label: 'Semgrep' },
    { id: 'system', label: 'Monitor de Sistema' },
    { id: 'zeplin', label: 'Zeplin' },
];

export const SettingsModal: React.FC<{ trigger?: React.ReactNode }> = ({ trigger }) => {
    const { visibleUtilities, toggleUtility } = useUIStore();

    return (
        <Dialog>
            <DialogTrigger render={(trigger as React.ReactElement) || (
                <Button variant="ghost" size="icon" title="Configuraciones Generales" className="cursor-pointer">
                    <Settings className="w-4 h-4" />
                </Button>
            )} />
            <DialogContent className="max-w-none sm:max-w-none w-screen h-screen flex flex-col p-0 overflow-hidden rounded-none border-none bg-slate-950/98 backdrop-blur-md fixed inset-0 translate-x-0 translate-y-0 top-0 left-0">
                <DialogHeader className="p-8 pb-4 max-w-5xl mx-auto w-full flex-row justify-between items-center space-y-0">
                    <DialogTitle className="text-2xl font-bold text-white">Configuraciones de Microtermix</DialogTitle>
                    <DialogClose render={<Button variant="ghost" size="icon" className="hover:bg-white/10 text-slate-400 hover:text-white rounded-full"><Settings className="w-6 h-6 rotate-90" /></Button>} />
                </DialogHeader>
                
                <Tabs defaultValue="utilities" className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b border-white/10">
                        <div className="max-w-5xl mx-auto w-full px-8">
                            <TabsList className="bg-transparent border-none py-2 gap-8">
                                <TabsTrigger value="utilities" className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">Utilidades</TabsTrigger>
                                <TabsTrigger value="general" className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">General</TabsTrigger>
                                <TabsTrigger value="appearance" className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">Apariencia</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="max-w-5xl mx-auto w-full p-8">
                            <TabsContent value="utilities" className="m-0 focus-visible:outline-none">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {UTILITIES.map((util) => (
                                            <div key={util.id} className="flex items-center space-x-4 p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all hover:border-microtermix-neon/30 group">
                                                <Checkbox 
                                                    id={`util-${util.id}`} 
                                                    checked={visibleUtilities[util.id] !== false} 
                                                    onChange={() => toggleUtility(util.id)}
                                                    className="w-5 h-5"
                                                />
                                                <Label 
                                                    htmlFor={`util-${util.id}`}
                                                    className="flex-1 cursor-pointer text-base font-medium group-hover:text-microtermix-neon transition-colors"
                                                >
                                                    {util.label}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                        <p className="text-sm text-blue-300 italic">
                                            💡 Las utilidades desmarcadas desaparecerán instantáneamente de tu barra lateral izquierda. Puedes volver a activarlas en cualquier momento desde aquí.
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="general" className="m-0 focus-visible:outline-none">
                                <div className="text-sm text-slate-400">
                                    <p>Configuraciones generales próximamente...</p>
                                </div>
                            </TabsContent>

                            <TabsContent value="appearance" className="m-0 focus-visible:outline-none">
                                <div className="text-sm text-slate-400">
                                    <p>Configuraciones de apariencia próximamente...</p>
                                </div>
                            </TabsContent>
                        </div>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
