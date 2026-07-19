'use client';

import React from 'react';
import { StagePhotoWorkspace } from '@/components/orders/StagePhotoWorkspace';

interface PastingOrderWorkspaceProps {
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

export function PastingOrderWorkspace({
	orderId,
	backHref,
	backLabel,
	secondaryHref,
	secondaryLabel,
}: PastingOrderWorkspaceProps) {
	return (
		<StagePhotoWorkspace
			orderId={orderId}
			role="PASTING"
			stageLabel="Pasting Order Detail"
			stageDescription="Upload the pasting proof photo, then mark the stage complete to move the order forward."
			backHref={backHref}
			backLabel={backLabel}
			dashboardHref={secondaryHref || '/pasting'}
			dashboardLabel={secondaryLabel || 'Open Dashboard'}
			completionHref="/admin/orders"
			proofField="pastingProofUrl"
			photoOptional={true}
		/>
	);
}
