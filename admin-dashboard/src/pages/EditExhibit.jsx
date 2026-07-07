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

// Define base viewer path without origin so we can construct it dynamically
const AR_VIEWER_PATH = '/ar-viewer/index.html'

const MARKERS = Array.from({ length: 10 }, (_, i) => i + 1)

export default function EditExhibit({ isAdmin }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)
  const qrRef = useRef(null)
  const markerImgRef = useRef(null)
  const modelViewerRef = useRef(null)
  // Track if Hiro plane was already added to avoid duplicates
  const hiroPlaneRef = useRef(null)

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

  const [modelRotationY, setModelRotationY] = useState(0)
  const [modelScale, setModelScale] = useState(1.0)
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0.1, z: 0 })

  // Generate preview URL: local blob if file selected, else saved DB url
  const previewModelUrl = modelFile ? URL.createObjectURL(modelFile) : modelUrl

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

      const rot = data.model_rotation || { x: 0, y: 0, z: 0 }
      const pos = data.model_position || { x: 0, y: 0.1, z: 0 }
      const scale =
        data.model_scale !== undefined && data.model_scale !== null
          ? data.model_scale
          : 1.0

      setModelRotationY(rot.y || 0)
      setModelScale(scale)
      setModelPosition(pos)
    } catch (err) {
      setError('Erro ao carregar exposição: ' + err.message)
    } finally {
      setFetching(false)
    }
  }

  // ── Hiro Plane injection ───────────────────────────────────────────────────
  // Injects a flat plane representing the physical Hiro marker into the
  // model-viewer scene so the admin can see where the anchor is.
  const setupHiroPlane = () => {
    const mv = modelViewerRef.current
    if (!mv || !window.THREE) return

    // Access model-viewer's internal Three.js scene via its symbol property
    const symbol = Object.getOwnPropertySymbols(mv).find(
      (s) => s.description === 'scene'
    )
    if (!symbol) return
    const scene = mv[symbol]

    // Remove old plane if it exists so we can reposition it
    if (hiroPlaneRef.current) {
      scene.remove(hiroPlaneRef.current)
      hiroPlaneRef.current = null
    }

    // Build Hiro-style texture on a canvas
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')

    // Outer white border
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    // Black outer square
    ctx.fillStyle = '#000000'
    ctx.fillRect(64, 64, 384, 384)
    // White inner square
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(128, 128, 256, 256)
    // "HIRO" text in center
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 80px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('HIRO', 256, 256)

    const texture = new THREE.CanvasTexture(canvas)
    // The plane size represents ~1.2 A-Frame units — same as the real Hiro marker footprint
    const geometry = new THREE.PlaneGeometry(1.2, 1.2)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.name = 'hiro-anchor-plane'
    // Lay flat on the XZ plane (rotate -90° around X)
    plane.rotation.x = -Math.PI / 2
    // Position the anchor so the model sits on top of it:
    // The model's base is at Y=0 in the marker's coordinate system,
    // so we place the plane just below that.
    plane.position.set(-modelPosition.x, -modelPosition.y - 0.01, -modelPosition.z)

    scene.add(plane)
    hiroPlaneRef.current = plane
  }

  // Re-inject Hiro plane when model or position changes
  useEffect(() => {
    const loadThreeAndSetup = () => {
      if (window.THREE) {
        setupHiroPlane()
      } else {
        const script = document.createElement('script')
        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
        script.onload = setupHiroPlane
        document.head.appendChild(script)
      }
    }
    loadThreeAndSetup()
  }, [modelPosition])

  // Attach to model-viewer load event to inject plane after model renders
  useEffect(() => {
    const mv = modelViewerRef.current
    if (!mv) return
    const onLoad = () => setupHiroPlane()
    mv.addEventListener('load', onLoad)
    return () => mv.removeEventListener('load', onLoad)
  }, [modelViewerRef.current, modelPosition])

  // ── File upload helper ─────────────────────────────────────────────────────
  const uploadFile = async (file, bucket) => {
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
    return data.publicUrl
  }

  // ── Form submit ───────────────────────────────────────────────────────────
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
        model_rotation: { x: 0, y: modelRotationY, z: 0 },
        model_scale: modelScale,
        model_position: modelPosition,
      }

      let data, dbError
      if (isEditing) {
        ;({ data, error: dbError } = await supabase
          .from('exhibits')
          .update(payload)
          .eq('id', id)
          .select()
          .single())
      } else {
        ;({ data, error: dbError } = await supabase
          .from('exhibits')
          .insert(payload)
          .select()
          .single())
      }

      if (dbError) throw dbError

      setModelUrl(data.model_url)
      setAudioUrl(data.audio_url)
      setExhibitId(data.id)
      setModelFile(null)
      setAudioFile(null)

      alert(
        isEditing
          ? 'Exposição atualizada com sucesso!'
          : 'Nova exposição criada com sucesso!'
      )
      navigate('/dashboard')
    } catch (err) {
      setError('Erro: ' + err.message)
      setSuccess(null)
    } finally {
      setLoading(false)
    }
  }

  // ── QR / Marker download ──────────────────────────────────────────────────
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
  }

  const downloadMarker = () => {
    const img = markerImgRef.current
    if (!img) return
    const a = document.createElement('a')
    a.href = img.src
    a.download = `marker-${form.marker_id || '1'}.jpg`
    a.click()
  }

  const viewerUrl = exhibitId
    ? `${window.location.origin}${AR_VIEWER_PATH}?id=${exhibitId}`
    : null

  if (fetching) return <p>Carregando...</p>

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="icon-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={22} />
        </button>
        <h2>{isEditing ? 'Editar Exposição' : 'Nova Exposição'}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>

        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="card">

            {/* Feedback banners */}
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
            <div style={{ marginBottom: '1.25rem' }}>
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
            <div style={{ marginBottom: '1.25rem' }}>
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
                  background: modelFile || modelUrl ? 'rgba(16,185,129,0.05)' : 'transparent',
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
                  background: audioFile || audioUrl ? 'rgba(16,185,129,0.05)' : 'transparent',
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

            {/* Submit button */}
            <button type="submit" className="primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }}>
              <Save size={18} />
              {loading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Exposição'}
            </button>
          </form>

          {/* ── 3D Preview Card ────────────────────────────────────────────── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Eye size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>Visualização Prévia 3D — Âncora Hiro</h3>
            </div>

            {previewModelUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* model-viewer canvas */}
                <div style={{ width: '100%', height: '340px', background: '#0f172a', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <model-viewer
                    ref={modelViewerRef}
                    src={previewModelUrl}
                    camera-controls
                    shadow-intensity="1"
                    style={{ width: '100%', height: '100%', outline: 'none' }}
                    alt="Prévia do modelo 3D"
                    orientation={`0deg ${modelRotationY}deg 0deg`}
                    scale={`${modelScale} ${modelScale} ${modelScale}`}
                  />
                  {/* Overlay hint */}
                  <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    🟫 Quadrado branco = marcador Hiro físico
                  </div>
                </div>

                {/* Adjustment sliders */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>

                  {/* Rotation Y */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>🔄 Rotação Inicial (Eixo Y)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={modelRotationY}
                        onChange={e => setModelRotationY(parseInt(e.target.value))}
                        style={{ flex: 1, margin: 0, height: '8px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '2.5rem', textAlign: 'right' }}>{modelRotationY}°</span>
                    </div>
                  </div>

                  {/* Scale */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>🔍 Escala Adicional</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.05"
                        value={modelScale}
                        onChange={e => setModelScale(parseFloat(e.target.value))}
                        style={{ flex: 1, margin: 0, height: '8px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '2.5rem', textAlign: 'right' }}>{modelScale.toFixed(2)}x</span>
                    </div>
                  </div>

                  {/* Position X */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>↔️ Deslocamento X (Lateral)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="range"
                        min="-1.5"
                        max="1.5"
                        step="0.05"
                        value={modelPosition.x}
                        onChange={e => setModelPosition({ ...modelPosition, x: parseFloat(e.target.value) })}
                        style={{ flex: 1, margin: 0, height: '8px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '2.5rem', textAlign: 'right' }}>{modelPosition.x.toFixed(2)}m</span>
                    </div>
                  </div>

                  {/* Position Y */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>↕️ Deslocamento Y (Altura)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="range"
                        min="-1"
                        max="2"
                        step="0.05"
                        value={modelPosition.y}
                        onChange={e => setModelPosition({ ...modelPosition, y: parseFloat(e.target.value) })}
                        style={{ flex: 1, margin: 0, height: '8px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '2.5rem', textAlign: 'right' }}>{modelPosition.y.toFixed(2)}m</span>
                    </div>
                  </div>

                  {/* Position Z */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>↗️ Deslocamento Z (Profundidade)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="range"
                        min="-1.5"
                        max="1.5"
                        step="0.05"
                        value={modelPosition.z}
                        onChange={e => setModelPosition({ ...modelPosition, z: parseFloat(e.target.value) })}
                        style={{ flex: 1, margin: 0, height: '8px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '2.5rem', textAlign: 'right' }}>{modelPosition.z.toFixed(2)}m</span>
                    </div>
                  </div>

                  {/* Reset button */}
                  <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setModelRotationY(0)
                        setModelScale(1.0)
                        setModelPosition({ x: 0, y: 0.1, z: 0 })
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      ↩ Resetar posição
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', border: '2px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                <Box size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.9rem' }}>Envie um modelo 3D (.glb) para ver a prévia interativa aqui.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: QR Code and Marker Panels ──────────────────────── */}
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
            <div style={{ background: 'white', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <img
                ref={markerImgRef}
                src="https://raw.githack.com/AR-js-org/AR.js/master/data/images/HIRO.jpg"
                alt="Marcador AR Hiro"
                style={{ width: '120px', height: '120px', imageRendering: 'pixelated' }}
              />
              <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.75rem' }}>Marcador Padrão</div>
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
