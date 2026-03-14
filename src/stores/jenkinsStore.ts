import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { JenkinsConfig, JenkinsFavorite, normalizeUrl } from '../services/jenkinsApi';

interface JenkinsState {
  accounts: JenkinsConfig[];
  activeAccountId: string | null;
  favorites: Record<string, JenkinsFavorite>;

  // Actions
  addAccount: (config: Omit<JenkinsConfig, 'id'>) => void;
  updateAccount: (id: string, config: Partial<JenkinsConfig>) => void;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;
  toggleFavorite: (fav: JenkinsFavorite) => void;
  updateFavoriteStatus: (url: string, status: Partial<JenkinsFavorite>) => void;
}

// Helpers for the initial migration from the old legacy storage (pre-zustand)
function getLegacyConfig(): JenkinsConfig | null {
  try {
    const old = localStorage.getItem('microtermix-jenkins-cfg');
    if (old) {
      const parsed = JSON.parse(old);
      if (parsed.baseUrl) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function getLegacyFavorites(): Record<string, JenkinsFavorite> {
  try {
    const old = localStorage.getItem('microtermix-jenkins-favs');
    if (old) {
      const arr: JenkinsFavorite[] = JSON.parse(old);
      const map: Record<string, JenkinsFavorite> = {};
      arr.forEach(f => {
        map[normalizeUrl(f.url)] = f;
      });
      return map;
    }
  } catch { /* ignore */ }
  return {};
}

export const useJenkinsStore = create<JenkinsState>()(
  persist(
    (set) => ({
      accounts: [],
      activeAccountId: null,
      favorites: {},

      addAccount: (config) => set((state) => {
        const id = crypto.randomUUID();
        const newAccount = { ...config, id };
        return {
          accounts: [...state.accounts, newAccount],
          activeAccountId: state.activeAccountId || id, // auto-select if first
        };
      }),

      updateAccount: (id, config) => set((state) => ({
        accounts: state.accounts.map(acc => acc.id === id ? { ...acc, ...config } : acc)
      })),

      removeAccount: (id) => set((state) => {
        const newAccounts = state.accounts.filter(acc => acc.id !== id);
        return {
          accounts: newAccounts,
          activeAccountId: state.activeAccountId === id
            ? (newAccounts.length > 0 ? newAccounts[0].id : null)
            : state.activeAccountId
        };
      }),

      setActiveAccount: (id) => set({ activeAccountId: id }),

      toggleFavorite: (fav) => set((state) => {
        const key = normalizeUrl(fav.url);
        const next = { ...state.favorites };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = fav;
        }
        return { favorites: next };
      }),

      updateFavoriteStatus: (url, status) => set((state) => {
        const key = normalizeUrl(url);
        if (!state.favorites[key]) return state;
        return {
          favorites: {
            ...state.favorites,
            [key]: { ...state.favorites[key], ...status }
          }
        };
      }),
    }),
    {
      name: 'microtermix-jenkins-storage',
      version: 1, // Start at version 1 for migrations
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrate from version 0 (single config) to version 1 (multiple accounts)
          const state = persistedState as any;
          const accounts: JenkinsConfig[] = [];
          let activeAccountId = null;

          if (state.config && state.config.baseUrl) {
            const id = crypto.randomUUID();
            accounts.push({ ...state.config, id, name: 'Default Account' });
            activeAccountId = id;
          }

          return {
            accounts,
            activeAccountId,
            favorites: state.favorites || {},
          };
        }
        return persistedState as JenkinsState;
      },
      onRehydrateStorage: () => (state) => {
        // If state is completely empty (no accounts) check legacy localStorage
        if (state && state.accounts.length === 0) {
          const legacyCfg = getLegacyConfig();
          if (legacyCfg) {
            const id = crypto.randomUUID();
            state.accounts = [{ ...legacyCfg, id, name: 'Default Account' }];
            state.activeAccountId = id;
          }
          const legacyFavs = getLegacyFavorites();
          if (Object.keys(legacyFavs).length > 0) {
            state.favorites = legacyFavs;
          }
        }
      }
    }
  )
);
