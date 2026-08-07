CREATE TYPE "public"."voucher_type" AS ENUM('JOURNAL', 'CONTRA', 'SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT');--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voucher_type" "voucher_type";--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "sub_type" text;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "instrument_type" text;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "instrument_no" text;--> statement-breakpoint
ALTER TABLE "journal_line" ADD COLUMN "instrument_date" date;