import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from './awsStore';
import { toast } from 'sonner';

export interface SfnMachine {
  arn: string;
  name: string;
  machineType: string;
  createdAt: number;
}

export interface SfnExecution {
  executionArn: string;
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startDate: number;
  stopDate?: number;
}

export interface SfnStep {
  name: string;
  status: 'running' | 'succeeded' | 'failed' | 'caught';
  enteredAt: number;
  exitedAt?: number;
  durationMs?: number;
  input: string;
  output?: string;
  error?: string;
  cause?: string;
  lambdaArn?: string;
}

interface SfnState {
  machines: SfnMachine[];
  executions: SfnExecution[];
  steps: SfnStep[];
  selectedMachineArn: string | null;
  selectedExecutionArn: string | null;
  
  loadingMachines: boolean;
  loadingExecutions: boolean;
  loadingHistory: boolean;
  
  errorMachines: string | null;
  errorExecutions: string | null;
  errorHistory: string | null;
}

interface SfnActions {
  fetchMachines: (force?: boolean) => Promise<void>;
  selectMachine: (arn: string) => void;
  fetchExecutions: (machineArn: string) => Promise<void>;
  selectExecution: (executionArn: string) => void;
  fetchHistory: (executionArn: string) => Promise<void>;
  startExecution: (machineArn: string, input: string) => Promise<void>;
}

const getRustCreds = () => {
    const credentials = useAwsStore.getState().credentials;
    if (!credentials) return null;
    return {
        access_key_id: credentials.accessKeyId,
        secret_access_key: credentials.secretAccessKey,
        region: credentials.region,
        session_token: credentials.sessionToken || null,
    };
};

export const useSfnStore = create<SfnState & SfnActions>()(
  devtools(
    persist(
      (set, get) => ({
        machines: [],
        executions: [],
        steps: [],
        selectedMachineArn: null,
        selectedExecutionArn: null,
        
        loadingMachines: false,
        loadingExecutions: false,
        loadingHistory: false,
        
        errorMachines: null,
        errorExecutions: null,
        errorHistory: null,

        fetchMachines: async (force = false) => {
          const creds = getRustCreds();
          if (!creds) return;
          
          const { machines, loadingMachines } = get();
          if (!force && machines.length > 0 && !loadingMachines) return;

          set({ loadingMachines: true, errorMachines: null });
          try {
            const res: SfnMachine[] = await invoke('sfn_list_state_machines', { credentials: creds });
            set({ machines: res, loadingMachines: false });
          } catch (e: any) {
            set({ errorMachines: String(e), loadingMachines: false });
          }
        },

        selectMachine: (arn) => {
          set({ selectedMachineArn: arn, executions: [], steps: [], selectedExecutionArn: null });
          get().fetchExecutions(arn);
        },

        fetchExecutions: async (machineArn) => {
          const creds = getRustCreds();
          if (!creds) return;

          set({ loadingExecutions: true, errorExecutions: null });
          try {
            const res: SfnExecution[] = await invoke('sfn_list_executions', { 
                credentials: creds, 
                machineArn 
            });
            set({ executions: res, loadingExecutions: false });
          } catch (e: any) {
            set({ errorExecutions: String(e), loadingExecutions: false });
          }
        },

        selectExecution: (executionArn) => {
          set({ selectedExecutionArn: executionArn, steps: [] });
          get().fetchHistory(executionArn);
        },

        fetchHistory: async (executionArn) => {
          const creds = getRustCreds();
          if (!creds) return;

          set({ loadingHistory: true, errorHistory: null });
          try {
            const res: SfnStep[] = await invoke('sfn_get_execution_history', { 
                credentials: creds, 
                executionArn 
            });
            set({ steps: res, loadingHistory: false });
          } catch (e: any) {
            set({ errorHistory: String(e), loadingHistory: false });
          }
        },

        startExecution: async (machineArn, input) => {
          const creds = getRustCreds();
          if (!creds) return;

          try {
            await invoke('sfn_start_execution', { 
                credentials: creds, 
                machineArn, 
                input 
            });
            toast.success('Execution started successfully');
            get().fetchExecutions(machineArn);
          } catch (e: any) {
            toast.error(`Failed to start execution: ${e}`);
          }
        }
      }),
      {
        name: 'microtermix-sfn-store',
        partialize: (s) => ({
          selectedMachineArn: s.selectedMachineArn,
        }),
      }
    ),
    { name: 'SfnStore' }
  )
);
