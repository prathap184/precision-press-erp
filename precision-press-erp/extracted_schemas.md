# Deleted and Modified Tables Schema (From Aug 5th Backup)

## Table: categories
`sql
CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "image" "text"
);
`

## Table: products
`sql
CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "name" "text",
    "nameLowercase" "text",
    "category" "text",
    "baseRate" numeric(12,2),
    "status" "text",
    "specs" "jsonb",
    "media" "jsonb",
    "eyeletPricing" "jsonb",
    "deliveryPricing" "jsonb",
    "workflowSteps" "jsonb",
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "categoryName" "text",
    "description" "text",
    "imageUrl" "text",
    "isActive" boolean DEFAULT true,
    "material" "text",
    "printerCategory" "text",
    "hsn_master_id" "uuid",
    "hsn_code" character varying(8),
    "hsn_description" "text",
    "gst_rate" numeric(5,2),
    "gst_effective_from" "date",
    "product_snapshot_version" integer DEFAULT 1,
    "base_rate" numeric(10,2) DEFAULT 0 NOT NULL,
    "eyelet_metal" numeric(10,2) DEFAULT 0,
    "eyelet_plastic" numeric(10,2) DEFAULT 0,
    "delivery_door" numeric(10,2) DEFAULT 0,
    "delivery_courier" numeric(10,2) DEFAULT 0,
    "delivery_transport" numeric(10,2) DEFAULT 0,
    "media_images" "jsonb" DEFAULT '[]'::"jsonb",
    "media_video_url" "text",
    "specs_max_width" "text",
    "specs_gsm" "text",
    "specs_description" "text",
    "workflow_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "name_lowercase" "text",
    "printer_category" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_synced_to_erp" boolean DEFAULT false
);
`

## Table: workflow_departments
`sql
CREATE TABLE IF NOT EXISTS "public"."workflow_departments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "color" character varying(50) DEFAULT '#3b82f6'::character varying,
    "icon" character varying(50) DEFAULT 'Layers'::character varying,
    "sla_minutes" integer DEFAULT 120,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);
`

## Table: workflow_stage_history
`sql
CREATE TABLE IF NOT EXISTS "public"."workflow_stage_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "department_id" "uuid",
    "workflow_stage" character varying(100) NOT NULL,
    "workflow_status" character varying(50) NOT NULL,
    "parent_order_id" character varying(255) NOT NULL,
    "child_order_id" character varying(255),
    "entered_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "exited_at" timestamp with time zone,
    "duration_seconds" integer,
    "duration_minutes" integer,
    "active_time_minutes" integer,
    "paused_time_minutes" integer,
    "waiting_time_minutes" integer,
    "assigned_to" "uuid",
    "queue_position" integer DEFAULT 0,
    "priority" character varying(50) DEFAULT 'NORMAL'::character varying,
    "sla_target_minutes" integer,
    "sla_status" character varying(50),
    "sla_breached_at" timestamp with time zone,
    "is_rework" boolean DEFAULT false,
    "is_rejected" boolean DEFAULT false,
    "entered_by" "uuid",
    "exited_by" "uuid",
    "remarks" "text",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);
`

## Table: document_jobs
`sql
CREATE TABLE IF NOT EXISTS "public"."document_jobs" (
    "id" "text" NOT NULL,
    "jobType" "text" NOT NULL,
    "orderId" "text" NOT NULL,
    "parentOrderId" "text" NOT NULL,
    "priority" integer DEFAULT 2 NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 4 NOT NULL,
    "errorMessage" "text",
    "worker_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "failedAt" timestamp with time zone,
    "heartbeatAt" timestamp with time zone,
    "stackTrace" "text",
    "sqlError" "text",
    "workerVersion" "text"
);
`

## Table: stats
`sql
CREATE TABLE IF NOT EXISTS "public"."stats" (
    "id" "text" NOT NULL,
    "production" "jsonb",
    "payments" "jsonb",
    "dispatch" "jsonb",
    "system" "jsonb",
    "financial" "jsonb",
    "orders" "jsonb"
);
`

## Table: staff_users
`sql
CREATE TABLE IF NOT EXISTS "public"."staff_users" (
    "id" "text" NOT NULL,
    "uid" "text",
    "name" "text",
    "email" "text",
    "roles" "jsonb",
    "status" "text",
    "assigned_by" "text",
    "assigned_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "last_login_at" timestamp with time zone,
    "metadata" "jsonb"
);
`

## Table: role_history
`sql
CREATE TABLE IF NOT EXISTS "public"."role_history" (
    "id" "text" NOT NULL,
    "userId" "text",
    "userName" "text",
    "oldRoles" "jsonb",
    "newRoles" "jsonb",
    "changedBy" "text",
    "changedByName" "text",
    "action" "text",
    "changedAt" "jsonb"
);
`

## Table: activity_logs
`sql
CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "text" NOT NULL,
    "action" "text",
    "actor_id" "text",
    "actor_name" "text",
    "details" "jsonb",
    "timestamp" timestamp with time zone,
    "meta" "jsonb",
    "systemVersion" "text",
    "userId" "text",
    "userRole" "text"
);
`

## Table: quotations
`sql
CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_number" "text" NOT NULL,
    "customer_id" "text" NOT NULL,
    "total_amount" numeric NOT NULL,
    "items" "jsonb",
    "tax_details" "jsonb",
    "tally_sync_status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "quotation_date" "date" DEFAULT CURRENT_DATE,
    "tax_amount" numeric(15,2) DEFAULT 0.00,
    "discount_amount" numeric(15,2) DEFAULT 0.00,
    "terms_conditions" "text",
    "parent_order_id" "text",
    "ref_order_id" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "customer_snapshot" "jsonb",
    "logistics_details" "jsonb",
    "shipping_address" "text"
);
`

## Table: dispatch_details
`sql
CREATE TABLE IF NOT EXISTS "public"."dispatch_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_order_id" "text" NOT NULL,
    "transporter_name" "text",
    "dispatch_through" "text",
    "lr_number" "text",
    "lr_date" "date",
    "vehicle_number" "text",
    "destination" "text",
    "delivery_note" "text",
    "delivery_note_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
`

## Table: audit_logs
`sql
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "text" NOT NULL,
    "action_type" "text",
    "actor_id" "text",
    "actor_name" "text",
    "target_id" "text",
    "target_type" "text",
    "payload" "jsonb",
    "timestamp" timestamp with time zone,
    "metadata" "jsonb",
    "actedAs" "text",
    "actedAsType" "text",
    "actionType" "text",
    "adminId" "text",
    "adminRole" "text",
    "afterState" "jsonb",
    "beforeState" "jsonb",
    "entityId" "text",
    "entityType" "text",
    "meta" "jsonb",
    "systemVersion" "text",
    "actor_role" "text",
    "ip_address" "text",
    "user_agent" "text",
    "session_id" "text",
    "request_id" "text",
    "previous_value" "jsonb",
    "new_value" "jsonb"
);
`

## Table: audit_stats
`sql
CREATE TABLE IF NOT EXISTS "public"."audit_stats" (
    "id" "text" NOT NULL,
    "total" bigint,
    "actions" "jsonb",
    "updated_at" timestamp with time zone,
    "admins" "jsonb"
);
`

## Table: tax_templates
`sql
CREATE TABLE IF NOT EXISTS "public"."tax_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" DEFAULT 'Hindustan Enterprises'::"text" NOT NULL,
    "address" "text" DEFAULT '#1, New Bamboo Bazaar'::"text" NOT NULL,
    "city" "text" DEFAULT 'Mysore'::"text" NOT NULL,
    "state" "text" DEFAULT 'Karnataka'::"text" NOT NULL,
    "state_code" "text" DEFAULT '29'::"text" NOT NULL,
    "pincode" "text" DEFAULT '570001'::"text" NOT NULL,
    "phone" "text" DEFAULT '+91 90007 76007'::"text" NOT NULL,
    "email" "text" DEFAULT 'info@hindustanenterprises.com'::"text" NOT NULL,
    "website" "text",
    "gstin" "text" DEFAULT '29AFHPP0687G1Z2'::"text" NOT NULL,
    "pan" "text" DEFAULT 'AFHPP0687G'::"text" NOT NULL,
    "msme_reg" "text",
    "bank_name" "text" DEFAULT 'ICICI Bank'::"text" NOT NULL,
    "branch" "text" DEFAULT 'Mysore Main'::"text" NOT NULL,
    "account_number" "text" DEFAULT '6255505013373'::"text" NOT NULL,
    "ifsc" "text" DEFAULT 'ICIC0006255'::"text" NOT NULL,
    "beneficiary_name" "text" DEFAULT 'Hindustan Enterprises'::"text" NOT NULL,
    "upi_id" "text",
    "invoice_prefix" "text" DEFAULT 'HE'::"text" NOT NULL,
    "default_gst" numeric(5,2) DEFAULT 18.00 NOT NULL,
    "round_off" boolean DEFAULT true NOT NULL,
    "auto_qr" boolean DEFAULT false NOT NULL,
    "amount_in_words" boolean DEFAULT true NOT NULL,
    "logo_url" "text",
    "signature_url" "text",
    "seal_url" "text",
    "declaration" "text" DEFAULT 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'::"text" NOT NULL,
    "terms" "text" DEFAULT '1. Interest @ 24% PA + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit'::"text" NOT NULL,
    "footer_text" "text" DEFAULT 'This is a Computer Generated Invoice'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
`

## Table: profiles
`sql
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "text" NOT NULL,
    "uid" "text",
    "email" "text",
    "name" "text",
    "displayName" "text",
    "role" "text",
    "roles" "jsonb",
    "customerType" "text",
    "creditLimit" numeric(15,2),
    "usedCredit" numeric(15,2),
    "status" "text",
    "businessName" "text",
    "phone" "text",
    "address" "text",
    "membership" "jsonb",
    "financialStats" "jsonb",
    "creditAuthorizedBy" "text",
    "assignedBy" "text",
    "assignedAt" "jsonb",
    "createdAt" "text",
    "updatedAt" "jsonb",
    "printerCategory" "text",
    "houseNumber" "text",
    "roadName" "text",
    "city" "text",
    "state" "text",
    "country" "text",
    "pincode" "text",
    "gstType" "text",
    "gstNumber" "text",
    "defaultAddressId" "text",
    "addresses" "jsonb",
    "creditStatus" "text",
    "voucherType" "text",
    "gstVerified" boolean DEFAULT false,
    "gstDetails" "jsonb",
    "company_name" "text",
    "contact_person" "text",
    "alternate_mobile" "text",
    "gst_registered" boolean DEFAULT false NOT NULL,
    "gstin" "text",
    "pan_number" "text",
    "customer_code" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_area" "text",
    "billing_city" "text",
    "billing_district" "text",
    "billing_state" "text",
    "billing_state_code" "text",
    "billing_pincode" "text",
    "billing_country" "text" DEFAULT 'India'::"text" NOT NULL,
    "shipping_same_as_billing" boolean DEFAULT true NOT NULL,
    "consignee_name" "text",
    "consignee_contact" "text",
    "consignee_mobile" "text",
    "consignee_gstin" "text",
    "shipping_address_line1" "text",
    "shipping_address_line2" "text",
    "shipping_area" "text",
    "shipping_city" "text",
    "shipping_district" "text",
    "shipping_state" "text",
    "shipping_state_code" "text",
    "shipping_pincode" "text",
    "shipping_country" "text" DEFAULT 'India'::"text" NOT NULL,
    "payment_terms" "text",
    "credit_days" integer,
    "preferred_transporter" "text",
    "remarks" "text",
    "is_synced_to_erp" boolean DEFAULT false,
    "current_recharge" numeric DEFAULT 0
);
`

## Table: rate_limits
`sql
CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "key" "text" NOT NULL,
    "hits" integer DEFAULT 1 NOT NULL,
    "reset_at" timestamp with time zone NOT NULL
);
`

## Table: workflow_department_settings
`sql
CREATE TABLE IF NOT EXISTS "public"."workflow_department_settings" (
    "department_id" "uuid" NOT NULL,
    "max_queue" integer DEFAULT 0,
    "capacity" character varying(255),
    "working_hours" character varying(255),
    "auto_assign" boolean DEFAULT false,
    "allowed_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);
`

## Table: orders
`sql
CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "customerId" "text",
    "customerName" "text",
    "customerSnapshot" "jsonb",
    "orderType" "text",
    "orderSource" "text",
    "createdBy" "text",
    "createdByRole" "text",
    "proxyExecutor" "text",
    "invoiceNumber" "text",
    "amounts" "jsonb",
    "delivery" "jsonb",
    "productionNotes" "text",
    "thumbnailUrl" "text",
    "paymentStatus" "text",
    "wastageNotes" "text",
    "inkUsed" "text",
    "paperUsed" "text",
    "status" "text",
    "workflow" "jsonb",
    "workflowSnapshot" "jsonb",
    "currentWorkflowLabel" "text",
    "currentWorkflowRole" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "dispatchDetails" "jsonb",
    "dispatchInfo" "jsonb",
    "notes" "text",
    "paymentMethod" "text",
    "deliveryproof" "jsonb",
    "printerCategory" "text",
    "productName" "text",
    "description" "text",
    "shippingAddress" "text",
    "proxyName" "text",
    "items" "jsonb",
    "deliveryChoice" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "cgst_percentage" numeric(5,2),
    "cgst_amount" numeric(12,2),
    "sgst_percentage" numeric(5,2),
    "sgst_amount" numeric(12,2),
    "igst_percentage" numeric(5,2),
    "igst_amount" numeric(12,2),
    "gst_type" "text",
    "allocated_logistics_percentage" numeric(8,4),
    "allocated_logistics_amount" numeric(12,2),
    "item_amount" numeric(12,2),
    "taxable_value_snapshot" numeric(12,2),
    "grand_total_snapshot" numeric(12,2),
    "invoice_id" "text",
    "invoice_number" "text",
    "invoice_generated" boolean DEFAULT false NOT NULL,
    "invoice_generated_at" timestamp with time zone,
    "invoice_status" "text" DEFAULT 'PENDING'::"text",
    "is_synced_to_erp" boolean DEFAULT false,
    "sale_entry_number" "text",
    "receipt_entry_number" "text",
    "sale_created" boolean DEFAULT false,
    "receipt_created" boolean DEFAULT false,
    "amount_paid" numeric DEFAULT 0,
    "ref_order_id" "text",
    "parent_order_id" "text"
);
`

## Table: order_items
`sql
CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "product_name" "text",
    "product_id" "text",
    "category" "text",
    "project_name" "text",
    "specs" "jsonb",
    "material_metadata" "jsonb",
    "pricing_snapshot" "jsonb",
    "file_url" "text",
    "design_url" "text",
    "design_status" "text",
    "design_upload_stats" "jsonb",
    "tiff_path" "text",
    "assigned_printer_id" "text",
    "assigned_printer_name" "text",
    "tiff_assigned_at" timestamp with time zone,
    "tiff_assigned_by" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "assignedPrinterId" "text",
    "assignedPrinterName" "text",
    "fileUrl" "text",
    "tiffPath" "text",
    "status" "text",
    "productId" "text",
    "productName" "text",
    "projectName" "text",
    "materialMetadata" "jsonb",
    "pricingSnapshot" "jsonb",
    "tiffAssignedAt" timestamp with time zone,
    "tiffAssignedBy" "text",
    "designUrl" "text",
    "designStatus" "text",
    "designUploadStats" "jsonb",
    "description" "text",
    "designType" "text",
    "itemWorkspace" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ref_order_id" "text",
    "parent_order_id" "text"
);
`

## Table: hsn_master
`sql
CREATE TABLE IF NOT EXISTS "public"."hsn_master" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hsn_code" character varying(8) NOT NULL,
    "description" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "updated_by" "text",
    "reason_for_change" "text",
    "code_type" "text" DEFAULT 'GOODS'::"text" NOT NULL,
    CONSTRAINT "hsn_master_code_type_check" CHECK (("code_type" = ANY (ARRAY['GOODS'::"text", 'SERVICE'::"text"])))
);
`

