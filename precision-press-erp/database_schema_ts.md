# Database Schema (from TypeScript Interfaces)

## Table / Interface: `DeliveryAddress`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | unique ID |
| `pincode` | `string` |  |
| `state` | `string` |  |
| `city` | `string` |  |
| `houseNumber` | `string` | House No., Building Name |
| `roadName` | `string` | Road Name, Area, Colony |
| `isDefault?` | `boolean` |  |

## Table / Interface: `UserProfile`

| Field | Type | Description |
|---|---|---|
| `uid` | `string` |  |
| `email` | `string` |  |
| `name` | `string` |  |
| `displayName?` | `string` |  |
| `photoURL?` | `string` |  |
| `role` | `UserRole` |  |
| `roles?` | `StaffRole[]` |  |
| `printerCategory?` | `string` |  |
| `status` | `'ACTIVE' | 'BLOCKED' | StaffStatus` |  |
| `customerType` | `'CASH' | 'CREDIT'` |  |
| `creditLimit` | `number` |  |
| `usedCredit` | `number` |  |
| `creditStatus?` | `'PENDING_APPROVAL' | 'APPROVED'` |  |
| `businessName?` | `string` |  |
| `company_name?` | `string` |  |
| `contact_person?` | `string` |  |
| `phone?` | `string` |  |
| `alternate_mobile?` | `string` |  |
| `pan_number?` | `string` |  |
| `address?` | `string` | Legacy single address |
| `addresses?` | `DeliveryAddress[]` | New structured address book |
| `defaultAddressId?` | `string` |  |
| `billing_address_line1?` | `string` |  |
| `billing_address_line2?` | `string` |  |
| `billing_area?` | `string` |  |
| `billing_city?` | `string` |  |
| `billing_district?` | `string` |  |
| `billing_state?` | `string` |  |
| `billing_state_code?` | `string` |  |
| `billing_pincode?` | `string` |  |
| `billing_country?` | `string` |  |
| `shipping_same_as_billing?` | `boolean` |  |
| `consignee_name?` | `string` |  |
| `consignee_contact?` | `string` |  |
| `consignee_mobile?` | `string` |  |
| `consignee_gstin?` | `string` |  |
| `shipping_address_line1?` | `string` |  |
| `shipping_address_line2?` | `string` |  |
| `shipping_area?` | `string` |  |
| `shipping_city?` | `string` |  |
| `shipping_district?` | `string` |  |
| `shipping_state?` | `string` |  |
| `shipping_state_code?` | `string` |  |
| `shipping_pincode?` | `string` |  |
| `shipping_country?` | `string` |  |
| `state?` | `string` |  |
| `country?` | `string` |  |
| `pincode?` | `string` |  |
| `gstType?` | `'Regular' | 'Composition' | 'Unregistered'` |  |
| `gstNumber?` | `string` |  |
| `gstVerified?` | `boolean` |  |
| `gstDetails?` | `any` |  |
| `voucherType?` | `'Type 0' | 'Type 1'` |  |
| `membership?` | `{` |  |
| `tier` | `'STANDARD' | 'GOLD' | 'PLATINUM'` |  |
| `totalSpend` | `number` |  |
| `nextTierAt` | `number` |  |
| `totalEarned?` | `number` |  |
| `loyaltyPoints?` | `number` |  |
| `createdAt` | `any` |  |
| `updatedAt?` | `any` |  |
| `lastLogin?` | `any` |  |

## Table / Interface: `HSNMaster`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `hsn_code` | `string` |  |
| `description` | `string` |  |
| `is_active` | `boolean` |  |
| `created_at` | `string` |  |
| `updated_at` | `string` |  |
| `created_by?` | `string` |  |
| `updated_by?` | `string` |  |
| `reason_for_change?` | `string` |  |

## Table / Interface: `HSNGSTRate`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `hsn_id` | `string` |  |
| `gst_rate` | `number` |  |
| `effective_from` | `string` |  |
| `effective_to` | `string | null` |  |
| `created_at` | `string` |  |
| `updated_at` | `string` |  |
| `created_by?` | `string` |  |
| `updated_by?` | `string` |  |
| `reason_for_change?` | `string` |  |

## Table / Interface: `HSNWithRate`

| Field | Type | Description |
|---|---|---|
| `current_rate` | `HSNGSTRate | null` |  |
| `products_count?` | `number` |  |

## Table / Interface: `LedgerEntry`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `customerId` | `string` |  |
| `orderId?` | `string` |  |
| `type` | `'DEBIT' | 'CREDIT'` |  |
| `amount` | `number` |  |
| `debit?` | `number` |  |
| `credit?` | `number` |  |
| `runningBalance` | `number` |  |
| `narration` | `string` |  |
| `referenceNumber?` | `string` |  |
| `thumbnailUrl?` | `string` |  |
| `createdAt` | `string` | ISO String |
| `createdBy` | `string` |  |

## Table / Interface: `ItemDesignWorkspace`

| Field | Type | Description |
|---|---|---|
| `cloudinaryFolder` | `string` | e.g. "designs/ORD-836633/item_abc123" |
| `currentProofVersion?` | `number` | Latest proof version number |
| `finalDesignUrl?` | `string` | Set when design is FINAL_READY |
| `customerUploadUrl?` | `string` | CUSTOMER_DESIGN: original customer artwork URL (NEVER overwrite) |
| `customerUploadedAt?` | `any` | When customer uploaded their artwork |
| `designerUploadUrl?` | `string` |  |
| `designerUploadedAt?` | `any` |  |

## Table / Interface: `DesignRevision`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | auto-generated |
| `orderId` | `string` |  |
| `itemId` | `string` |  |
| `version` | `number` |  |
| `url` | `string` | Cloudinary URL |
| `cloudinaryPublicId` | `string` |  |
| `cloudinaryFolder` | `string` |  |
| `uploadedBy` | `string` | userId |
| `uploadedByName` | `string` |  |
| `uploadedAt` | `any` | Firestore timestamp |
| `notes?` | `string` |  |
| `revisionType` | `'CUSTOMER_ORIGINAL' | 'INITIAL' | 'CORRECTION' | 'FINAL'` |  |
| `uploadStats?` | `{` |  |
| `originalSize` | `string` |  |
| `compressedSize` | `string` |  |
| `ratio` | `string` |  |
| `filename` | `string` |  |

## Table / Interface: `ItemDesignProof`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `orderId` | `string` |  |
| `itemId` | `string` |  |
| `version` | `number` |  |
| `revisionVersion` | `number` |  |
| `revisionId?` | `string` | Refers to the specific revision sent as proof |
| `url` | `string` | Cloudinary URL |
| `cloudinaryPublicId` | `string` |  |
| `sentAt` | `any` | Firestore timestamp |
| `sentBy` | `string` |  |
| `sentByName` | `string` |  |
| `customerResponse?` | `'PENDING' | 'APPROVED' | 'REJECTED'` |  |
| `responseAt?` | `any` | Firestore timestamp |
| `rejectionReason?` | `string` |  |
| `notes?` | `string` |  |

## Table / Interface: `DesignComment`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `orderId` | `string` |  |
| `itemId` | `string` |  |
| `message` | `string` |  |
| `authorId` | `string` |  |
| `authorName` | `string` |  |
| `authorRole` | `string` |  |
| `createdAt` | `any` | Firestore timestamp |
| `attachmentUrl?` | `string` |  |

## Table / Interface: `Order`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | ORD-XXXXX |
| `customerId` | `string` |  |
| `customerName?` | `string` | UI alias |
| `customerSnapshot` | `{` |  |
| `name` | `string` |  |
| `displayName?` | `string` |  |
| `phone?` | `string` |  |
| `email?` | `string` |  |
| `address?` | `string` |  |
| `status` | `OrderStatus` |  |
| `paymentStatus` | `'PENDING' | 'VERIFIED' | 'REJECTED' | 'PAID'` |  |
| `paymentMethod?` | `'CASH' | 'UPI' | 'BANK' | 'CREDIT'` | UI usage |
| `orderType` | `'CASH' | 'CREDIT'` |  |
| `orderSource` | `'WEB' | 'SUPPORT' | 'COUNTER'` |  |
| `createdBy` | `string` |  |
| `createdByRole` | `UserRole` |  |
| `amounts` | `{` |  |
| `base` | `number` |  |
| `extras` | `number` |  |
| `gst` | `number` |  |
| `voucherGstDiscount?` | `number` |  |
| `grandTotal` | `number` |  |
| `voucherApplied?` | `boolean` |  |
| `grandTotal?` | `number` |  |
| `taxAmount?` | `number` |  |
| `totalAmount?` | `number` |  |
| `items?` | `OrderItem[]` |  |
| `workflow` | `{` |  |
| `assignedTo?` | `string` |  |
| `assignedToName?` | `string` |  |
| `assignedBy?` | `string` |  |
| `assignedByName?` | `string` |  |
| `assignedAt?` | `any` |  |
| `startedAt?` | `any` |  |
| `completedAt?` | `any` |  |
| `dispatchedAt?` | `any` |  |
| `paymentVerifiedAt?` | `any` |  |
| `customerDesignProvided?` | `boolean` |  |
| `customerDesignUrl?` | `string` |  |
| `customerDesignFiles?` | `CustomerDesignFile[]` |  |
| `designerProofs?` | `DesignerProof[]` |  |
| `customerApproval?` | `CustomerApprovalState` |  |
| `customerRevisionRequired?` | `boolean` |  |
| `redesignNotes?` | `string` |  |
| `correctionRequirements?` | `string` |  |
| `designUrl?` | `string` |  |
| `designNotes?` | `string` |  |
| `deliveryProof?` | `{` |  |
| `url` | `string` |  |
| `uploadedBy?` | `string` |  |
| `uploadedByName?` | `string` |  |
| `uploadedAt?` | `any` |  |
| `sentForApprovalAt?` | `any` |  |
| `designApprovedAt?` | `any` |  |
| `designApprovedByCustomer?` | `boolean` |  |
| `designRejectedAt?` | `any` |  |
| `latestRejectionNotes?` | `string` |  |
| `designedBy?` | `string` |  |
| `designedByName?` | `string` |  |
| `printWorkflow?` | `PrintWorkflowState` |  |
| `printWorkflow?` | `PrintWorkflowState` |  |
| `workflowSnapshot?` | `OrderWorkflowSnapshot` |  |
| `currentWorkflowRole?` | `string | null` |  |
| `currentWorkflowLabel?` | `string | null` |  |
| `printerCategory?` | `string` |  |
| `verifiedBy?` | `string` |  |
| `productionNotes?` | `string` |  |
| `invoiceId?` | `string` |  |
| `invoiceNumber?` | `string` |  |
| `thumbnailUrl?` | `string` |  |
| `delivery` | `{` |  |
| `choice` | `'PICKUP' | 'TRANSPORT' | 'COURIER' | 'DOOR_DELIVERY'` |  |
| `address?` | `string` |  |
| `pricingSnapshot?` | `any` |  |
| `dispatchInfo?` | `{` |  |
| `method` | `'PICKUP' | 'COURIER' | 'TRANSPORT' | 'DOOR_DELIVERY' | 'SELF_PICKUP'` |  |
| `transportName?` | `string` |  |
| `lrNumber?` | `string` |  |
| `notes?` | `string` |  |
| `dispatchedByName?` | `string` |  |
| `dispatchedAt?` | `any` |  |
| `deliveryProof?` | `{` |  |
| `url` | `string` |  |
| `uploadedBy?` | `string` |  |
| `uploadedByName?` | `string` |  |
| `uploadedAt?` | `any` |  |
| `proxyExecutor?` | `{` |  |
| `uid` | `string` |  |
| `role` | `UserRole` |  |
| `name?` | `string` |  |
| `proxyName?` | `string` |  |
| `shippingAddress?` | `string` |  |
| `productName?` | `string` |  |
| `description?` | `string` |  |
| `baseOrderId?` | `string` |  |
| `groupOrderIds?` | `string[]` |  |
| `createdAt` | `any` |  |
| `updatedAt` | `any` |  |

## Table / Interface: `CustomerDesignFile`

| Field | Type | Description |
|---|---|---|
| `url` | `string` |  |
| `fileName?` | `string` |  |
| `uploadedAt` | `any` |  |
| `uploadedBy?` | `string` |  |

## Table / Interface: `DesignerProof`

| Field | Type | Description |
|---|---|---|
| `version` | `number` |  |
| `url` | `string` |  |
| `notes?` | `string` |  |
| `uploadedBy?` | `string` |  |
| `uploadedAt` | `any` |  |
| `customerResponse?` | `'PENDING' | 'APPROVED' | 'REJECTED'` |  |
| `rejectionReason?` | `string` |  |

## Table / Interface: `CustomerApprovalState`

| Field | Type | Description |
|---|---|---|
| `status` | `'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'` |  |
| `approvedAt?` | `any` |  |
| `rejectedAt?` | `any` |  |
| `rejectionReason?` | `string` |  |
| `approvedBy?` | `string` |  |
| `currentProofVersion?` | `number` |  |

## Table / Interface: `PrintWorkflowTimelineEntry`

| Field | Type | Description |
|---|---|---|
| `event` | `'TIFF_ASSIGNED' | 'TIFF_OPENED' | 'PRINT_STARTED' | 'PRINT_COMPLETED'` |  |
| `timestamp` | `any` |  |
| `user?` | `string` |  |
| `notes?` | `string` |  |
| `tiffPath?` | `string` |  |

## Table / Interface: `PrintWorkflowItemAssignment`

| Field | Type | Description |
|---|---|---|
| `itemId` | `string` |  |
| `tiffPath` | `string` |  |
| `printerId` | `string` |  |
| `printerName?` | `string` |  |
| `assignedBy?` | `string` |  |
| `assignedAt?` | `any` |  |

## Table / Interface: `PrintWorkflowState`

| Field | Type | Description |
|---|---|---|
| `status?` | `'TIFF_PENDING' | 'TIFF_READY' | 'PRINT_STARTED' | 'PRINT_COMPLETED'` |  |
| `sourceDesignPath?` | `string` |  |
| `sourceDesignType?` | `string` |  |
| `tiffPath?` | `string` |  |
| `tiffFileName?` | `string` |  |
| `convertedBy?` | `string` |  |
| `convertedAt?` | `any` |  |
| `sentToPrinter?` | `boolean` |  |
| `sentToPrinterAt?` | `any` |  |
| `sentToPrinterBy?` | `string` |  |
| `printerOpened?` | `boolean` |  |
| `printerOpenedAt?` | `any` |  |
| `printerAcceptedBy?` | `string` |  |
| `printerAcceptedByName?` | `string` |  |
| `printerAcceptedAt?` | `any` |  |
| `printerCompleted?` | `boolean` |  |
| `printerCompletedAt?` | `any` |  |
| `printerCompletedBy?` | `string` |  |
| `printerCompletedByName?` | `string` |  |
| `networkFolder?` | `string` |  |
| `materialUsage?` | `{` |  |
| `paperUsed?` | `string` |  |
| `inkUsed?` | `string` |  |
| `wastageNotes?` | `string` |  |
| `itemAssignments?` | `PrintWorkflowItemAssignment[]` |  |
| `timeline?` | `PrintWorkflowTimelineEntry[]` |  |

## Table / Interface: `ProductionJob`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `orderId` | `string` |  |
| `productName` | `string` |  |
| `category` | `string` |  |
| `sqft` | `number` |  |
| `status` | `'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'` |  |
| `priority` | `'NORMAL' | 'HIGH' | 'URGENT'` |  |
| `printerId?` | `string` |  |
| `notes?` | `string` |  |
| `startedAt?` | `any` |  |
| `completedAt?` | `any` |  |
| `createdAt` | `any` |  |

## Table / Interface: `PaymentRecord`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `userId` | `string` |  |
| `orderId?` | `string` |  |
| `amount` | `number` |  |
| `method` | `'UPI' | 'BANK' | 'CASH'` |  |
| `proofUrl` | `string` |  |
| `status` | `'PENDING' | 'VERIFIED' | 'REJECTED'` |  |
| `verifiedBy?` | `string` |  |
| `verifiedAt?` | `any` |  |
| `createdAt` | `any` |  |

## Table / Interface: `OrderItem`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `orderId` | `string` |  |
| `productName` | `string` |  |
| `productId` | `string` |  |
| `description?` | `string` |  |
| `notes?` | `string` |  |
| `category?` | `string` |  |
| `projectName?` | `string` |  |
| `specs` | `{` |  |
| `width` | `number` |  |
| `height` | `number` |  |
| `quantity` | `number` |  |
| `sqft` | `number` |  |
| `widthUnit` | `'FT' | 'IN'` |  |
| `heightUnit` | `'FT' | 'IN'` |  |
| `materialMetadata` | `{` |  |
| `materialType` | `string` |  |
| `eyeletType` | `'METAL' | 'PLASTIC' | 'NONE'` |  |
| `eyeletCount` | `number` |  |
| `printType?` | `string` |  |
| `pricingSnapshot` | `{` |  |
| `baseRate` | `number` |  |
| `eyeletRate` | `number` |  |
| `subTotal` | `number` |  |
| `tax` | `number` |  |
| `fileUrl` | `string` |  |
| `designUrl?` | `string` |  |
| `designStatus?` | `ItemDesignStatus` |  |
| `designUploadStats?` | `{` |  |
| `originalSize` | `string` |  |
| `compressedSize` | `string` |  |
| `ratio` | `string` |  |
| `filename` | `string` |  |
| `tiffPath?` | `string` |  |
| `assignedPrinterId?` | `string` |  |
| `assignedPrinterName?` | `string` |  |
| `tiffAssignedAt?` | `any` |  |
| `tiffAssignedBy?` | `string` |  |
| `designType?` | `DesignType` |  |
| `itemWorkspace?` | `ItemDesignWorkspace` |  |

## Table / Interface: `Product`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | The ID input by user (e.g. 6000) |
| `name` | `string` |  |
| `category` | `string` |  |
| `baseRate` | `number` |  |
| `hsn_master_id?` | `string` |  |
| `hsn_code?` | `string` |  |
| `hsn_description?` | `string` |  |
| `gst_rate?` | `number` |  |
| `gst_effective_from?` | `string` |  |
| `product_snapshot_version?` | `number` |  |
| `eyeletPricing` | `{` |  |
| `metal` | `number` |  |
| `plastic` | `number` |  |
| `none` | `0` |  |
| `deliveryPricing` | `{` |  |
| `selfPickup` | `0` |  |
| `door` | `number` |  |
| `courier` | `number` |  |
| `transport` | `number` |  |
| `media` | `{` |  |
| `images` | `string[]` |  |
| `video?` | `{` |  |
| `url` | `string` |  |
| `specs` | `{` |  |
| `maxWidth?` | `string` |  |
| `gsm?` | `string` |  |
| `description?` | `string` |  |
| `printerCategory?` | `string` |  |
| `status` | `"ACTIVE" | "INACTIVE"` |  |
| `workflowSteps` | `WorkflowStep[]` |  |
| `createdAt` | `any` |  |
| `updatedAt` | `any` |  |

## Table / Interface: `Transaction`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `userId` | `string` |  |
| `totalBefore?` | `number` |  |
| `totalAfter?` | `number` |  |
| `type` | `'SALE' | 'RECEIPT' | 'ADJUSTMENT' | 'OPENING'` |  |
| `ledgerType?` | `'CASH' | 'CREDIT'` |  |
| `refId` | `string` |  |
| `debit` | `number` |  |
| `credit` | `number` |  |
| `balanceAfter` | `number` |  |
| `remarks?` | `string` |  |
| `createdBy` | `string` |  |
| `timestamp` | `any` |  |

## Table / Interface: `PaymentSubmission`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `userId` | `string` |  |
| `amount` | `number` |  |
| `method` | `'UPI' | 'BANK' | 'CASH'` |  |
| `proofUrl` | `string` |  |
| `status` | `'PENDING' | 'APPROVED' | 'REJECTED'` |  |
| `verifiedBy?` | `string` |  |
| `verifiedAt?` | `any` |  |
| `createdAt` | `any` |  |
| `orderIds?` | `string[]` | Optional array for grouped payments |

## Table / Interface: `DispatchRecord`

| Field | Type | Description |
|---|---|---|
| `orderId` | `string` |  |
| `status` | `'DISPATCHED'` |  |
| `method` | `string` |  |
| `details` | `string` |  |
| `dispatchedAt` | `any` |  |

## Table / Interface: `Invoice`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | INV-XXXXXX (same as parentOrderId stripped of ORD- prefix, e.g., INV-656489) |
| `parentOrderId` | `string` | ORD-656489 or the base ID for grouped orders |
| `childOrderIds` | `string[]` | child order IDs for grouped orders; for single order = [parentOrderId] |
| `invoiceNumber` | `string` | same as id |
| `customerId` | `string` |  |
| `customerSnapshot` | `{` |  |
| `name` | `string` |  |
| `phone?` | `string` |  |
| `email?` | `string` |  |
| `address?` | `string` |  |
| `items` | `{` |  |
| `orderId` | `string` |  |
| `productName` | `string` |  |
| `quantity` | `number` |  |
| `sqft` | `number` |  |
| `baseAmount` | `number` |  |
| `finishAmount` | `number` |  |
| `itemTotal` | `number` |  |
| `amounts` | `{` |  |
| `itemsSubtotal` | `number` | sum of all item totals (NO transport here) |
| `transport` | `number` | Parent Order level only |
| `gst` | `number` |  |
| `discount` | `number` |  |
| `grandTotal` | `number` |  |
| `status` | `'GENERATED' | 'SENT' | 'PAID'` |  |
| `generatedBy` | `string` | uid |
| `generatedByName?` | `string` |  |
| `orderType` | `'CASH' | 'CREDIT'` |  |
| `paymentStatus?` | `string` |  |
| `createdAt` | `any` |  |
| `updatedAt?` | `any` |  |

## Table / Interface: `PrinterCategoryMeta`

| Field | Type | Description |
|---|---|---|
| `label` | `string` |  |
| `color` | `string` |  |
| `bg` | `string` |  |

## Table / Interface: `RoleMeta`

| Field | Type | Description |
|---|---|---|
| `label` | `string` |  |
| `color` | `string` | text / badge color (hex) |
| `bg` | `string` | badge background color (hex) |
| `description` | `string` |  |

## Table / Interface: `StaffUser`

| Field | Type | Description |
|---|---|---|
| `uid` | `string` |  |
| `name` | `string` |  |
| `email` | `string` |  |
| `roles` | `StaffRole[]` |  |
| `status` | `StaffStatus` |  |
| `printerCategory?` | `PrinterCategory` |  |
| `assignedBy?` | `string` |  |
| `assignedAt?` | `any` |  |
| `updatedAt?` | `any` |  |
| `suspendedAt?` | `any` |  |
| `lastLoginAt?` | `any` |  |

## Table / Interface: `RoleHistoryEntry`

| Field | Type | Description |
|---|---|---|
| `id?` | `string` |  |
| `userId` | `string` |  |
| `userName` | `string` |  |
| `oldRoles` | `StaffRole[]` |  |
| `newRoles` | `StaffRole[]` |  |
| `changedBy` | `string` |  |
| `changedByName` | `string` |  |
| `changedAt` | `any` |  |
| `reason?` | `string` |  |
| `action` | `'ASSIGN' | 'REMOVE' | 'UPDATE' | 'SUSPEND' | 'ACTIVATE' | 'DISABLE'` |  |

## Table / Interface: `GlobalStats`

| Field | Type | Description |
|---|---|---|
| `financial` | `{` |  |
| `totalSales` | `number` |  |
| `totalReceipts` | `number` |  |
| `totalPendingVerification` | `number` |  |
| `totalUnpaid` | `number` |  |
| `totalOutstanding` | `number` |  |
| `totalCreditExposure` | `number` |  |
| `orders` | `{` |  |
| `total` | `number` |  |
| `placed` | `number` |  |
| `paymentPending` | `number` |  |
| `verified` | `number` |  |
| `assigned` | `number` |  |
| `inProgress` | `number` |  |
| `completed` | `number` |  |
| `dispatched` | `number` |  |
| `cancelled` | `number` |  |
| `production` | `{` |  |
| `activeJobs` | `number` |  |
| `completedJobs` | `number` |  |
| `jobsPerPrinter` | `Record<string, number>` |  |
| `payments` | `{` |  |
| `pending` | `number` |  |
| `approved` | `number` |  |
| `rejected` | `number` |  |
| `dispatch` | `{` |  |
| `pending` | `number` |  |
| `completed` | `number` |  |
| `lastUpdated?` | `any` |  |
| `system?` | `{` |  |
| `lastUpdated` | `any` |  |

## Table / Interface: `TallySyncEvent`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `syncType` | `TallySyncType` |  |
| `orderId?` | `string` |  |
| `paymentId?` | `string` |  |
| `customerId?` | `string` |  |
| `idempotencyKey` | `string` |  |
| `payload` | `SalesInvoicePayload | ReceiptVoucherPayload | LedgerUpdatePayload | Record<string, any>` |  |
| `status` | `TallySyncStatus` |  |
| `retryCount` | `number` | How many times we've attempted this sync |
| `maxRetries` | `number` | After this, mark FAILED (default: 3) |
| `lastAttemptAt?` | `string` | ISO timestamp of last connector attempt |
| `lastError?` | `string` | Last error message from Tally or network |
| `tallyResponse?` | `{` |  |
| `requestId?` | `string` |  |
| `lineno?` | `string` |  |
| `status?` | `'Accepted' | 'Not Accepted'` |  |
| `rawXml?` | `string` | Full Tally response XML for debugging |
| `json?` | `any` | Parsed JSON response for fetch operations |
| `createdBy` | `string` | The UID of the staff member who triggered this |
| `createdAt` | `string` | ISO timestamp |
| `processedAt?` | `string` | ISO timestamp when connector processed it |

## Table / Interface: `SalesInvoicePayload`

| Field | Type | Description |
|---|---|---|
| `tallyCompanyName` | `string` |  |
| `invoiceNumber` | `string` | ERP invoiceNumber e.g. INV-123456 |
| `invoiceDate` | `string` | YYYYMMDD format for Tally |
| `orderDate` | `string` | YYYYMMDD |
| `customerName` | `string` | Must match Tally ledger name EXACTLY |
| `customerAddress?` | `string` |  |
| `customerGST?` | `string` |  |
| `items` | `SalesInvoiceItem[]` |  |
| `subTotal` | `number` |  |
| `gstAmount` | `number` |  |
| `grandTotal` | `number` |  |
| `cgst` | `number` |  |
| `sgst` | `number` |  |
| `igst` | `number` |  |
| `salesLedgerName` | `string` | e.g. "Sales (GST)" — must match Tally |
| `gstLedgerName` | `string` | e.g. "CGST" or "Output CGST" |
| `debtorLedgerName` | `string` | e.g. "Sundry Debtors" or customer name |

## Table / Interface: `SalesInvoiceItem`

| Field | Type | Description |
|---|---|---|
| `productName` | `string` |  |
| `quantity` | `number` |  |
| `sqft` | `number` |  |
| `rate` | `number` |  |
| `amount` | `number` |  |
| `gstPercent` | `number` | 18 (for 18% GST) |

## Table / Interface: `ReceiptVoucherPayload`

| Field | Type | Description |
|---|---|---|
| `tallyCompanyName` | `string` |  |
| `voucherNumber` | `string` | paymentId |
| `voucherDate` | `string` | YYYYMMDD |
| `amount` | `number` |  |
| `orderId` | `string` |  |
| `invoiceNumber?` | `string` | Reference to the sales invoice |
| `customerName` | `string` |  |
| `paymentMode` | `string` | CASH | UPI | BANK |
| `bankLedgerName` | `string` | e.g. "State Bank of India" — must match Tally |
| `depositRefNo?` | `string` | UTR / Cheque number |
| `debtorLedgerName` | `string` |  |

## Table / Interface: `LedgerUpdatePayload`

| Field | Type | Description |
|---|---|---|
| `tallyCompanyName` | `string` |  |
| `customerName` | `string` |  |
| `ledgerGroup` | `string` | e.g. "Sundry Debtors" |
| `openingBalance` | `number` |  |
| `creditLimit` | `number` |  |

## Table / Interface: `ConnectorQueueResponse`

| Field | Type | Description |
|---|---|---|
| `events` | `TallySyncEvent[]` |  |
| `fetchedAt` | `string` | ISO |

## Table / Interface: `ConnectorMarkResult`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `status` | `TallySyncStatus` |  |
| `tallyResponse?` | `TallySyncEvent['tallyResponse']` |  |
| `error?` | `string` |  |

## Table / Interface: `TallySettings`

| Field | Type | Description |
|---|---|---|
| `companyName` | `string` | e.g. "Hindustan Enterprises" |
| `salesLedgerName` | `string` | e.g. "Sales (GST 18%)" |
| `cgstLedgerName` | `string` | e.g. "Output CGST" |
| `sgstLedgerName` | `string` | e.g. "Output SGST" |
| `igstLedgerName` | `string` | e.g. "Output IGST" |
| `cashLedgerName` | `string` | e.g. "Cash" |
| `bankLedgerName` | `string` | e.g. "HDFC Bank" |
| `upiLedgerName` | `string` | e.g. "Paytm / UPI" |
| `sundryDebtorsGroup` | `string` | e.g. "Sundry Debtors" |
| `connectorEnabled` | `boolean` |  |
| `connectorLastSeen?` | `string` | ISO — when the connector last polled |
| `connectorVersion?` | `string` |  |
| `updatedAt` | `string` |  |
| `updatedBy` | `string` |  |

## Table / Interface: `StatusHistoryEntry`

| Field | Type | Description |
|---|---|---|
| `from` | `OrderStatus` |  |
| `to` | `OrderStatus` |  |
| `by` | `string` | UID of user who made the change |
| `timestamp` | `any` | Firestore Timestamp |
| `notes?` | `string` |  |
| `reasonCode?` | `string` |  |

## Table / Interface: `DispatchMetadata`

| Field | Type | Description |
|---|---|---|
| `deliveryType` | `'PICKUP' | 'COURIER' | 'TRANSPORT' | 'LOCAL_DELIVERY'` |  |
| `transportName?` | `string` |  |
| `trackingNumber?` | `string` |  |
| `dispatchNote?` | `string` |  |
| `dispatchDate` | `any` |  |
| `handledBy` | `string` | UID |

## Table / Interface: `WorkflowStep`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `label` | `string` |  |
| `role` | `StaffRole` |  |
| `description?` | `string` |  |
| `blocking?` | `boolean` |  |

## Table / Interface: `WorkflowTemplate`

| Field | Type | Description |
|---|---|---|
| `id` | `string` |  |
| `name` | `string` |  |
| `steps` | `WorkflowStep[]` |  |
| `isActive` | `boolean` |  |
| `createdAt` | `any` |  |
| `updatedAt` | `any` |  |

## Table / Interface: `OrderWorkflowSnapshot`

| Field | Type | Description |
|---|---|---|
| `steps` | `OrderWorkflowStep[]` |  |
| `currentStepIndex` | `number` |  |
| `templateId?` | `string` |  |
| `version` | `number` |  |
| `metadata?` | `any` |  |

## Table / Interface: `OrderWorkflowStep`

| Field | Type | Description |
|---|---|---|
| `status` | `'LOCKED' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'REJECTED' | 'PAUSED'` |  |
| `startedAt?` | `any` |  |
| `completedAt?` | `any` |  |
| `completedBy?` | `string` | UID of the staff member |
| `notes?` | `string` |  |
| `attachments?` | `string[]` | Array of attachment URLs |
| `history?` | `{` |  |
| `status` | `string` |  |
| `timestamp` | `any` |  |
| `by` | `string` |  |
| `note?` | `string` |  |

