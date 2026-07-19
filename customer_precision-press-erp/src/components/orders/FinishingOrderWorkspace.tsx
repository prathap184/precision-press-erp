'use client';

import React from 'react';
import { StagePhotoWorkspace } from '@/components/orders/StagePhotoWorkspace';

interface FinishingOrderWorkspaceProps {
  orderId: string;
  backHref: string;
  backLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  headerLabel?: string;
  headerDescription?: string;
  framed?: boolean;
  hideHeader?: boolean;
}

export function FinishingOrderWorkspace({
  orderId,
  backHref,
  backLabel,
  secondaryHref,
  secondaryLabel,
}: FinishingOrderWorkspaceProps) {
  return (
    <StagePhotoWorkspace
      orderId={orderId}
      role="FINISHING"
      stageLabel="Finishing Order Detail"
      stageDescription="Upload the finishing photo, then mark the stage complete to advance the job."
      backHref={backHref}
      backLabel={backLabel}
      dashboardHref={secondaryHref || '/finishing'}
      dashboardLabel={secondaryLabel || 'Open Dashboard'}
      completionHref="/admin/orders"
      proofField="finishingProofUrl"
    />
  );
}
