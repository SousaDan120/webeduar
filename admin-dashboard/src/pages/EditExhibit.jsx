import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Upload, Save, ArrowLeft, Volume2, Box, QrCode, Download, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  const [audioFile, setAudioFile] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [exhibitId, setExhibitId] = useState(id || null)
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0.1, z: 0 })
  const [modelRotation, setModelRotation] = useState({ x: 0, y: 0, z: 0 })
  const [cameraTheta, setCameraTheta] = useState(0)   // horizontal (0-360)
  const [cameraPhi, setCameraPhi] = useState(0)        // vertical elevation (0-89) (de frente/de cima sem inclinação)
  const [cameraRadius, setCameraRadius] = useState(245) // zoom invertido: slider alto = câmera perto (245 → distância 105%)

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
      if (data.model_position) {
        setModelPosition(data.model_position)
      }
      if (data.model_rotation) {
        setModelRotation(data.model_rotation)
      }
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      let finalModelUrl = modelUrl
      let finalAudioUrl = audioUrl

      if (modelFile) {
        setSuccess('Enviando modelo 3D...')
        finalModelUrl = await uploadFile(modelFile, 'models')
      }

      if (audioFile) {
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
        model_position: modelPosition,
        model_rotation: modelRotation,
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
                Modelo 3D (.glb / .gltf)
              </label>
              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: modelFile || modelUrl ? 'rgba(16,185,129,0.05)' : 'transparent'
                }}
                onClick={() => document.getElementById('model-input').click()}
              >
                <input
                  id="model-input"
                  type="file"
                  accept=".glb,.gltf"
                  style={{ display: 'none' }}
                  onChange={e => setModelFile(e.target.files[0])}
                />
                <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                {modelFile ? (
                  <p style={{ color: 'var(--primary)' }}>✓ {modelFile.name}</p>
                ) : modelUrl ? (
                  <p style={{ color: 'var(--primary)' }}>✓ Modelo já carregado. Clique para substituir.</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Clique para selecionar o arquivo</p>
                )}
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
              <>
                <div style={{ width: '100%', height: 'clamp(160px, 25vw, 260px)', background: 'var(--bg-color)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <model-viewer
                    src={previewModelUrl}
                    shadow-intensity="1"
                    camera-target={`${-modelPosition.x}m ${-modelPosition.y}m ${-modelPosition.z}m`}
                    camera-orbit={`${cameraTheta}deg ${cameraPhi}deg ${350 - cameraRadius}%`}
                    orientation={`${modelRotation.x}deg ${modelRotation.y}deg ${modelRotation.z}deg`}
                    interaction-prompt="none"
                    style={{ width: '100%', height: '100%', outline: 'none', pointerEvents: 'none' }}
                    alt="Prévia do modelo 3D"
                  ></model-viewer>

                  {/* Camera Control Panel */}
                  <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(15,23,42,0.92)', padding: '0.3rem 0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.2rem', zIndex: 10, width: 'clamp(90px, 28%, 130px)' }}>
                    <span style={{ fontSize: 'clamp(0.48rem, 1vw, 0.58rem)', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Câmera</span>

                    {[['Horizontal', cameraTheta, setCameraTheta, 0, 360], ['Vertical', cameraPhi, setCameraPhi, 0, 89], ['Zoom', cameraRadius, setCameraRadius, 50, 300]].map(([label, val, setter, min, max]) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <label style={{ fontSize: 'clamp(0.44rem, 0.9vw, 0.54rem)', color: 'white', fontWeight: 600 }}>
                          {label}{label === 'Zoom' ? ` ${Math.round((val / 300) * 100)}%` : ` ${val}°`}
                        </label>
                        <input type="range" min={min} max={max} value={val} onChange={e => setter(e.target.value)} style={{ width: '100%', margin: 0, height: '10px', cursor: 'pointer' }} />
                      </div>
                    ))}

                    <button type="button" onClick={() => { setCameraTheta(0); setCameraPhi(0); setCameraRadius(245) }}
                      style={{ marginTop: '1px', fontSize: 'clamp(0.42rem, 0.85vw, 0.52rem)', padding: '0.1rem 0', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', cursor: 'pointer' }}
                    >
                      Resetar
                    </button>
                  </div>

                  {/* Hiro Marker Reference Panel (Centralizado de forma plana) */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '120px',
                    height: '120px',
                    backgroundImage: 'url("https://raw.githack.com/AR-js-org/AR.js/master/data/images/HIRO.jpg")',
                    backgroundSize: 'contain',
                    pointerEvents: 'none',
                    opacity: 0.35,
                    border: '1px dashed white',
                    zIndex: 1
                  }}></div>
                </div>
                
                {/* Position + Rotation Controls (2-col grid) */}
                <div style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>

                  {/* Position */}
                  <div style={{ padding: '0.4rem 0.5rem', background: 'var(--bg-color)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: 'clamp(0.6rem, 1.2vw, 0.72rem)' }}>📐 Posição</h4>
                    {['x', 'y', 'z'].map(axis => (
                      <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                        <label style={{ width: '1.6rem', fontWeight: 700, fontSize: 'clamp(0.52rem, 1vw, 0.62rem)', flexShrink: 0, color: axis === 'x' ? '#f87171' : axis === 'y' ? '#4ade80' : '#60a5fa' }}>{axis.toUpperCase()}</label>
                        <input
                          type="range"
                          min={axis === 'y' ? '-2' : '-5'}
                          max={axis === 'y' ? '5' : '5'}
                          step="0.01"
                          value={modelPosition[axis]}
                          onChange={e => setModelPosition({ ...modelPosition, [axis]: parseFloat(e.target.value) })}
                          style={{ flex: 1, margin: 0, height: '10px', cursor: 'pointer' }}
                        />
                        <span style={{ width: '2.4rem', textAlign: 'right', fontFamily: 'monospace', fontSize: 'clamp(0.5rem, 0.9vw, 0.6rem)', flexShrink: 0 }}>{modelPosition[axis].toFixed(2)}</span>
                      </div>
                    ))}
                    <button type="button" onClick={() => setModelPosition({ x: 0, y: 0.1, z: 0 })}
                      style={{ marginTop: '0.2rem', width: '100%', justifyContent: 'center', backgroundColor: 'transparent', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '0.15rem', fontSize: 'clamp(0.5rem, 0.9vw, 0.6rem)', cursor: 'pointer', borderRadius: '4px' }}
                    >Resetar</button>
                  </div>

                  {/* Rotation */}
                  <div style={{ padding: '0.4rem 0.5rem', background: 'var(--bg-color)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 0.3rem', fontSize: 'clamp(0.6rem, 1.2vw, 0.72rem)' }}>🔄 Rotação</h4>
                    {['x', 'y', 'z'].map(axis => (
                      <div key={`rot-${axis}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                        <label style={{ width: '1.6rem', fontWeight: 700, fontSize: 'clamp(0.52rem, 1vw, 0.62rem)', flexShrink: 0, color: axis === 'x' ? '#f87171' : axis === 'y' ? '#4ade80' : '#60a5fa' }}>{axis.toUpperCase()}</label>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={modelRotation[axis]}
                          onChange={e => setModelRotation({ ...modelRotation, [axis]: parseFloat(e.target.value) })}
                          style={{ flex: 1, margin: 0, height: '10px', cursor: 'pointer' }}
                        />
                        <span style={{ width: '2.4rem', textAlign: 'right', fontFamily: 'monospace', fontSize: 'clamp(0.5rem, 0.9vw, 0.6rem)', flexShrink: 0 }}>{modelRotation[axis]}°</span>
                      </div>
                    ))}
                    <button type="button" onClick={() => setModelRotation({ x: 0, y: 0, z: 0 })}
                      style={{ marginTop: '0.2rem', width: '100%', justifyContent: 'center', backgroundColor: 'transparent', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '0.15rem', fontSize: 'clamp(0.5rem, 0.9vw, 0.6rem)', cursor: 'pointer', borderRadius: '4px' }}
                    >Resetar</button>
                  </div>

                </div>

                {/* Save Button */}
                <button 
                  type="button" 
                  onClick={handleSubmit} 
                  disabled={loading} 
                  className="primary" 
                  style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center', padding: '0.9rem' }}
                >
                  <Save size={18} />
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </>
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
