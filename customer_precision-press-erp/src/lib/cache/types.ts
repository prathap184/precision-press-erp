import { Product } from '@/types/models';
import { WorkflowStep } from '@/types/workflow';

export interface CachedProductListEntry {
  id: string;
  name: string;
  category: string;
  baseRate: number;
  status: string;
}

export interface CachedProductDetails {
  id: string;
  name: string;
  category: string;
  baseRate: number;
  deliveryPricing: any;
  eyeletPricing: any;
  media: any;
  specs: any;
  printerCategory?: string;
  status: string;
}

export interface CachedWorkflow {
  productId: string;
  steps: WorkflowStep[];
}

export interface CacheMetricsData {
  hits: number;
  misses: number;
  errors: number;
  latencySum: number;
  latencyCount: number;
  fallbacks: number;
  rebuilds: number;
  invalidations: number;
  warmupDuration: number;
  lastWarmupTime: string | null;
}
