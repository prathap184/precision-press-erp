CREATE TYPE "public"."source_module" AS ENUM('MANUAL', 'SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'CONTRA', 'STOCK', 'PAYROLL', 'ASSET');--> statement-breakpoint
ALTER TYPE "public"."entry_status" ADD VALUE 'pending_approval' BEFORE 'posted';--> statement-breakpoint
ALTER TYPE "public"."entry_status" ADD VALUE 'approved' BEFORE 'posted';--> statement-breakpoint
ALTER TYPE "public"."entry_status" ADD VALUE 'rejected' BEFORE 'void';--> statement-breakpoint
ALTER TYPE "public"."entry_status" ADD VALUE 'cancelled' BEFORE 'void';--> statement-breakpoint
CREATE TABLE "voucher_sequence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"voucher_type" "voucher_type" NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"voucher_type" "voucher_type" NOT NULL,
	"prefix" text NOT NULL,
	"padding_length" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "source_module" "source_module";--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voucher_prefix" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voucher_sequence" integer;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voucher_number" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "posting_date" date;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "is_reversal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "approval_remarks" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "posted_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "posting_remarks" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "reversed_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "reversed_at" timestamp;--> statement-breakpoint
ALTER TABLE "voucher_sequence" ADD CONSTRAINT "voucher_sequence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_sequence" ADD CONSTRAINT "voucher_sequence_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_setting" ADD CONSTRAINT "voucher_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_sequence_org_year_type_idx" ON "voucher_sequence" USING btree ("organization_id","fiscal_year_id","voucher_type");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_setting_org_type_idx" ON "voucher_setting" USING btree ("organization_id","voucher_type");--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_org_voucher_number_idx" ON "journal_entry" USING btree ("organization_id","voucher_number");