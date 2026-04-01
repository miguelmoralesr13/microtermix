import React, { useState } from 'react';
import { 
    Terminal as TerminalIcon, 
    ExternalLink, Copy, Info 
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { detectOs, OsTab } from './cwUtils';

export const PlatformSetupGuide: React.FC = () => {
    const [osTab, setOsTab] = useState<OsTab>(detectOs);

    return (
        <div className="p-6 rounded-[2rem] border border-white/5 bg-slate-900/10 flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-microtermix-neon/10 rounded-lg">
                    <TerminalIcon className="w-4 h-4 text-microtermix-neon" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Platform Setup</h3>
            </div>

            <Tabs defaultValue={osTab} onValueChange={(v) => setOsTab(v as OsTab)} className="flex flex-col flex-1 min-h-0">
                <TabsList className="bg-black/40 p-1 rounded-xl mb-6 grid grid-cols-3">
                    <TabsTrigger value="windows" className="text-[9px] font-black uppercase tracking-widest py-2 rounded-lg data-[state=active]:bg-microtermix-neon data-[state=active]:text-microtermix-darker transition-all">Win</TabsTrigger>
                    <TabsTrigger value="linux" className="text-[9px] font-black uppercase tracking-widest py-2 rounded-lg data-[state=active]:bg-microtermix-neon data-[state=active]:text-microtermix-darker transition-all">Linux</TabsTrigger>
                    <TabsTrigger value="macos" className="text-[9px] font-black uppercase tracking-widest py-2 rounded-lg data-[state=active]:bg-microtermix-neon data-[state=active]:text-microtermix-darker transition-all">Mac</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    <TabsContent value="windows" className="space-y-6 m-0 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Binary Package</p>
                            <a href="https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe" target="_blank" className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl hover:bg-microtermix-neon/10 transition-all text-microtermix-neon">
                                <span className="font-mono text-[10px]">Setup.exe</span>
                                <ExternalLink size={12} />
                            </a>
                        </div>
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Winget command</p>
                            <div className="relative group">
                                <code className="block p-3 bg-black/60 rounded-xl border border-white/5 text-[10px] text-emerald-400 font-mono leading-relaxed">
                                    winget install Amazon.SessionManagerPlugin
                                </code>
                                <button 
                                    onClick={() => navigator.clipboard.writeText('winget install Amazon.SessionManagerPlugin')}
                                    className="absolute right-2 top-2 p-1 text-slate-700 hover:text-white transition-opacity"
                                >
                                    <Copy size={10} />
                                </button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="linux" className="space-y-6 m-0 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Debian / Ubuntu</p>
                                <pre className="p-3 bg-black/60 rounded-xl border border-white/5 text-[9px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">
                                    {`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"\nsudo dpkg -i session-manager-plugin.deb`}
                                </pre>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">RHEL / CentOS</p>
                                <pre className="p-3 bg-black/60 rounded-xl border border-white/5 text-[9px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">
                                    {`sudo yum install -y https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm`}
                                </pre>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="macos" className="space-y-6 m-0 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Homebrew Cask</p>
                            <code className="block p-3 bg-black/60 rounded-xl border border-white/5 text-[10px] text-emerald-400 font-mono leading-relaxed">
                                brew install --cask session-manager-plugin
                            </code>
                        </div>
                        <div className="p-3 bg-amber-400/5 rounded-xl border border-amber-400/10 flex gap-2">
                            <Info className="w-3 h-3 text-amber-500 shrink-0" />
                            <p className="text-[9px] text-amber-900/60 leading-normal uppercase font-black">Requires admin privileges.</p>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};
