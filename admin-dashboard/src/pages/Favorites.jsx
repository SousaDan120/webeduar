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
              <div style={{ margin: '1rem 0' }}>
                <QRCodeSVG
                  value={window.location.origin + `/exhibit/${exhibit.id}`}
                  size={128}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Marcador AR: ID {exhibit.marker_id || '1'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
