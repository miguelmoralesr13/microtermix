import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

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
  selectedMachineArn: string | null;
  selectedExecutionArn: string | null;
}

interface SfnActions {
  setSelectedMachineArn: (arn: string | null) => void;
  setSelectedExecutionArn: (arn: string | null) => void;
}

export const useSfnStore = create<SfnState & SfnActions>()(
  devtools(
    persist(
      (set) => ({
        selectedMachineArn: null,
        selectedExecutionArn: null,

        setSelectedMachineArn: (arn) => set({ 
          selectedMachineArn: arn, 
          selectedExecutionArn: null 
        }),
        
        setSelectedExecutionArn: (arn) => set({ 
          selectedExecutionArn: arn 
        }),
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
