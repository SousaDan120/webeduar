import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { QrCode, X } from 'lucide-react'

export default function Favorites() {
  const [exhibits, setExhibits] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedExhibit, setSelectedExhibit] = useState(null)

  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchFavorites(user)
    })
  }, [])

  const fetchFavorites = async (currentUser) => {
    try {
      setLoading(true)
      let favIds = []
      
      if (currentUser) {
        // Logged-in: fetch favorites from Supabase database
        const { data, error } = await supabase
          .from('favorites')
          .select('exhibit_id')
          .eq('user_id', currentUser.id)
        if (error) throw error
        favIds = data.map(f => f.exhibit_id)
      } else {
        // Anonymous visitor: fallback to localStorage
        favIds = JSON.parse(localStorage.getItem('favorites') || '[]')
      }

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
      {/* Keyframe animations injected for smooth modal expansion */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .clickable-card {
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .clickable-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          border-color: var(--primary);
        }
      `}</style>

      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1>Favoritos</h1>
        <p>Exposições que você favoritou.</p>
        <Link to="/" style={{ marginTop: '1rem', display: 'inline-block' }}>
          <button className="secondary">Voltar ao Login</button>
        </Link>
      </header>

      {/* Sync tip for anonymous visitors */}
      {!loading && !user && (
        <div style={{
          background: 'rgba(65, 105, 225, 0.08)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-color)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          marginBottom: '2rem',
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <strong>💡 Sincronização em Nuvem:</strong> Seus favoritos estão salvos apenas neste navegador. 
            Crie uma conta para sincronizar e acessá-los em qualquer dispositivo ou celular!
          </div>
          <Link to="/">
            <button className="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              Criar Conta / Login
            </button>
          </Link>
        </div>
      )}

      {loading ? (
        <p>Carregando favoritos...</p>
      ) : exhibits.length === 0 ? (
        <p>Nenhum favorito encontrado.</p>
      ) : (
        <div className="exhibit-grid">
          {exhibits.map((exhibit) => (
            <div 
              key={exhibit.id} 
              className="card exhibit-card clickable-card" 
              style={{ padding: '1.5rem' }}
              onClick={() => setSelectedExhibit(exhibit)}
            >
              <h3>{exhibit.name}</h3>
              <p>{exhibit.description_text ? exhibit.description_text.substring(0, 100) + '...' : 'Sem descrição'}</p>
              
              <button 
                className="primary" 
                style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedExhibit(exhibit)
                }}
              >
                <QrCode size={18} /> Ver QR & Marcador
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal / Expanded Card overlay */}
      {selectedExhibit && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.25s ease-out',
            padding: '1rem'
          }} 
          onClick={() => setSelectedExhibit(null)}
        >
          <div 
            className="card" 
            style={{
              maxWidth: '500px',
              width: '100%',
              padding: '2rem',
              position: 'relative',
              animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedExhibit(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="Fechar"
            >
              <X size={24} />
            </button>
            
            <h2 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>{selectedExhibit.name}</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              {selectedExhibit.description_text || 'Sem descrição.'}
            </p>

            <div style={{ 
              display: 'flex', 
              gap: '1.5rem', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '1.5rem 0', 
              background: 'var(--bg-color)', 
              padding: '1.5rem', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color)',
              flexWrap: 'wrap'
            }}>
              {/* QR Code (Left) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ padding: '0.75rem', background: 'white', borderRadius: '8px', display: 'inline-block', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                  <QRCodeSVG
                    value={window.location.origin + `/ar-viewer/index.html?id=${selectedExhibit.id}`}
                    size={140}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>1. Escanear p/ Abrir</span>
              </div>

              {/* Hiro Marker (Right) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ padding: '0.75rem', background: 'white', borderRadius: '8px', display: 'inline-block', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                  <img
                    src="https://raw.githubhacker.com/AR-js-org/AR.js/master/data/images/HIRO.jpg"
                    onError={(e) => {
                      e.target.src = "https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/HIRO.jpg"
                    }}
                    alt="Marcador Hiro"
                    style={{ width: '140px', height: '140px', display: 'block', borderRadius: '4px' }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-color)' }}>2. Apontar Marcador</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
              Escaneie o QR Code com a câmera do seu celular para carregar a experiência AR, e aponte a câmera para o marcador Hiro acima.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

