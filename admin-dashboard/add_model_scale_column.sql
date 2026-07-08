-- Add model_scale column to exhibits table
-- This column stores the scale factor for 3D models to match Hiro marker size

ALTER TABLE exhibits 
ADD COLUMN IF NOT EXISTS model_scale FLOAT DEFAULT 1.0;

-- Add comment to document the purpose
COMMENT ON COLUMN exhibits.model_scale IS 'Scale factor for 3D model (calculated from bounding box so largest dimension matches Hiro marker size ~1 unit)';
