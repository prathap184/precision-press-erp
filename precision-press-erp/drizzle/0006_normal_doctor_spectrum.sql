ALTER TABLE "invoice" ADD COLUMN "cgst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sgst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "igst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "cgst_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "sgst_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "igst_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "length" integer;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "sq_ft" integer;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "finish_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "delivery_mode" text;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "delivery_amount" integer DEFAULT 0 NOT NULL;