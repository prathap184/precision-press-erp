export interface GlobalStats {
  financial: {
    totalSales: number;
    totalReceipts: number;
    totalPendingVerification: number;
    totalUnpaid: number;
    totalOutstanding: number;
    totalCreditExposure: number;
  };
  orders: {
    total: number;
    placed: number;
    paymentPending: number;
    verified: number;
    assigned: number;
    inProgress: number;
    completed: number;
    dispatched: number;
    cancelled: number;
  };
  production: {
    activeJobs: number;
    completedJobs: number;
    jobsPerPrinter: Record<string, number>;
  };
  payments: {
    pending: number;
    approved: number;
    rejected: number;
  };
  dispatch: {
    pending: number;
    completed: number;
  };
  lastUpdated?: any;
  system?: {
    lastUpdated: any;
  };
}
