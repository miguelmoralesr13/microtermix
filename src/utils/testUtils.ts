import { type CoverageStat, type CoverageSummary } from '../stores/coverageStore';

export type TestLanguage = 'node' | 'python' | 'java' | 'go' | 'custom';

export interface TestConfig {
    language: TestLanguage;
    command: string;
    testFilter: string;
    junitXmlPath: string;
    coverageXmlPath: string;
    coverageHtmlPath: string;
}

export const DEFAULT_CONFIG: TestConfig = {
    language: 'node',
    command: 'npm run test',
    testFilter: '',
    junitXmlPath: 'junit.xml',
    coverageXmlPath: 'coverage/clover.xml',
    coverageHtmlPath: 'coverage/lcov-report/index.html',
};

export const PRESETS: Record<TestLanguage, { label: string; config: TestConfig }> = {
    node: {
        label: 'Node (Vitest/Jest)',
        config: {
            language: 'node',
            command: 'npm run test',
            testFilter: '',
            junitXmlPath: 'junit.xml',
            coverageXmlPath: 'coverage/clover.xml',
            coverageHtmlPath: 'coverage/lcov-report/index.html'
        }
    },
    python: {
        label: 'Python (Pytest)',
        config: {
            language: 'python',
            command: 'pytest --junitxml=report.xml --cov=. --cov-report=xml --cov-report=html',
            testFilter: '',
            junitXmlPath: 'report.xml',
            coverageXmlPath: 'coverage.xml',
            coverageHtmlPath: 'htmlcov/index.html'
        }
    },
    java: {
        label: 'Java (Maven)',
        config: {
            language: 'java',
            command: 'mvn test',
            testFilter: '',
            junitXmlPath: 'target/surefire-reports/TEST-*.xml',
            coverageXmlPath: 'target/site/jacoco/jacoco.xml',
            coverageHtmlPath: 'target/site/jacoco/index.html'
        }
    },
    go: {
        label: 'Go',
        config: {
            language: 'go',
            command: 'go test ./... -v -coverprofile=coverage.out',
            testFilter: '',
            junitXmlPath: 'report.xml',
            coverageXmlPath: 'coverage.out',
            coverageHtmlPath: 'coverage.html'
        }
    },
    custom: {
        label: 'Custom',
        config: { ...DEFAULT_CONFIG, language: 'custom' }
    }
};

export function detectLanguage(project: any): TestLanguage {
    const type = (project.project_type || '').toLowerCase();
    const framework = (project.framework || '').toLowerCase();
    if (type === 'bun') return 'node';
    if (type === 'node') return 'node';
    if (type === 'python') return 'python';
    if (type === 'java' || type === 'maven') return 'java';
    if (type === 'go') return 'go';
    if (framework === 'spring-boot') return 'java';
    if (framework === 'django' || framework === 'fastapi' || framework === 'flask') return 'python';
    return 'custom';
}

export function buildFinalCommand(config: TestConfig): string {
    const { command, testFilter, language } = config;
    if (!testFilter.trim()) return command;
    switch (language) {
        case 'node': return `${command} -- -t "${testFilter}"`;
        case 'python': return `${command} -k "${testFilter}"`;
        case 'java': return `${command} -Dtest=${testFilter}`;
        case 'go': return `${command} -run ${testFilter}`;
        default: return `${command} ${testFilter}`;
    }
}

export function configStorageKey(projectPath: string): string {
    return `microtermix-test-config-${projectPath.replace(/[/\\:]/g, '_')}`;
}

export function loadConfig(projectPath: string): TestConfig {
    try {
        const raw = localStorage.getItem(configStorageKey(projectPath));
        if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (_) { }
    return { ...DEFAULT_CONFIG };
}

export function saveConfig(projectPath: string, config: TestConfig): void {
    try { localStorage.setItem(configStorageKey(projectPath), JSON.stringify(config)); } catch (_) { }
}

export function dirOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.substring(0, idx) : normalized;
}

export function parseCoverageXml(content: string): CoverageSummary | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const cloverMetrics = doc.querySelector('project > metrics');
        if (cloverMetrics) {
            return {
                lines: { covered: parseInt(cloverMetrics.getAttribute('coveredstatements') || '0'), total: parseInt(cloverMetrics.getAttribute('statements') || '0') },
                branches: { covered: parseInt(cloverMetrics.getAttribute('coveredconditionals') || '0'), total: parseInt(cloverMetrics.getAttribute('conditionals') || '0') },
                functions: { covered: parseInt(cloverMetrics.getAttribute('coveredmethods') || '0'), total: parseInt(cloverMetrics.getAttribute('methods') || '0') },
            };
        }
        const reportEl = doc.querySelector('report');
        if (reportEl) {
            const getCounter = (type: string): CoverageStat => {
                const el = Array.from(doc.querySelectorAll('report > counter')).find(c => c.getAttribute('type') === type);
                if (el) {
                    const covered = parseInt(el.getAttribute('covered') || '0');
                    const missed = parseInt(el.getAttribute('missed') || '0');
                    return { covered, total: covered + missed };
                }
                return { covered: 0, total: 0 };
            };
            return { lines: getCounter('LINE'), branches: getCounter('BRANCH'), functions: getCounter('METHOD') };
        }
        const coverageEl = doc.querySelector('coverage');
        if (coverageEl) {
            const linesValid = parseInt(coverageEl.getAttribute('lines-valid') || '0');
            const linesCovered = parseInt(coverageEl.getAttribute('lines-covered') || '0');
            const branchRate = parseFloat(coverageEl.getAttribute('branch-rate') || '0');
            return {
                lines: { covered: linesCovered, total: linesValid },
                branches: { covered: Math.round(branchRate * 100), total: 100 },
                functions: { covered: 0, total: 0 },
            };
        }
        return null;
    } catch (_) { return null; }
}

export function pct(stat: CoverageStat | undefined | null): number {
    if (!stat || stat.total === 0) return 0;
    return Math.round((stat.covered / stat.total) * 100);
}

export function pctColor(p: number) {
    if (p >= 80) return { text: 'text-microtermix-success', bar: 'bg-microtermix-success' };
    if (p >= 60) return { text: 'text-yellow-400', bar: 'bg-yellow-400' };
    return { text: 'text-microtermix-danger', bar: 'bg-microtermix-danger' };
}
