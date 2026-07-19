-- Add name_lowercase column to products table if it doesn't exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name_lowercase TEXT;

-- Update existing records to have name_lowercase populated
UPDATE public.products SET name_lowercase = LOWER(name) WHERE name_lowercase IS NULL;

-- Reload postgREST schema cache
NOTIFY pgrst, 'reload schema';
