import { OrderWorkflowSnapshot } from '@/types/workflow';
import { StaffRole } from '@/types/roles';

export type WorkspaceMode = 'ACTIVE' | 'READ_ONLY' | 'LOCKED';

/**
 * Calculates the workspace access mode based on the current stage role and workflow snapshot.
 * - ACTIVE: The stage is currently active. All edits and actions are enabled.
 * - READ_ONLY: The stage is completed. Viewing is allowed, but mutations/actions are disabled.
 * - LOCKED: The stage is in the future.
 */
export function getWorkspaceMode(
  stageRole: StaffRole,
  workflowSnapshot?: OrderWorkflowSnapshot | null
): WorkspaceMode {
  if (!workflowSnapshot || !workflowSnapshot.steps) {
    return 'LOCKED';
  }

  const stepIndex = workflowSnapshot.steps.findIndex((s) => s.role === stageRole);
  if (stepIndex === -1) {
    return 'LOCKED';
  }

  const currentStepIndex = workflowSnapshot.currentStepIndex;

  if (stepIndex === currentStepIndex) {
    return 'ACTIVE';
  } else if (stepIndex < currentStepIndex) {
    return 'READ_ONLY';
  } else {
    return 'LOCKED';
  }
}
