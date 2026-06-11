import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'

// Visitor page – read‑only view of exhibits with QR codes and markers
export default function Visitor() {
  const [exhibits, setExhibits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchExhibits()
  }, [])

  const fetchExhibits = async () => {
    try {
      const { data, error } = await supabase
        .from('exhibits')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setExhibits(data || [])
    } catch (e) {
      console.error('Erro ao carregar exposições (visitor):', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1>Visualização de Exposições</h1>
        <p>Modo visitante – somente leitura dos QR Codes e marcadores.</p>
        <Link to="/" style={{ marginTop: '1rem', display: 'inline-block', marginRight: '1rem' }}>
          <button className="secondary">Voltar ao Login</button>
        </Link>
        <Link to="/favorites" style={{ marginTop: '1rem', display: 'inline-block' }}>
          <button className="secondary">Ver Favoritos</button>
        </Link>
      </header>

      {loading ? (
        <p>Carregando exposições...</p>
      ) : exhibits.length === 0 ? (
        <p>Nenhuma exposição encontrada.</p>
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
              <button
                className="primary"
                style={{ marginTop: '0.5rem', width: '100%' }}
                onClick={() => {
                  const fav = JSON.parse(localStorage.getItem('favorites') || '[]');
                  if (!fav.includes(exhibit.id)) {
                    fav.push(exhibit.id);
                    localStorage.setItem('favorites', JSON.stringify(fav));
                    alert('Exposição adicionada aos favoritos!');
                  } else {
                    alert('Já está nos favoritos.');
                  }
                }}
              >Favoritar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
