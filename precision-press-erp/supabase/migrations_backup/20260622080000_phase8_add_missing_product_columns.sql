-- Ensure all product columns exist (in case previous migrations were applied before these columns were added to the schema locally)

DO $$ 
BEGIN
  BEGIN
    ALTER TABLE public.products ADD COLUMN base_rate NUMERIC(10,2) NOT NULL DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN eyelet_metal NUMERIC(10,2) DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN eyelet_plastic NUMERIC(10,2) DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN delivery_door NUMERIC(10,2) DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN delivery_courier NUMERIC(10,2) DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN delivery_transport NUMERIC(10,2) DEFAULT 0;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN media_images JSONB DEFAULT '[]';
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN media_video_url TEXT;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN specs_max_width TEXT;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN specs_gsm TEXT;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN specs_description TEXT;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN workflow_steps JSONB DEFAULT '[]';
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  -- HSN Fields
  BEGIN
    ALTER TABLE public.products ADD COLUMN hsn_master_id UUID REFERENCES public.hsn_master(id);
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN hsn_code VARCHAR(8);
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN hsn_description TEXT;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN gst_rate NUMERIC(5,2);
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN gst_effective_from DATE;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;

  BEGIN
    ALTER TABLE public.products ADD COLUMN product_snapshot_version INTEGER DEFAULT 1;
  EXCEPTION
    WHEN duplicate_column THEN null;
  END;
END $$;

-- Force schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
