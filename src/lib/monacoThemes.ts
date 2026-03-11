import { loader } from '@monaco-editor/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IStandaloneThemeData = any;

// ── Curated theme list ────────────────────────────────────────────────────────
// Each entry: { value: theme-id used in <Editor theme=…>, label: display name, file: JSON filename }

export interface MonacoThemeOption {
    value: string;
    label: string;
    dark: boolean;
}

export const MONACO_THEMES: MonacoThemeOption[] = [
    // ── Built-in ──────────────────────────────
    { value: 'vs-dark',               label: 'Dark (built-in)',          dark: true  },
    { value: 'vs',                    label: 'Light (built-in)',          dark: false },
    { value: 'hc-black',              label: 'Alto contraste oscuro',     dark: true  },
    { value: 'hc-light',              label: 'Alto contraste claro',      dark: false },
    // ── Dark ──────────────────────────────────
    { value: 'Dracula',               label: 'Dracula',                   dark: true  },
    { value: 'Night Owl',             label: 'Night Owl',                 dark: true  },
    { value: 'Nord',                  label: 'Nord',                      dark: true  },
    { value: 'Monokai',               label: 'Monokai',                   dark: true  },
    { value: 'Monokai Bright',        label: 'Monokai Bright',            dark: true  },
    { value: 'GitHub Dark',           label: 'GitHub Dark',               dark: true  },
    { value: 'Oceanic Next',          label: 'Oceanic Next',              dark: true  },
    { value: 'Tomorrow-Night',        label: 'Tomorrow Night',            dark: true  },
    { value: 'Tomorrow-Night-Blue',   label: 'Tomorrow Night Blue',       dark: true  },
    { value: 'Tomorrow-Night-Eighties', label: 'Tomorrow Night Eighties', dark: true  },
    { value: 'Cobalt2',               label: 'Cobalt 2',                  dark: true  },
    { value: 'Solarized-dark',        label: 'Solarized Dark',            dark: true  },
    { value: 'Blackboard',            label: 'Blackboard',                dark: true  },
    { value: 'Sunburst',              label: 'Sunburst',                  dark: true  },
    { value: 'Vibrant Ink',           label: 'Vibrant Ink',               dark: true  },
    { value: 'Twilight',              label: 'Twilight',                  dark: true  },
    { value: 'Pastels on Dark',       label: 'Pastels on Dark',           dark: true  },
    // ── Light ─────────────────────────────────
    { value: 'GitHub Light',          label: 'GitHub Light',              dark: false },
    { value: 'GitHub',                label: 'GitHub',                    dark: false },
    { value: 'Solarized-light',       label: 'Solarized Light',           dark: false },
    { value: 'Dawn',                  label: 'Dawn',                      dark: false },
    { value: 'Tomorrow',              label: 'Tomorrow',                  dark: false },
    { value: 'Textmate (Mac Classic)', label: 'Textmate (Mac Classic)',   dark: false },
    { value: 'iPlastic',              label: 'iPlastic',                  dark: false },
    { value: 'Dreamweaver',           label: 'Dreamweaver',               dark: false },
];

// Map theme value → JSON filename (only for non-built-in themes)
const THEME_FILES: Record<string, string> = {
    'Dracula':                  'Dracula',
    'Night Owl':                'Night Owl',
    'Nord':                     'Nord',
    'Monokai':                  'Monokai',
    'Monokai Bright':           'Monokai Bright',
    'GitHub Dark':              'GitHub Dark',
    'Oceanic Next':             'Oceanic Next',
    'Tomorrow-Night':           'Tomorrow-Night',
    'Tomorrow-Night-Blue':      'Tomorrow-Night-Blue',
    'Tomorrow-Night-Eighties':  'Tomorrow-Night-Eighties',
    'Cobalt2':                  'Cobalt2',
    'Solarized-dark':           'Solarized-dark',
    'Blackboard':               'Blackboard',
    'Sunburst':                 'Sunburst',
    'Vibrant Ink':              'Vibrant Ink',
    'Twilight':                 'Twilight',
    'Pastels on Dark':          'Pastels on Dark',
    'GitHub Light':             'GitHub Light',
    'GitHub':                   'GitHub',
    'Solarized-light':          'Solarized-light',
    'Dawn':                     'Dawn',
    'Tomorrow':                 'Tomorrow',
    'Textmate (Mac Classic)':   'Textmate (Mac Classic)',
    'iPlastic':                 'iPlastic',
    'Dreamweaver':              'Dreamweaver',
};

// ── Registration ──────────────────────────────────────────────────────────────

let registered = false;
let _resolveReady!: () => void;

/** Promesa que se resuelve cuando todos los temas han sido registrados en Monaco. */
export const themesReady: Promise<void> = new Promise(resolve => { _resolveReady = resolve; });

export async function registerMonacoThemes(): Promise<void> {
    if (registered) return;
    registered = true;

    const monaco = await loader.init();

    // Load all theme JSONs in parallel
    await Promise.all(
        Object.entries(THEME_FILES).map(async ([themeId, fileName]) => {
            try {
                const data = await import(`../../node_modules/monaco-themes/themes/${fileName}.json`);
                monaco.editor.defineTheme(themeId, data.default as IStandaloneThemeData);
            } catch {
                console.warn(`[monacoThemes] Failed to load theme: ${fileName}`);
            }
        })
    );

    _resolveReady();
}
