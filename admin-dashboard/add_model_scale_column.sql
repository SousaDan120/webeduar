-- Add model_scale column to exhibits table
-- This column stores the normalized scale for 3D models to ensure consistent sizing in AR viewer

ALTER TABLE exhibits 
ADD COLUMN IF NOT EXISTS model_scale FLOAT DEFAULT 1;

-- Add comment to document the purpose
COMMENT ON COLUMN exhibits.model_scale IS 'Normalized scale factor for 3D model (calculated from bounding box to standardize size in AR viewer)';
