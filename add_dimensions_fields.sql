-- Adicionar campos para dimensões normalizadas na tabela exhibits
-- Execute isso no SQL Editor do Supabase

ALTER TABLE exhibits 
ADD COLUMN IF NOT EXISTS normalized_width NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_height NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_depth NUMERIC,
ADD COLUMN IF NOT EXISTS scale_factor NUMERIC;

-- Comentário sobre os campos
COMMENT ON COLUMN exhibits.normalized_width IS 'Largura normalizada do modelo 3D (maior dimensão = 2m)';
COMMENT ON COLUMN exhibits.normalized_height IS 'Altura normalizada do modelo 3D (maior dimensão = 2m)';
COMMENT ON COLUMN exhibits.normalized_depth IS 'Profundidade normalizada do modelo 3D (maior dimensão = 2m)';
COMMENT ON COLUMN exhibits.scale_factor IS 'Fator de escala aplicado para normalizar o modelo (usado no AR viewer)';

-- Remover colunas redundantes após implementação da normalização
ALTER TABLE exhibits 
DROP COLUMN IF EXISTS model_scale,
DROP COLUMN IF EXISTS scale_x,
DROP COLUMN IF EXISTS scale_y,
DROP COLUMN IF EXISTS scale_z;
