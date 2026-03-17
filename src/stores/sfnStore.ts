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
  definition: string | null;
  logGroupName: string | null;
  selectedMachineArn: string | null;
  selectedExecutionArn: string | null;
  
  loadingMachines: boolean;
  loadingExecutions: boolean;
  loadingHistory: boolean;
  loadingDefinition: boolean;
  
  errorMachines: string | null;
  errorExecutions: string | null;
  errorHistory: string | null;
  errorDefinition: string | null;
}

interface SfnActions {
  fetchMachines: (force?: boolean) => Promise<void>;
  selectMachine: (arn: string) => void;
  fetchExecutions: (machineArn: string) => Promise<void>;
  fetchDefinition: (machineArn: string) => Promise<void>;
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
        definition: null,
        logGroupName: null,
        selectedMachineArn: null,
        selectedExecutionArn: null,
        
        loadingMachines: false,
        loadingExecutions: false,
        loadingHistory: false,
        loadingDefinition: false,
        
        errorMachines: null,
        errorExecutions: null,
        errorHistory: null,
        errorDefinition: null,

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
          set({ 
            selectedMachineArn: arn, 
            executions: [], 
            steps: [], 
            selectedExecutionArn: null,
            definition: null,
            logGroupName: null,
            errorDefinition: null
          });
          get().fetchExecutions(arn);
          get().fetchDefinition(arn);
        },

        fetchExecutions: async (machineArn) => {
          const creds = getRustCreds();
          if (!creds) return;

          const machine = get().machines.find(m => m.arn === machineArn);
          const isExpress = machine?.machineType.includes('EXPRESS');
          let logGroup = get().logGroupName;
          
          // Si es Express y no tenemos logGroup todavía, intentamos deducirlo o esperamos a fetchDefinition
          if (isExpress && !logGroup && machine) {
             logGroup = `/aws/vendedlogs/states/${machine.name}-Logs`;
          }

          set({ loadingExecutions: true, errorExecutions: null });
          try {
            let res: SfnExecution[];
            if (isExpress && logGroup) {
                try {
                    res = await invoke('sfn_list_express_executions_from_logs', { 
                        credentials: creds, 
                        logGroup 
                    });
                } catch (logErr) {
                    console.error("Failed to fetch express executions from logs, falling back to standard API", logErr);
                    res = await invoke('sfn_list_executions', { 
                        credentials: creds, 
                        machineArn 
                    });
                }
            } else {
                res = await invoke('sfn_list_executions', { 
                    credentials: creds, 
                    machineArn 
                });
            }
            set({ executions: res, loadingExecutions: false });
          } catch (e: any) {
            set({ errorExecutions: String(e), loadingExecutions: false });
          }
        },

        fetchDefinition: async (machineArn) => {
          const creds = getRustCreds();
          if (!creds) return;

          set({ loadingDefinition: true, errorDefinition: null });
          try {
            const res: { definition: string, logGroupName: string | null } = await invoke('sfn_describe_state_machine', { 
                credentials: creds, 
                machineArn 
            });
            
            const oldLogGroup = get().logGroupName;
            set({ definition: res.definition, logGroupName: res.logGroupName, loadingDefinition: false });
            
            // Si el logGroup cambió o se descubrió ahora, refrescamos ejecuciones para Express
            const machine = get().machines.find(m => m.arn === machineArn);
            if (machine?.machineType.includes('EXPRESS') && res.logGroupName && res.logGroupName !== oldLogGroup) {
                get().fetchExecutions(machineArn);
            }
          } catch (e: any) {
            set({ errorDefinition: String(e), loadingDefinition: false });
          }
        },

        selectExecution: (executionArn) => {
          set({ selectedExecutionArn: executionArn, steps: [] });
          get().fetchHistory(executionArn);
        },

        fetchHistory: async (executionArn) => {
          const creds = getRustCreds();
          if (!creds) return;

          const selectedMachineArn = get().selectedMachineArn;
          const machine = get().machines.find(m => m.arn === selectedMachineArn);
          const isExpress = machine?.machineType.includes('EXPRESS');
          let logGroup = get().logGroupName;

          if (isExpress && !logGroup && machine) {
             logGroup = `/aws/vendedlogs/states/${machine.name}-Logs`;
          }

          set({ loadingHistory: true, errorHistory: null });
          try {
            let res: SfnStep[];
            if (isExpress && logGroup) {
                res = await invoke('sfn_get_express_execution_history_from_logs', { 
                    credentials: creds, 
                    logGroup,
                    executionArn
                });
            } else {
                res = await invoke('sfn_get_execution_history', { 
                    credentials: creds, 
                    executionArn 
                });
            }
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
