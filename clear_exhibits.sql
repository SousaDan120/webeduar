-- Limpar todos os dados da tabela exhibits
-- ATENÇÃO: Isso excluirá TODAS as exposições do banco de dados
-- Execute isso no SQL Editor do Supabase

-- Primeiro, excluir favoritos relacionados (se houver tabela favorites)
DELETE FROM favorites WHERE exhibit_id IN (SELECT id FROM exhibits);

-- Depois, excluir todos os registros da tabela exhibits
DELETE FROM exhibits;

-- Opcional: Resetar o contador de ID (sequência)
-- ALTER SEQUENCE exhibits_id_seq RESTART WITH 1;
