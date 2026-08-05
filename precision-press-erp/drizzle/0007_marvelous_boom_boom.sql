ALTER TABLE "bill" ADD COLUMN "cgst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "sgst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "igst_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "cgst_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "sgst_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_line" ADD COLUMN "igst_amount" integer DEFAULT 0 NOT NULL;