import { useState } from 'react';
import { Settings, RefreshCw, CheckCircle, AlertCircle, ClipboardPaste } from 'lucide-react';
import {
    CwCredentials,
    loadCwConfig,
    saveCwConfig,
    cwGetLogGroups,
    ssmCheckPlugin
} from '../../services/cloudwatchApi';
import { parseAwsCredentialBlock, detectOs, OsTab } from './cwUtils';

interface SettingsTabProps {
    onSaved: () => void;
}

export function SettingsTab({ onSaved }: SettingsTabProps) {
    const [draft, setDraft] = useState<CwCredentials>(() => loadCwConfig());
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteApplied, setPasteApplied] = useState(false);
    const [osTab, setOsTab] = useState<OsTab>(detectOs);

    const handleSave = () => {
        saveCwConfig(draft);
        onSaved();
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft, '');
            await ssmCheckPlugin(draft.ssmPluginPath);
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? String(e));
        } finally {
            setTesting(false);
        }
    };

    function applyPaste(text: string) {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        setDraft(prev => ({ ...prev, ...parsed }));
        setPasteText('');
        setShowPaste(false);
        setPasteApplied(true);
        setTimeout(() => setPasteApplied(false), 2500);
    }

    const field = (label: string, key: keyof CwCredentials, placeholder: string, secret = false) => (
        <div key={key}>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <input
                type={secret ? 'password' : 'text'}
                value={(draft[key] as string) ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-nexus-accent placeholder:text-slate-700"
            />
        </div>
    );

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Settings size={15} /> Credenciales AWS
                </h2>
                <button
                    onClick={() => { setShowPaste(p => !p); setPasteText(''); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${showPaste
                        ? 'bg-nexus-neon/10 text-nexus-neon border-nexus-neon/30'
                        : 'text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'}`}
                    title="Pegar el bloque de credenciales que entrega AWS"
                >
                    <ClipboardPaste size={13} />
                    Pegar bloque AWS
                </button>
            </div>

            {/* ── Paste area ── */}
            {showPaste && (
                <div className="rounded-lg border border-nexus-neon/20 bg-nexus-neon/5 p-3 space-y-2">
                    <p className="text-[11px] text-slate-400">
                        Pega aquí el bloque completo que AWS te da (formato <code className="text-nexus-neon">aws_access_key_id=…</code>).
                        Los campos se rellenarán automáticamente.
                    </p>
                    <textarea
                        autoFocus
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        onPaste={e => {
                            const text = e.clipboardData.getData('text');
                            e.preventDefault();
                            applyPaste(text);
                        }}
                        placeholder={`aws_access_key_id=ASIA…\naws_secret_access_key=…\naws_session_token=…`}
                        rows={5}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-nexus-neon placeholder:text-slate-600 resize-none"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => applyPaste(pasteText)}
                            disabled={!pasteText.trim()}
                            className="px-3 py-1 rounded text-xs bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/30 hover:bg-nexus-neon/20 disabled:opacity-40 transition-colors"
                        >
                            Aplicar
                        </button>
                        <button
                            onClick={() => { setShowPaste(false); setPasteText(''); }}
                            className="px-3 py-1 rounded text-xs text-slate-400 border border-slate-700 hover:text-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {pasteApplied && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">
                    <CheckCircle size={13} /> Credenciales aplicadas — revisa los campos y guarda.
                </div>
            )}

            {field('Región', 'region', 'us-east-1')}
            {field('Access Key ID', 'accessKeyId', 'AKIAIOSFODNN7EXAMPLE')}
            {field('Secret Access Key', 'secretAccessKey', '••••••••••••••••••••', true)}
            {field('Session Token (opcional)', 'sessionToken', 'dejar vacío si no usas STS')}
            {field('Ruta Session Manager Plugin (Opcional)', 'ssmPluginPath', 'Vacío = autodetectar. Ej Win: C:\\...\\session-manager-plugin.exe  Linux: /usr/local/sessionmanagerplugin/bin/session-manager-plugin')}

            {/* SSM Plugin download instructions */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <p className="text-slate-400 mb-2 font-medium">Instalar session-manager-plugin:</p>
                <div className="flex gap-1 mb-3">
                    {(['windows', 'linux', 'macos'] as OsTab[]).map(os => (
                        <button key={os} onClick={() => setOsTab(os)}
                            className={`px-2.5 py-0.5 rounded text-[11px] capitalize transition-colors ${osTab === os ? 'bg-nexus-neon/15 text-nexus-neon border border-nexus-neon/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                            {os === 'macos' ? 'macOS' : os.charAt(0).toUpperCase() + os.slice(1)}
                        </button>
                    ))}
                </div>
                {osTab === 'windows' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Descarga e instala el <span className="text-slate-200">.exe</span> de AWS:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 break-all">
                            https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe
                        </code>
                        <p className="text-slate-500">O con winget:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300">
                            winget install --id Amazon.SessionManagerPlugin
                        </code>
                        <p className="text-slate-500 mt-1">Ruta por defecto tras instalar:<br />
                            <span className="text-slate-400 font-mono">C:\\Program Files\\Amazon\\SessionManagerPlugin\\bin\\session-manager-plugin.exe</span>
                        </p>
                    </div>
                )}
                {osTab === 'linux' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Debian / Ubuntu:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o smp.deb\nsudo dpkg -i smp.deb`}</code>
                        <p className="text-slate-400 mt-1">RHEL / Fedora:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o smp.rpm\nsudo rpm -i smp.rpm`}</code>
                        <p className="text-slate-500 mt-1">Ruta por defecto: <span className="text-slate-400 font-mono">/usr/local/sessionmanagerplugin/bin/session-manager-plugin</span></p>
                    </div>
                )}
                {osTab === 'macos' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Instalar con el paquete .pkg:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/sessionmanager-bundle.zip" -o smp.zip\nunzip smp.zip && sudo ./sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin`}</code>
                        <p className="text-slate-500 mt-1">O con Homebrew:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300">
                            brew install --cask session-manager-plugin
                        </code>
                        <p className="text-slate-500 mt-1">Ruta por defecto: <span className="text-slate-400 font-mono">/usr/local/sessionmanagerplugin/bin/session-manager-plugin</span></p>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 rounded-lg text-xs font-bold transition-colors"
                >
                    Guardar
                </button>
                <button
                    onClick={handleTest}
                    disabled={testing || !draft.accessKeyId || !draft.secretAccessKey}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                    {testing ? <RefreshCw size={12} className="animate-spin" /> : null}
                    {testing ? 'Probando…' : 'Probar conexión'}
                </button>
                {result === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={13} /> Conectado</span>}
                {result === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-red-400" title={errMsg}>
                        <AlertCircle size={13} /> Error
                    </span>
                )}
            </div>
            {result === 'error' && errMsg && (
                <p className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded p-2 leading-snug break-all">{errMsg}</p>
            )}
        </div>
    );
}
