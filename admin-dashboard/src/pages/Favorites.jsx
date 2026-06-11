import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'

// Favorites page – shows only exhibits that the visitor has favorited (stored in localStorage)
export default function Favorites() {
  const [exhibits, setExhibits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFavorites()
  }, [])

  const fetchFavorites = async () => {
    try {
      const favIds = JSON.parse(localStorage.getItem('favorites') || '[]')
      if (favIds.length === 0) {
        setExhibits([])
        return
      }
      const { data, error } = await supabase
        .from('exhibits')
        .select('*')
        .in('id', favIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      setExhibits(data || [])
    } catch (e) {
      console.error('Erro ao carregar favoritos:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1>Favoritos</h1>
        <p>Exposições que você favoritou.</p>
        <Link to="/" style={{ marginTop: '1rem', display: 'inline-block' }}>
          <button className="secondary">Voltar ao Login</button>
        </Link>
      </header>

      {loading ? (
        <p>Carregando favoritos...</p>
      ) : exhibits.length === 0 ? (
        <p>Nenhum favorito encontrado.</p>
      ) : (
        <div className="exhibit-grid">
          {exhibits.map((exhibit) => (
            <div key={exhibit.id} className="card exhibit-card" style={{ padding: '1rem' }}>
              <h3>{exhibit.name}</h3>
              <p>{exhibit.description_text ? exhibit.description_text.substring(0, 80) + '...' : 'Sem descrição'}</p>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'center', margin: '1.5rem 0', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {/* QR Code (Left) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ padding: '0.5rem', background: 'white', borderRadius: '6px', display: 'inline-block' }}>
                    <QRCodeSVG
                      value={window.location.origin + `/ar-viewer/index.html?id=${exhibit.id}`}
                      size={120}
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>1. Escanear p/ Abrir</span>
                </div>

                {/* Hiro Marker (Right) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ padding: '0.5rem', background: 'white', borderRadius: '6px', display: 'inline-block' }}>
                    <img
                      src="https://raw.githubhacker.com/AR-js-org/AR.js/master/data/images/HIRO.jpg"
                      onError={(e) => {
                        // Fallback in case raw.githubhacker.com fails
                        e.target.src = "https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/HIRO.jpg"
                      }}
                      alt="Marcador Hiro"
                      style={{ width: '120px', height: '120px', display: 'block', borderRadius: '4px' }}
                    />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-color)' }}>2. Apontar Câmera Aqui</span>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Escaneie o QR Code para abrir a câmera 3D e aponte para o Marcador Hiro ao lado.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
