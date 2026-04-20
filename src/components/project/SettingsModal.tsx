import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components//ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components//ui/tabs';
import { Checkbox } from '@/components//ui/Checkbox';
import { Label } from '@/components//ui/label';
import { Input } from '@/components//ui/input';
import { useUIStore } from '@/stores/uiStore';
import { Settings, Moon, Sun, Check, Terminal } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { cn } from '@/lib/utils';
import { TERMINAL_THEMES, type TerminalTheme } from '@/lib/terminalThemes';

// ── Utilities list ────────────────────────────────────────────────────────────

const UTILITIES = [
    { id: 'services',          label: 'Servicios' },
    { id: 'git',               label: 'Git' },
    { id: 'jira',              label: 'Jira' },
    { id: 'processes',         label: 'Procesos' },
    { id: 'proxy',             label: 'Proxy' },
    { id: 'fileServer',        label: 'Servidor de Archivos' },
    { id: 'tests',             label: 'Tests' },
    { id: 'sonar',             label: 'Sonar' },
    { id: 'cloudwatch',        label: 'CloudWatch' },
    { id: 'http',              label: 'HTTP Client' },
    { id: 'jenkins',           label: 'Jenkins' },
    { id: 'lib-cipher',        label: 'Lib Cipher' },
    { id: 'mocks',             label: 'Mocks' },
    { id: 'json-processor',    label: 'JSON Processor' },
    { id: 'regex',             label: 'Regex Tester' },
    { id: 'notes',             label: 'Notas' },
    { id: 'swagger',           label: 'Swagger' },
    { id: 'designer',          label: 'Designer' },
    { id: 'semgrep',           label: 'Semgrep' },
    { id: 'system',            label: 'Monitor de Sistema' },
    { id: 'zeplin',            label: 'Zeplin' },
    { id: 'template-compiler', label: 'Template Compiler' },
    { id: 'docker',            label: 'Docker' },
];

// ── Accent presets ────────────────────────────────────────────────────────────

const ACCENT_PRESETS = [
    { name: 'Sky',      value: '#38bdf8' },
    { name: 'Indigo',   value: '#818cf8' },
    { name: 'Violet',   value: '#a78bfa' },
    { name: 'Emerald',  value: '#34d399' },
    { name: 'Teal',     value: '#2dd4bf' },
    { name: 'Rose',     value: '#fb7185' },
    { name: 'Amber',    value: '#fbbf24' },
    { name: 'Orange',   value: '#fb923c' },
    { name: 'Lime',     value: '#a3e635' },
    { name: 'Pink',     value: '#f472b6' },
];

// ── Theme card ────────────────────────────────────────────────────────────────

interface ThemeCardProps {
    mode: 'dark' | 'light';
    current: 'dark' | 'light';
    accent: string;
    onClick: () => void;
}

function ThemeCard({ mode, current, accent, onClick }: ThemeCardProps) {
    const isActive = current === mode;
    const isDark   = mode === 'dark';

    return (
        <button
            onClick={onClick}
            className={cn(
                'flex-1 rounded-2xl border-2 p-5 cursor-pointer transition-all text-left flex flex-col gap-4 focus:outline-none',
                isActive ? 'border-current shadow-lg' : 'border-white/10 hover:border-white/20'
            )}
            style={{ borderColor: isActive ? accent : undefined }}
        >
            {/* Mini UI preview */}
            <div
                className="w-full rounded-xl overflow-hidden border"
                style={{
                    background:   isDark ? '#0f172a' : '#f8fafc',
                    borderColor:  isDark ? '#1e293b' : '#e2e8f0',
                }}
            >
                {/* Fake titlebar */}
                <div
                    className="flex items-center gap-1.5 px-3 py-2 border-b"
                    style={{
                        background:  isDark ? '#020617' : '#e2e8f0',
                        borderColor: isDark ? '#1e293b' : '#cbd5e1',
                    }}
                >
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
                    <div className="flex-1 mx-2 h-1.5 rounded-full" style={{ background: isDark ? '#1e293b' : '#cbd5e1' }} />
                </div>
                {/* Fake content */}
                <div className="flex gap-0 p-0">
                    {/* Sidebar */}
                    <div className="w-8 flex flex-col items-center py-3 gap-2.5" style={{ background: isDark ? '#020617' : '#e2e8f0' }}>
                        {[accent, isDark ? '#334155' : '#94a3b8', isDark ? '#334155' : '#94a3b8'].map((c, i) => (
                            <div key={i} className="w-3.5 h-3.5 rounded" style={{ background: c, opacity: i === 0 ? 1 : 0.5 }} />
                        ))}
                    </div>
                    {/* Main area */}
                    <div className="flex-1 p-3 flex flex-col gap-2">
                        <div className="h-2 rounded-full w-3/4" style={{ background: isDark ? '#1e293b' : '#cbd5e1' }} />
                        <div className="h-2 rounded-full w-1/2" style={{ background: isDark ? '#1e293b' : '#e2e8f0' }} />
                        <div className="h-2 rounded-full w-2/3" style={{ background: isDark ? '#1e293b' : '#cbd5e1' }} />
                        <div className="mt-1 h-1.5 rounded-full w-1/3" style={{ background: accent, opacity: 0.8 }} />
                    </div>
                </div>
            </div>

            {/* Label row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isDark
                        ? <Moon size={15} className="text-slate-400" />
                        : <Sun  size={15} className="text-amber-400" />
                    }
                    <span className="text-sm font-semibold text-slate-200">
                        {isDark ? 'Oscuro' : 'Claro'}
                    </span>
                </div>
                {isActive && (
                    <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: accent }}
                    >
                        <Check size={11} className="text-slate-950" />
                    </div>
                )}
            </div>
        </button>
    );
}

// ── Terminal theme card ───────────────────────────────────────────────────────

function TerminalThemeCard({ t, isActive, onClick }: { t: TerminalTheme; isActive: boolean; onClick: () => void }) {
    const { background, foreground, green, blue, yellow, cyan } = t.theme as Record<string, string>;

    return (
        <button
            onClick={onClick}
            className={cn(
                'relative flex flex-col gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all text-left focus:outline-none w-full',
                isActive ? 'border-current shadow-lg scale-[1.02]' : 'border-white/10 hover:border-white/20 hover:scale-[1.01]'
            )}
            style={{ borderColor: isActive ? (blue ?? '#38bdf8') : undefined }}
        >
            {/* Mini terminal preview */}
            <div
                className="w-full rounded-lg overflow-hidden"
                style={{ background, border: `1px solid ${isActive ? (blue ?? '#38bdf8') : 'rgba(255,255,255,0.06)'}` }}
            >
                {/* Fake top bar */}
                <div className="flex items-center gap-1 px-2 py-1.5" style={{ background: t.dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                    <div className="flex-1 ml-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
                </div>
                {/* Fake content */}
                <div className="px-2 py-1.5 space-y-1 font-mono">
                    <div className="flex gap-1.5 items-center">
                        <span className="text-[7px] font-bold" style={{ color: green ?? '#50fa7b' }}>❯</span>
                        <span className="text-[7px]" style={{ color: foreground }}>npm run dev</span>
                    </div>
                    <div className="text-[7px]" style={{ color: cyan ?? '#8be9fd' }}>  Server running on</div>
                    <div className="flex gap-1">
                        <span className="text-[7px]" style={{ color: yellow ?? '#f1fa8c' }}>  WARN</span>
                        <span className="text-[7px]" style={{ color: foreground, opacity: 0.6 }}>hot reload</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-[7px] font-bold" style={{ color: green ?? '#50fa7b' }}>❯</span>
                        <div className="ml-1 w-1.5 h-[7px] rounded-sm animate-pulse" style={{ background: t.theme.cursor ?? foreground }} />
                    </div>
                </div>
            </div>

            {/* Label + active check */}
            <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1.5">
                    <Terminal size={11} className="text-slate-500" />
                    <span className="text-xs font-semibold text-slate-200">{t.name}</span>
                    {!t.dark && (
                        <span className="text-[8px] text-slate-500 border border-slate-700 px-1 rounded">light</span>
                    )}
                </div>
                {isActive && (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: blue ?? '#38bdf8' }}>
                        <Check size={9} className="text-slate-950" />
                    </div>
                )}
            </div>
        </button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export const SettingsModal: React.FC<{ trigger?: React.ReactNode }> = ({ trigger }) => {
    const {
        visibleUtilities, toggleUtility,
        themeMode, accentColor, setThemeMode, setAccentColor,
        terminalThemeId, setTerminalThemeId,
    } = useUIStore();
    const [customHex, setCustomHex] = useState(accentColor);

    const applyCustomHex = () => {
        const hex = customHex.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) setAccentColor(hex);
    };

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
                                <TabsTrigger value="utilities"   className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">Utilidades</TabsTrigger>
                                <TabsTrigger value="general"     className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">General</TabsTrigger>
                                <TabsTrigger value="appearance"  className="text-lg px-0 data-active:bg-transparent border-b-2 border-transparent data-active:border-microtermix-neon rounded-none">Apariencia</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="max-w-5xl mx-auto w-full p-8">

                            {/* ── Utilities ── */}
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

                            {/* ── General ── */}
                            <TabsContent value="general" className="m-0 focus-visible:outline-none">
                                <div className="text-sm text-slate-400">
                                    <p>Configuraciones generales próximamente...</p>
                                </div>
                            </TabsContent>

                            {/* ── Appearance ── */}
                            <TabsContent value="appearance" className="m-0 focus-visible:outline-none space-y-10">

                                {/* Tema */}
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-200">Tema</h3>
                                        <p className="text-sm text-slate-500 mt-0.5">Elige entre modo oscuro o claro.</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <ThemeCard mode="dark"  current={themeMode} accent={accentColor} onClick={() => setThemeMode('dark')} />
                                        <ThemeCard mode="light" current={themeMode} accent={accentColor} onClick={() => setThemeMode('light')} />
                                    </div>
                                </section>

                                <div className="h-px bg-white/5" />

                                {/* Color de acento */}
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-200">Color de acento</h3>
                                        <p className="text-sm text-slate-500 mt-0.5">
                                            Afecta highlights, borders activos, botones primarios y el ring de focus.
                                        </p>
                                    </div>

                                    {/* Presets */}
                                    <div className="flex flex-wrap gap-3">
                                        {ACCENT_PRESETS.map(preset => {
                                            const isActive = accentColor.toLowerCase() === preset.value.toLowerCase();
                                            return (
                                                <button
                                                    key={preset.value}
                                                    title={preset.name}
                                                    onClick={() => { setAccentColor(preset.value); setCustomHex(preset.value); }}
                                                    className={cn(
                                                        'relative w-9 h-9 rounded-full transition-all focus:outline-none',
                                                        'ring-2 ring-offset-2 ring-offset-slate-950',
                                                        isActive ? 'ring-current scale-110' : 'ring-transparent hover:scale-105'
                                                    )}
                                                    style={{
                                                        background:  preset.value,
                                                        ringColor:   isActive ? preset.value : undefined,
                                                        outlineColor: preset.value,
                                                    } as React.CSSProperties}
                                                >
                                                    {isActive && (
                                                        <Check
                                                            size={14}
                                                            className="absolute inset-0 m-auto"
                                                            style={{ color: '#020617' }}
                                                        />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Custom hex */}
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-9 h-9 rounded-full border-2 border-white/10 shrink-0 transition-colors"
                                            style={{ background: customHex }}
                                        />
                                        <Input
                                            value={customHex}
                                            onChange={e => setCustomHex(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && applyCustomHex()}
                                            onBlur={applyCustomHex}
                                            placeholder="#38bdf8"
                                            className="w-36 font-mono text-sm bg-slate-900 border-slate-700 focus-visible:border-microtermix-neon"
                                            maxLength={7}
                                        />
                                        <span className="text-xs text-slate-500">
                                            Ingresá un valor hex y presioná Enter o hacé click fuera.
                                        </span>
                                    </div>

                                    {/* Live preview strip */}
                                    <div className="mt-2 p-4 rounded-xl border border-white/5 bg-white/5 flex items-center gap-4 flex-wrap">
                                        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Preview</span>
                                        <div className="h-5 w-5 rounded-full" style={{ background: accentColor }} />
                                        <div className="h-2 w-24 rounded-full" style={{ background: accentColor, opacity: 0.3 }} />
                                        <button
                                            className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-950"
                                            style={{ background: accentColor }}
                                        >
                                            Botón
                                        </button>
                                        <div
                                            className="px-3 py-1 rounded-md border text-xs font-semibold"
                                            style={{ borderColor: accentColor, color: accentColor }}
                                        >
                                            Outline
                                        </div>
                                        <div className="text-xs font-semibold" style={{ color: accentColor }}>
                                            Texto activo
                                        </div>
                                    </div>
                                </section>

                                <div className="h-px bg-white/5" />

                                {/* Tema de terminal */}
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-200">Tema de Terminal</h3>
                                        <p className="text-sm text-slate-500 mt-0.5">
                                            Paleta de colores del intérprete de comandos. Se aplica en tiempo real sin reiniciar terminales.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {TERMINAL_THEMES.map(t => (
                                            <TerminalThemeCard
                                                key={t.id}
                                                t={t}
                                                isActive={terminalThemeId === t.id}
                                                onClick={() => setTerminalThemeId(t.id)}
                                            />
                                        ))}
                                    </div>
                                </section>

                            </TabsContent>

                        </div>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
