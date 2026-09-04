import { UserRole, UserProfile } from './auth';
export type { UserRole, UserProfile };
import { OrderStatus, OrderWorkflowSnapshot, WorkflowStep } from "@/types/workflow";
import { StaffRole } from './roles';

// ─── Design Workspace Types ───────────────────────────────────────────────────

export type DesignType = 'COMPANY_DESIGN' | 'CUSTOMER_DESIGN';

export type ItemDesignStatus = 
  | 'WAITING_FOR_CUSTOMER_UPLOAD'
  | 'UPLOADED_BY_CUSTOMER'
  | 'WAITING_FOR_DESIGNER'
  | 'DESIGN_IN_PROGRESS'
  | 'PROOF_SENT'
  | 'CUSTOMER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'FINAL_READY';

/** Lightweight workspace metadata stored inside the OrderItem document */
export interface ItemDesignWorkspace {
  cloudinaryFolder: string;              // e.g. "designs/ORD-836633/item_abc123"
  currentProofVersion?: number;          // Latest proof version number
  finalDesignUrl?: string;               // Set when design is FINAL_READY
  customerUploadUrl?: string;            // CUSTOMER_DESIGN: original customer artwork URL (NEVER overwrite)
  customerUploadedAt?: any;              // When customer uploaded their artwork
  designerUploadUrl?: string;
  designerUploadedAt?: any;
}

/** Represents a document in the `orders/{orderId}/items/{itemId}/revisions/{revisionId}` sub-collection */
export interface DesignRevision {
  id: string;                            // auto-generated
  orderId: string;
  itemId: string;
  version: number;
  url: string;                           // Cloudinary URL
  cloudinaryPublicId: string;
  cloudinaryFolder: string;
  uploadedBy: string;                    // userId
  uploadedByName: string;
  uploadedAt: any;                       // Firestore timestamp
  notes?: string;
  revisionType: 'CUSTOMER_ORIGINAL' | 'INITIAL' | 'CORRECTION' | 'FINAL';
  uploadStats?: {
    originalSize: string;
    compressedSize: string;
    ratio: string;
    filename: string;
  };
}

/** Represents a document in the `orders/{orderId}/items/{itemId}/proofs/{proofId}` sub-collection */
export interface ItemDesignProof {
  id: string;
  orderId: string;
  itemId: string;
  version: number;
  revisionVersion: number;
  revisionId?: string;                    // Refers to the specific revision sent as proof
  url: string;                           // Cloudinary URL
  cloudinaryPublicId: string;
  sentAt: any;                           // Firestore timestamp
  sentBy: string;
  sentByName: string;
  customerResponse?: 'PENDING' | 'APPROVED' | 'REJECTED';
  responseAt?: any;                      // Firestore timestamp
  rejectionReason?: string;
  notes?: string;
}

/** Represents a document in the `orders/{orderId}/items/{itemId}/comments/{commentId}` sub-collection */
export interface DesignComment {
  id: string;
  orderId: string;
  itemId: string;
  message: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  createdAt: any;                        // Firestore timestamp
  attachmentUrl?: string;
}

// ─── End Design Workspace Types ───────────────────────────────────────────────

// UserProfile is imported from auth.ts to maintain a single source of truth

export interface Order {
  id: string; // ORD-XXXXX
  customerId: string;
  customerName?: string; // UI alias
  customerSnapshot: {
    name: string;
    displayName?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  status: OrderStatus;
  paymentStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'PAID';
  paymentMethod?: 'CASH' | 'UPI' | 'BANK' | 'CREDIT'; // UI usage
  orderType: 'CASH' | 'CREDIT';
  orderSource: 'WEB' | 'SUPPORT' | 'COUNTER';
  createdBy: string;
  createdByRole: UserRole;
  
  amounts: {
    base: number;
    extras: number;
    gst: number;
    voucherGstDiscount?: number;
    grandTotal: number;
  };
  
  voucherApplied?: boolean;
  
  // Flatted aliases for UI components
  grandTotal?: number;
  taxAmount?: number;
  totalAmount?: number;

  items?: OrderItem[];

  workflow: {
    assignedTo?: string;
    assignedToName?: string;
    assignedBy?: string;
    assignedByName?: string;
    assignedAt?: any;
    startedAt?: any;
    completedAt?: any;
    dispatchedAt?: any;
    paymentVerifiedAt?: any;
    customerDesignProvided?: boolean;
    customerDesignUrl?: string;
    customerDesignFiles?: CustomerDesignFile[];
    designerProofs?: DesignerProof[];
    customerApproval?: CustomerApprovalState;
    customerRevisionRequired?: boolean;
    redesignNotes?: string;
    correctionRequirements?: string;
    designUrl?: string;
    designNotes?: string;
    deliveryProof?: {
      url: string;
      uploadedBy?: string;
      uploadedByName?: string;
      uploadedAt?: any;
    };
    sentForApprovalAt?: any;
    designApprovedAt?: any;
    designApprovedByCustomer?: boolean;
    designRejectedAt?: any;
    latestRejectionNotes?: string;
    designedBy?: string;
    designedByName?: string;
    printWorkflow?: PrintWorkflowState;
  };

  printWorkflow?: PrintWorkflowState;

  /** Dynamic Production Workflow Snapshot */
  workflowSnapshot?: OrderWorkflowSnapshot;
  currentWorkflowRole?: string | null;
  currentWorkflowLabel?: string | null;

  /** Printer category copied from the product at order creation time */
  printerCategory?: string;

  verifiedBy?: string;
  productionNotes?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  thumbnailUrl?: string;
  
  delivery: {
    choice: 'PICKUP' | 'TRANSPORT' | 'COURIER' | 'DOOR_DELIVERY';
    address?: string;
    pricingSnapshot?: any;
  };

  dispatchInfo?: {
    method: 'PICKUP' | 'COURIER' | 'TRANSPORT' | 'DOOR_DELIVERY' | 'SELF_PICKUP';
    transportName?: string;
    lrNumber?: string;
    notes?: string;
    dispatchedByName?: string;
    dispatchedAt?: any;
  };

  deliveryProof?: {
    url: string;
    uploadedBy?: string;
    uploadedByName?: string;
    uploadedAt?: any;
  };
  
  proxyExecutor?: {
    uid: string;
    role: UserRole;
    name?: string;
  };
  
  proxyName?: string;
  shippingAddress?: string;
  productName?: string;
  description?: string;

  baseOrderId?: string;
  groupOrderIds?: string[];

  createdAt: any;
  updatedAt: any;
}

export interface CustomerDesignFile {
  url: string;
  fileName?: string;
  uploadedAt: any;
  uploadedBy?: string;
}

export interface DesignerProof {
  version: number;
  url: string;
  notes?: string;
  uploadedBy?: string;
  uploadedAt: any;
  customerResponse?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

export interface CustomerApprovalState {
  status: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
  approvedBy?: string;
  currentProofVersion?: number;
}

export interface PrintWorkflowTimelineEntry {
  event: 'TIFF_ASSIGNED' | 'TIFF_OPENED' | 'PRINT_STARTED' | 'PRINT_COMPLETED';
  timestamp: any;
  user?: string;
  notes?: string;
  tiffPath?: string;
}

export interface PrintWorkflowItemAssignment {
  itemId: string;
  tiffPath: string;
  printerId: string;
  printerName?: string;
  assignedBy?: string;
  assignedAt?: any;
}

export interface PrintWorkflowState {
  status?: 'TIFF_PENDING' | 'TIFF_READY' | 'PRINT_STARTED' | 'PRINT_COMPLETED';
  sourceDesignPath?: string;
  sourceDesignType?: string;
  tiffPath?: string;
  tiffFileName?: string;
  convertedBy?: string;
  convertedAt?: any;
  sentToPrinter?: boolean;
  sentToPrinterAt?: any;
  sentToPrinterBy?: string;
  printerOpened?: boolean;
  printerOpenedAt?: any;
  printerAcceptedBy?: string;
  printerAcceptedByName?: string;
  printerAcceptedAt?: any;
  printerCompleted?: boolean;
  printerCompletedAt?: any;
  printerCompletedBy?: string;
  printerCompletedByName?: string;
  networkFolder?: string;
  materialUsage?: {
    paperUsed?: string;
    inkUsed?: string;
    wastageNotes?: string;
  };
  itemAssignments?: PrintWorkflowItemAssignment[];
  timeline?: PrintWorkflowTimelineEntry[];
}

export interface ProductionJob {
  id: string;
  orderId: string;
  productName: string;
  category: string;
  sqft: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  printerId?: string;
  notes?: string;
  startedAt?: any;
  completedAt?: any;
  createdAt: any;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  method: 'UPI' | 'BANK' | 'CASH';
  proofUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedBy?: string;
  verifiedAt?: any;
  createdAt: any;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  productId: string;
  description?: string;
  notes?: string;
  category?: string; 
  projectName?: string;
  specs: {
    width: number;
    height: number;
    quantity: number;
    sqft: number;
    widthUnit: 'FT' | 'IN';
    heightUnit: 'FT' | 'IN';
  };
  materialMetadata: {
    materialType: string;
    eyeletType: 'METAL' | 'PLASTIC' | 'NONE';
    eyeletCount: number;
    printType?: string;
  };
  // Snapshot of pricing at time of order
  pricingSnapshot: {
    baseRate: number;
    eyeletRate: number;
    subTotal: number;
    tax: number;
  };
  fileUrl: string;
  designUrl?: string;
  designStatus?: ItemDesignStatus;
  designUploadStats?: {
    originalSize: string;
    compressedSize: string;
    ratio: string;
    filename: string;
  };
  tiffPath?: string;
  assignedPrinterId?: string;
  assignedPrinterName?: string;
  tiffAssignedAt?: any;
  tiffAssignedBy?: string;
  designType?: DesignType;
  itemWorkspace?: ItemDesignWorkspace;
}

export interface Product {
  id: string; // The ID input by user (e.g. 6000)
  name: string;
  category: string;
  baseRate: number;
  current_stock?: number;
  
  // HSN & Tax Fields
  hsn_master_id?: string;
  hsn_code?: string;
  hsn_description?: string;
  gst_rate?: number;
  gst_effective_from?: string;
  product_snapshot_version?: number;
  
  eyeletPricing: {
    metal: number;
    plastic: number;
    none: 0;
  };

  deliveryPricing: {
    selfPickup: 0;
    door: number;
    courier: number;
    transport: number;
  };

  media: {
    images: string[];
    video?: {
      url: string;
    };
  };

  specs: {
    maxWidth?: string;
    gsm?: string;
    description?: string;
  };

  /** Printer category — which machine type handles this product */
  printerCategory?: string;

  status: "ACTIVE" | "INACTIVE";
  
  /** Dynamic Workflow Definition for this product */
  workflowSteps?: WorkflowStep[];

  /** Tally Dual Billing Mode and Units */
  tally_billing_mode?: 'A' | 'B';
  tallyBillingMode?: 'A' | 'B';
  tally_uom?: string;
  tally_alt_uom?: string;

  createdAt: any;
  updatedAt: any;
}

export interface Transaction {
  id: string;
  userId: string;
  totalBefore?: number;
  totalAfter?: number;
  type: 'SALE' | 'RECEIPT' | 'ADJUSTMENT' | 'OPENING';
  ledgerType?: 'CASH' | 'CREDIT';
  refId: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  remarks?: string;
  createdBy: string;
  timestamp: any;
}

export interface PaymentSubmission {
  id: string;
  userId: string;
  amount: number;
  method: 'UPI' | 'BANK' | 'CASH';
  proofUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  verifiedBy?: string;
  verifiedAt?: any;
  createdAt: any;
  orderIds?: string[]; // Optional array for grouped payments
}

export interface DispatchRecord {
  orderId: string;
  status: 'DISPATCHED';
  method: string;
  details: string;
  dispatchedAt: any;
}

export interface Invoice {
  id: string; // INV-XXXXXX (same as parentOrderId stripped of ORD- prefix, e.g., INV-656489)
  parentOrderId: string; // ORD-656489 or the base ID for grouped orders
  childOrderIds: string[]; // child order IDs for grouped orders; for single order = [parentOrderId]
  invoiceNumber: string; // same as id
  customerId: string;
  customerSnapshot: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: {
    orderId: string;
    productName: string;
    quantity: number;
    sqft: number;
    baseAmount: number;
    finishAmount: number;
    itemTotal: number;
  }[];
  amounts: {
    itemsSubtotal: number; // sum of all item totals (NO transport here)
    transport: number;     // Parent Order level only
    gst: number;
    discount: number;
    grandTotal: number;
  };
  status: 'GENERATED' | 'SENT' | 'PAID';
  generatedBy: string; // uid
  generatedByName?: string;
  orderType: 'CASH' | 'CREDIT';
  paymentStatus?: string;
  createdAt: any;
  updatedAt?: any;
}

