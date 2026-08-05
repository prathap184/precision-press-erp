CREATE TABLE "hsn_gst_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hsn_id" uuid NOT NULL,
	"gst_rate" integer NOT NULL,
	"effective_from" timestamp
);
--> statement-breakpoint
CREATE TABLE "hsn_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hsn_code" text NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "default_currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "chart_account" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "journal_line" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "credit_note" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "customer_credit" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "sales_receipt" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "bill" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "debit_note" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "landed_cost_allocation" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "purchase_requisition" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "expense_claim" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "price_list" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "compensation_band" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "contractor" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "contractor_payment" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payroll_employee" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payroll_item" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payroll_settings" ALTER COLUMN "default_currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payroll_tax_payment" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "recurring_template" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "deal" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payment_batch" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "payment_batch_item" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "scheduled_payment" ALTER COLUMN "currency_code" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "consolidation_group" ALTER COLUMN "presentation_currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "gst_rate" integer;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "workflow_steps" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "hsn_gst_rates" ADD CONSTRAINT "hsn_gst_rates_hsn_id_hsn_master_id_fk" FOREIGN KEY ("hsn_id") REFERENCES "public"."hsn_master"("id") ON DELETE no action ON UPDATE no action;