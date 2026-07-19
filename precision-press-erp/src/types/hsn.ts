export interface HSNMaster {
  id: string;
  hsn_code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  reason_for_change?: string;
}

export interface HSNGSTRate {
  id: string;
  hsn_id: string;
  gst_rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  reason_for_change?: string;
}

export interface HSNWithRate extends HSNMaster {
  current_rate: HSNGSTRate | null;
  products_count?: number;
}
