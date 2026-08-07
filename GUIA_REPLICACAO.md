# Guia de Replicação - AR-EDU Project (EduAR)

Este documento descreve como replicar o projeto AR-EDU, um sistema de exposições educacionais em Realidade Aumentada.

## 📋 Visão Geral do Projeto

O **AR-EDU Project** é uma plataforma web para criar e gerenciar exposições em Realidade Aumentada. O sistema consiste em:

- **Dashboard Administrativo**: Interface React para gerenciar exposições, upload de modelos 3D/áudio
- **Visualizador AR**: Aplicação web baseada em A-Frame + AR.js para visualizar modelos 3D via câmera
- **Backend**: Supabase (banco de dados PostgreSQL + Storage)
- **Autenticação**: Sistema de login com permissões de admin/visitante

## 🏗️ Estrutura do Projeto

```
webeduar/
├── admin-dashboard/              # Aplicação React (Dashboard)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # Lista exposições, gerencia armazenamento
│   │   │   ├── EditExhibit.jsx    # Cria/edita exposições (upload 3D/áudio)
│   │   │   ├── Favorites.jsx      # Página pública de favoritos
│   │   │   └── Login.jsx          # Autenticação
│   │   ├── lib/
│   │   │   └── supabase.js        # Cliente Supabase
│   │   ├── App.jsx                # Rotas e autenticação
│   │   └── main.jsx
│   ├── public/
│   │   └── ar-viewer/
│   │       └── index.html         # Visualizador AR (A-Frame + AR.js)
│   ├── package.json
│   └── vite.config.js
├── add_dimensions_fields.sql      # Script SQL para campos de dimensões
└── clear_exhibits.sql              # Script SQL para limpar dados
```

## 🗄️ Schema do Banco de Dados (Supabase)

### Tabelas Principais

#### 1. `exhibits`
Armazena as exposições/elementos AR.

```sql
CREATE TABLE exhibits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description_text TEXT,
  marker_id TEXT NOT NULL DEFAULT '1',
  model_url TEXT,
  audio_url TEXT,
  normalized_width NUMERIC,
  normalized_height NUMERIC,
  normalized_depth NUMERIC,
  scale_factor NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Campos importantes:**
- `marker_id`: ID do marcador AR (1-10) para rastreamento
- `model_url`: URL do modelo 3D (.glb) no Supabase Storage
- `audio_url`: URL do áudio narrado (.mp3/.wav)
- `normalized_*`: Dimensões normalizadas (maior dimensão = 3m)
- `scale_factor`: Fator de escala aplicado ao modelo

#### 2. `favorites`
Armazena os favoritos dos usuários.

```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, exhibit_id)
);
```

#### 3. `admin_info`
Armazena informações do administrador principal.

```sql
CREATE TABLE admin_info (
  admin_user_id UUID PRIMARY KEY REFERENCES auth.users(id)
);
```

### Buckets do Supabase Storage

#### 1. `models`
Armazena modelos 3D (.glb)
- **Políticas necessárias:**
  - `SELECT`: Público (para leitura no visualizador AR)
  - `INSERT`: Usuários autenticados (para upload no dashboard)
  - `DELETE`: Usuários autenticados (para exclusão no dashboard)

#### 2. `audio`
Armazena arquivos de áudio (.mp3, .wav, .ogg)
- **Políticas necessárias:** Mesmas do bucket `models`

## 🔧 Configuração do Supabase

### 1. Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Anote as credenciais:
   - **Project URL**
   - **Anon Key** (chave pública)

### 2. Executar Scripts SQL

No SQL Editor do Supabase, execute:

```sql
-- Criar tabela exhibits
CREATE TABLE exhibits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description_text TEXT,
  marker_id TEXT NOT NULL DEFAULT '1',
  model_url TEXT,
  audio_url TEXT,
  normalized_width NUMERIC,
  normalized_height NUMERIC,
  normalized_depth NUMERIC,
  scale_factor NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela favorites
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  exhibit_id UUID NOT NULL REFERENCES exhibits(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, exhibit_id)
);

-- Criar tabela admin_info
CREATE TABLE admin_info (
  admin_user_id UUID PRIMARY KEY REFERENCES auth.users(id)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE exhibits ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_info ENABLE ROW LEVEL SECURITY;

-- Políticas para exhibits (leitura pública, escrita autenticada)
CREATE POLICY "Exhibits são públicos para leitura" 
ON exhibits FOR SELECT USING (true);

CREATE POLICY "Usuários autenticados podem inserir exhibits" 
ON exhibits FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem atualizar exhibits" 
ON exhibits FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem deletar exhibits" 
ON exhibits FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas para favorites
CREATE POLICY "Usuários podem ver seus próprios favoritos" 
ON favorites FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir seus favoritos" 
ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus favoritos" 
ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Políticas para admin_info
CREATE POLICY "Qualquer um pode ler admin_info" 
ON admin_info FOR SELECT USING (true);

CREATE POLICY "Usuários autenticados podem inserir admin_info" 
ON admin_info FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

### 3. Criar Buckets de Storage

No painel do Supabase:

1. Vá em **Storage** → **New bucket**
2. Crie bucket `models` (público)
3. Crie bucket `audio` (público)

### 4. Configurar Políticas de Storage

Para cada bucket (`models` e `audio`), execute:

```sql
-- Políticas para bucket models
CREATE POLICY "Models são públicos para leitura"
ON storage.objects FOR SELECT USING (bucket_id = 'models');

CREATE POLICY "Usuários autenticados podem fazer upload de models"
ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'models' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Usuários autenticados podem deletar models"
ON storage.objects FOR DELETE WITH CHECK (
  bucket_id = 'models' AND 
  auth.role() = 'authenticated'
);

-- Repita para bucket 'audio'
```

## 💻 Setup do Projeto Local

### 1. Clonar o Repositório

```bash
git clone <repositorio-url>
cd webeduar/admin-dashboard
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Crie arquivo `.env` na raiz de `admin-dashboard/`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
VITE_ADMIN_EMAIL=admin@seu-dominio.com
```

**Importante:** Substitua com suas credenciais do Supabase.

### 4. Atualizar Credenciais no Visualizador AR

Edite `public/ar-viewer/index.html` (linhas 352-353):

```javascript
const SUPABASE_URL     = 'https://seu-projeto.supabase.co'
const SUPABASE_ANON_KEY = 'sua-chave-anon-aqui'
```

### 5. Executar em Desenvolvimento

```bash
npm run dev
```

O dashboard estará disponível em `http://localhost:5173`

### 6. Build para Produção

```bash
npm run build
```

Os arquivos compilados estarão em `dist/`.

## 🚀 Deploy

### Opção 1: Vercel (Recomendado)

1. Conecte seu repositório ao Vercel
2. Configure as variáveis de ambiente no painel do Vercel
3. Deploy automático

### Opção 2: Netlify

1. Conecte seu repositório ao Netlify
2. Configure build command: `npm run build`
3. Configure publish directory: `dist`
4. Adicione variáveis de ambiente

### Opção 3: Supabase Hosting

1. Faça upload da pasta `dist/` para o Supabase Storage
2. Configure domínio customizado

## 👤 Configuração de Usuários

### Criar Administrador

1. Acesse o dashboard em desenvolvimento
2. Clique em "Registrar" (se habilitado) ou use o SQL Editor:
```sql
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES ('admin@seu-dominio.com', crypt('sua-senha', gen_salt('bf')), NOW());
```

3. Faça login com o email configurado em `VITE_ADMIN_EMAIL`

### Criar Usuários Visitantes

Visitantes podem acessar a página `/favorites` sem login, ou criar conta via página de login.

## 📱 Funcionalidades Principais

### Dashboard Administrativo

- **Listar Exposições**: Visualizar todas as exposições criadas
- **Criar Exposição**: Upload de modelo 3D (.glb) e áudio (.mp3)
- **Editar Exposição**: Modificar dados e substituir arquivos
- **Excluir Exposição**: Remove exposição e arquivos do storage
- **Gerenciar Favoritos**: Marcar exposições como favoritas
- **Monitorar Armazenamento**: Visualizar uso do storage (limite 1GB plano free)

### Visualizador AR

- **Rastreamento de Marcador**: Usa marcador Hiro padrão
- **Visualização 3D**: Renderiza modelos GLB interativos
- **Controles de Brilho**: Ajusta iluminação do modelo
- **Reprodução de Áudio**: Toca áudio narrado automaticamente
- **Animações**: Suporte a animações embutidas no modelo
- **Painel Informativo**: Exibe nome e descrição da exposição

### Sistema de Favoritos

- Usuários podem favoritar exposições
- Favoritos salvos no banco (usuários logados) ou localStorage (visitantes)
- Página pública `/favorites` mostra exposições em destaque

## 🔍 Scripts SQL Úteis

### Adicionar Campos de Dimensões

Se precisar adicionar os campos de normalização:

```sql
-- Execute add_dimensions_fields.sql no SQL Editor
ALTER TABLE exhibits 
ADD COLUMN IF NOT EXISTS normalized_width NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_height NUMERIC,
ADD COLUMN IF NOT EXISTS normalized_depth NUMERIC,
ADD COLUMN IF NOT EXISTS scale_factor NUMERIC;
```

### Limpar Todas as Exposições

⚠️ **CUIDADO:** Isso exclui todos os dados!

```sql
-- Execute clear_exhibits.sql no SQL Editor
DELETE FROM favorites WHERE exhibit_id IN (SELECT id FROM exhibits);
DELETE FROM exhibits;
```

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, Vite 8
- **UI**: Lucide React (ícones), CSS customizado
- **3D/AR**: Three.js, A-Frame, AR.js, Google Model Viewer
- **Backend**: Supabase (PostgreSQL + Storage + Auth)
- **QR Code**: qrcode.react
- **Roteamento**: React Router DOM 7
- **Processamento 3D**: @gltf-transform/core

## 📝 Notas Importantes

1. **Limites do Plano Free Supabase**:
   - 1GB de storage
   - 500MB de banco de dados
   - 2GB de transferência mensal

2. **Tamanhos de Arquivo**:
   - Modelos 3D: máximo 20MB
   - Áudios: máximo 10MB

3. **Marcadores AR**:
   - O sistema usa marcador Hiro padrão
   - Cada exposição pode ter um ID de marcador (1-10)
   - Para usar marcadores customizados, é necessário criar arquivos .patt

4. **Normalização de Modelos**:
   - Modelos são automaticamente normalizados (maior dimensão = 3m)
   - O fator de escala é calculado e salvo no banco
   - Isso garante consistência visual entre diferentes modelos

## 🐛 Troubleshooting

### Erro: "Exposição não encontrada"
- Verifique se o ID no QR Code está correto
- Confirme que a exposição existe no banco de dados

### Erro: "Falha ao carregar modelo 3D"
- Verifique se o arquivo .glb é válido
- Confirme que as texturas estão embutidas (não externas)
- Verifique as políticas do bucket `models`

### Erro: "Autoplay bloqueado"
- Navegadores bloqueiam autoplay de áudio
- O usuário deve clicar no botão de áudio manualmente

### Erro: "Storage cheio"
- Monitore o uso no dashboard
- Exclua exposições não utilizadas
- Considere upgrade do plano Supabase

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- Documentação do Supabase: https://supabase.com/docs
- Documentação do A-Frame: https://aframe.io
- Documentação do AR.js: https://ar-js-org.github.io/AR.js

---

**Última atualização:** Julho 2026
