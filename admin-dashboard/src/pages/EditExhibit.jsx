import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Upload, Save, ArrowLeft, Volume2, Box, QrCode, Download, Eye, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress } from '@gltf-transform/functions'

// Dynamically load Google Model Viewer component for 3D previewing
if (!customElements.get('model-viewer')) {
  const script = document.createElement('script')
  script.type = 'module'
  script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js'
  document.head.appendChild(script)
}

// Define base viewer path without origin so we can construct it dynamically based on how the admin is accessing the panel
const AR_VIEWER_PATH = '/ar-viewer/index.html'

const MARKERS = Array.from({ length: 10 }, (_, i) => i + 1)

// Função para calcular bounding box de um modelo 3D
async function calculateModelBoundingBox(modelUrl) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(modelUrl, (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      resolve({
        width: size.x,
        height: size.y,
        depth: size.z
      })
    }, undefined, reject)
  })
}

// Função para normalizar dimensões (maior dimensão = 2 metros)
function normalizeDimensions(dimensions) {
  const { width, height, depth } = dimensions
  const maxDimension = Math.max(width, height, depth)
  
  if (maxDimension === 0) {
    return { width: 2, height: 2, depth: 2, scale: 1 }
  }
  
  const targetSize = 2 // 2 metros
  const scale = targetSize / maxDimension
  
  return {
    width: width * scale,
    height: height * scale,
    depth: depth * scale,
    scale: scale
  }
}

// Função para converter GLTF com texturas para GLB
async function convertGltfToGlb(gltfFile, textureFiles) {
  try {
    const io = new NodeIO(ALL_EXTENSIONS)
    
    // Criar estrutura de arquivos para o conversor
    const fileMap = new Map()
    fileMap.set(gltfFile.name, await gltfFile.arrayBuffer())
    
    // Adicionar texturas ao mapa de arquivos
    for (const textureFile of textureFiles) {
      fileMap.set(textureFile.webkitRelativePath || textureFile.name, await textureFile.arrayBuffer())
    }
    
    // Configurar o IO para usar os arquivos
    io.setFileSystem(fileMap)
    
    // Ler o documento GLTF
    const document = await io.read(gltfFile.name)
    
    // Aplicar otimizações
    await document.transform(
      dedup(),
      prune(),
      textureCompress({ encoder: 'webp' })
    )
    
    // Escrever como GLB
    const glbBuffer = await io.writeBinary(document)
    
    // Criar Blob GLB
    const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' })
    const glbFile = new File([glbBlob], gltfFile.name.replace('.gltf', '.glb'), { type: 'model/gltf-binary' })
    
    return glbFile
  } catch (error) {
    console.error('Erro ao converter GLTF para GLB:', error)
    throw new Error('Falha ao converter arquivo GLTF para GLB: ' + error.message)
  }
}

export default function EditExhibit({ isAdmin }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)
  const qrRef = useRef(null);
  const markerImgRef = useRef(null);

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(isEditing)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [form, setForm] = useState({
    name: '',
    description_text: '',
    marker_id: '1',
  })

  const [modelFile, setModelFile] = useState(null)
  const [textureFiles, setTextureFiles] = useState([])
  const [audioFile, setAudioFile] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [exhibitId, setExhibitId] = useState(id || null)

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard')
      return
    }
    if (isEditing) loadExhibit()
  }, [id, isAdmin])

  const loadExhibit = async () => {
    try {
      const { data, error } = await supabase
        .from('exhibits')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      setForm({
        name: data.name,
        description_text: data.description_text || '',
        marker_id: data.marker_id || '1',
      })
      setModelUrl(data.model_url)
      setAudioUrl(data.audio_url)
      setExhibitId(data.id)
    } catch (err) {
      setError('Erro ao carregar exposição: ' + err.message)
    } finally {
      setFetching(false)
    }
  }

  const uploadFile = async (file, bucket) => {
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
    return data.publicUrl
  }

  const deleteFile = async (fileUrl, bucket) => {
    if (!fileUrl) return
    
    try {
      // Extrair o nome do arquivo da URL do Supabase Storage
      // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[filename]
      const urlParts = fileUrl.split('/')
      const fileName = urlParts[urlParts.length - 1]
      
      const { error } = await supabase.storage.from(bucket).remove([fileName])
      if (error) {
        console.error('Erro ao excluir arquivo antigo:', error)
        // Não lançar erro para não interromper o processo de upload
      }
    } catch (err) {
      console.error('Erro ao processar exclusão de arquivo:', err)
      // Não lançar erro para não interromper o processo de upload
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      let finalModelUrl = modelUrl
      let finalAudioUrl = audioUrl
      let normalizedDimensions = null

      if (modelFile) {
        // Excluir arquivo antigo do modelo se existir
        if (modelUrl && isEditing) {
          setSuccess('Excluindo modelo 3D antigo...')
          await deleteFile(modelUrl, 'models')
        }
        
        let fileToUpload = modelFile
        
        // Se for GLTF com texturas, converter para GLB
        if (modelFile.name.endsWith('.gltf') && textureFiles.length > 0) {
          setSuccess('Convertendo GLTF para GLB...')
          fileToUpload = await convertGltfToGlb(modelFile, textureFiles)
        }
        
        setSuccess('Enviando modelo 3D...')
        finalModelUrl = await uploadFile(fileToUpload, 'models')
        
        // Calcular dimensões do modelo
        setSuccess('Calculando dimensões do modelo...')
        const boundingBox = await calculateModelBoundingBox(finalModelUrl)
        normalizedDimensions = normalizeDimensions(boundingBox)
      }

      if (audioFile) {
        // Excluir arquivo antigo do áudio se existir
        if (audioUrl && isEditing) {
          setSuccess('Excluindo áudio antigo...')
          await deleteFile(audioUrl, 'audio')
        }
        
        setSuccess('Enviando áudio...')
        finalAudioUrl = await uploadFile(audioFile, 'audio')
      }

      setSuccess('Salvando dados...')

      const payload = {
        name: form.name,
        description_text: form.description_text,
        marker_id: form.marker_id,
        model_url: finalModelUrl,
        audio_url: finalAudioUrl,
        // Salvar dimensões normalizadas
        normalized_width: normalizedDimensions?.width,
        normalized_height: normalizedDimensions?.height,
        normalized_depth: normalizedDimensions?.depth,
        scale_factor: normalizedDimensions?.scale,
      }

      let data, error
      if (isEditing) {
        ({ data, error } = await supabase
          .from('exhibits')
          .update(payload)
          .eq('id', id)
          .select()
          .single())
      } else {
        ({ data, error } = await supabase
          .from('exhibits')
          .insert(payload)
          .select()
          .single())
      }

      if (error) throw error

      setModelUrl(data.model_url)
      setAudioUrl(data.audio_url)
      setExhibitId(data.id)
      setModelFile(null)
      setTextureFiles([])
      setAudioFile(null)
      
      alert(isEditing ? 'Exposição atualizada com sucesso!' : 'Nova exposição criada com sucesso!')
      navigate('/dashboard')
    } catch (err) {
      setError('Erro: ' + err.message)
      setSuccess(null)
    } finally {
      setLoading(false)
    }
  }

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 300, 300)
      ctx.drawImage(img, 0, 0, 300, 300)
      const a = document.createElement('a')
      a.download = `qrcode-${form.name || 'exposicao'}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
  };

  const downloadMarker = () => {
    const img = markerImgRef.current;
    if (!img) return;
    const src = img.src;
    const a = document.createElement('a');
    a.href = src;
    a.download = `marker-${form.marker_id || '1'}.jpg`;
    a.click();
  };

  const viewerUrl = exhibitId
    ? `${window.location.origin}${AR_VIEWER_PATH}?id=${exhibitId}`
    : null

  // Generate temporary preview URL for the local file if selected, otherwise fallback to saved DB url
  const previewModelUrl = modelFile ? URL.createObjectURL(modelFile) : modelUrl

  if (fetching) return <p>Carregando...</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="icon-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={22} />
        </button>
        <h2>{isEditing ? 'Editar Exposição' : 'Nova Exposição'}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>

        {/* Left column: Form and 3D preview at the bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Form Card */}
          <form onSubmit={handleSubmit} className="card">

            {/* Feedback */}
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '0.75rem 1rem', color: 'var(--danger)', marginBottom: '1.5rem' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '0.75rem 1rem', color: 'var(--primary)', marginBottom: '1.5rem' }}>
                {success}
              </div>
            )}

            {/* Name */}
            <div style={{ marginBottom: '0.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nome da Exposição *</label>
              <input
                type="text"
                required
                placeholder="Ex: Árvore Buriti"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '0.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Descrição / Texto Informativo</label>
              <textarea
                rows={5}
                placeholder="Escreva informações sobre este elemento da natureza..."
                value={form.description_text}
                onChange={e => setForm({ ...form, description_text: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Marker ID */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>ID do Marcador AR *</label>
              <select
                value={form.marker_id}
                onChange={e => setForm({ ...form, marker_id: e.target.value })}
                style={{ marginBottom: 0 }}
              >
                {MARKERS.map(n => (
                  <option key={n} value={String(n)}>Marcador #{n}</option>
                ))}
              </select>
              <small style={{ color: 'var(--text-muted)' }}>
                Cada exposição deve ter um marcador diferente. Imprima o marcador correspondente.
              </small>
            </div>

            {/* 3D Model Upload */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                <Box size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
                Modelo 3D (.glb / .gltf + texturas)
              </label>
              
              {/* Opção 1: Arquivo único GLB/GLTF */}
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: modelFile && !modelFile.name.endsWith('.gltf') ? 'rgba(16,185,129,0.05)' : 'transparent',
                  marginBottom: '0.75rem'
                }}
                onClick={() => document.getElementById('model-input').click()}
              >
                <input
                  id="model-input"
                  type="file"
                  accept=".glb,.gltf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    setModelFile(e.target.files[0])
                    setTextureFiles([])
                  }}
                />
                <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                {modelFile && !modelFile.name.endsWith('.gltf') ? (
                  <p style={{ color: 'var(--primary)' }}>✓ {modelFile.name}</p>
                ) : modelUrl ? (
                  <p style={{ color: 'var(--primary)' }}>✓ Modelo já carregado. Clique para substituir.</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Clique para selecionar arquivo .glb ou .gltf</p>
                )}
              </div>

              {/* Opção 2: GLTF + pasta de texturas */}
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: modelFile?.name.endsWith('.gltf') ? 'rgba(16,185,129,0.05)' : 'transparent'
                }}
                onClick={() => document.getElementById('gltf-folder-input').click()}
              >
                <input
                  id="gltf-folder-input"
                  type="file"
                  accept=".gltf"
                  webkitdirectory=""
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files)
                    const gltfFile = files.find(f => f.name.endsWith('.gltf'))
                    const textures = files.filter(f => 
                      f.name.match(/\.(jpg|jpeg|png|webp|ktx|ktx2)$/i) && 
                      !f.name.endsWith('.gltf')
                    )
                    
                    if (gltfFile) {
                      setModelFile(gltfFile)
                      setTextureFiles(textures)
                    } else {
                      setError('Nenhum arquivo .gltf encontrado na pasta selecionada')
                    }
                  }}
                />
                <FolderOpen size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                {modelFile?.name.endsWith('.gltf') ? (
                  <p style={{ color: 'var(--primary)' }}>✓ {modelFile.name} + {textureFiles.length} texturas</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Clique para selecionar pasta com .gltf + texturas</p>
                )}
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                  Selecione a pasta que contém o arquivo .gltf e as texturas
                </small>
              </div>
            </div>

            {/* Audio Upload */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                <Volume2 size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
                Áudio Narrado (.mp3 / .wav)
              </label>
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: audioFile || audioUrl ? 'rgba(16,185,129,0.05)' : 'transparent'
                }}
                onClick={() => document.getElementById('audio-input').click()}
              >
                <input
                  id="audio-input"
                  type="file"
                  accept=".mp3,.wav,.ogg"
                  style={{ display: 'none' }}
                  onChange={e => setAudioFile(e.target.files[0])}
                />
                <Volume2 size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                {audioFile ? (
                  <p style={{ color: 'var(--primary)' }}>✓ {audioFile.name}</p>
                ) : audioUrl ? (
                  <p style={{ color: 'var(--primary)' }}>✓ Áudio já carregado. Clique para substituir.</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Clique para selecionar o arquivo</p>
                )}
              </div>
            </div>

            {/* Audio preview */}
            {audioUrl && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Prévia do Áudio</label>
                <audio controls src={audioUrl} style={{ width: '100%' }} />
              </div>
            )}

            <button type="submit" className="primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }}>
              <Save size={18} />
              {loading ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Criar Exposição')}
            </button>
          </form>

          {/* 3D Preview Card (at the bottom of the form) */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Eye size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>Visualização Prévia 3D</h3>
            </div>
            {previewModelUrl ? (
              <div style={{ width: '100%', height: '320px', background: 'var(--bg-color)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                <model-viewer
                  src={previewModelUrl}
                  camera-controls
                  auto-rotate
                  shadow-intensity="1"
                  shadow-softness="0.5"
                  environment-image="neutral"
                  exposure="1"
                  interaction-prompt="none"
                  loading="eager"
                  reveal="auto"
                  touch-action="pan-y"
                  style={{ width: '100%', height: '100%', outline: 'none' }}
                  alt="Prévia do modelo 3D"
                  onError={(e) => {
                    console.error('Erro ao carregar modelo 3D:', e)
                    alert('Erro ao carregar o modelo 3D. Verifique se o arquivo está no formato correto (.glb) e se as texturas estão embutidas.')
                  }}
                ></model-viewer>
              </div>
            ) : (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', border: '2px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                <Box size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.9rem' }}>Envie um modelo 3D (.glb) para ver a prévia interativa aqui.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: QR Code and Marker Panels */}
        <div style={{ minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* QR Code card */}
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
              <QrCode size={20} />
              <h3 style={{ margin: 0 }}>QR Code AR</h3>
            </div>

            {viewerUrl ? (
              <>
                <div ref={qrRef} style={{ display: 'inline-block', padding: '1rem', background: 'white', borderRadius: '12px' }}>
                  <QRCodeSVG
                    value={viewerUrl}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '1rem 0' }}>
                  Imprima este QR Code junto ao marcador AR #{form.marker_id}
                </p>
                <button
                  onClick={downloadQR}
                  style={{ width: '100%', justifyContent: 'center', backgroundColor: 'var(--border-color)', color: 'var(--text-color)', marginBottom: '0.5rem' }}
                >
                  <Download size={16} /> Baixar QR Code
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="text"
                    readOnly
                    value={viewerUrl}
                    style={{ fontSize: '0.8rem', padding: '0.5rem', marginBottom: 0, textAlign: 'center', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(viewerUrl)
                      alert('Link copiado para a área de transferência!')
                    }}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
                    className="primary"
                  >
                    Copiar Link do Visualizador
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '2rem 1rem', color: 'var(--text-muted)', border: '2px dashed var(--border-color)', borderRadius: '8px' }}>
                <QrCode size={48} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
                <p style={{ fontSize: '0.85rem' }}>O QR Code aparecerá aqui após salvar a exposição.</p>
              </div>
            )}
          </div>

          {/* Marker reference card */}
          <div className="card">
            <h4 style={{ marginBottom: '0.75rem' }}>Marcador #{form.marker_id}</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Imprima este marcador e fixe-o no local da exposição. Apontar a câmera para ele exibirá o modelo 3D.
            </p>
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#333'
            }}>
              <img
                ref={markerImgRef}
                src={`https://raw.githack.com/AR-js-org/AR.js/master/data/images/HIRO.jpg`}
                alt={`Marcador AR`}
                style={{ width: '120px', height: '120px', imageRendering: 'pixelated' }}
              />
              <div style={{ marginTop: '0.5rem', color: '#666' }}>Marcador Padrão</div>
            </div>
            <button
              onClick={downloadMarker}
              style={{ width: '100%', marginTop: '1rem', justifyContent: 'center', backgroundColor: 'var(--border-color)', color: 'var(--text-color)' }}
            >
              <Download size={16} /> Baixar Marcador
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
