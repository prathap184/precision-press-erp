CREATE TABLE IF NOT EXISTS printing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  has_subcategories BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS printing_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES printing_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_item 
  ADD COLUMN IF NOT EXISTS printing_category_id UUID,
  ADD COLUMN IF NOT EXISTS printing_category_name TEXT,
  ADD COLUMN IF NOT EXISTS printing_subcategory_id UUID,
  ADD COLUMN IF NOT EXISTS printing_subcategory_name TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS printing_category_id TEXT,
      ADD COLUMN IF NOT EXISTS printing_category_name TEXT,
      ADD COLUMN IF NOT EXISTS printing_subcategory_id TEXT,
      ADD COLUMN IF NOT EXISTS printing_subcategory_name TEXT;
  END IF;
END $$;
