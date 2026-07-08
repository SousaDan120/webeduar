import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Trash2, Star, StarOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Dashboard({ isAdmin }) {
  const [exhibits, setExhibits] = useState([])
  const [loading, setLoading] = useState(true)

  const [favorites, setFavorites] = useState([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [calculatingStorage, setCalculatingStorage] = useState(false)
  const STORAGE_LIMIT = 1 * 1024 * 1024 * 1024 // 1 GB (Supabase free tier Storage limit)

  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        fetchDbFavorites(user.id)
        if (isAdmin) {
          // Registra o ID do administrador para acesso público dos visitantes
          supabase
            .from('admin_info')
            .upsert({ admin_user_id: user.id }, { onConflict: 'admin_user_id' })
            .then(({ error }) => {
              if (error) console.error('Erro ao registrar admin_info:', error)
            })
        }
      } else {
        const stored = JSON.parse(localStorage.getItem('favorites') || '[]')
        setFavorites(stored)
      }
    })
    fetchExhibits()
    calculateStorageUsage()
  }, [])

  const fetchDbFavorites = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('exhibit_id')
        .eq('user_id', userId)
      if (error) throw error
      setFavorites(data.map(f => f.exhibit_id))
    } catch (e) {
      console.error('Erro ao buscar favoritos do banco:', e)
    }
  }

  const calculateStorageUsage = async () => {
    try {
      setCalculatingStorage(true)
      let totalSize = 0

      // Fetch file info from 'models' bucket
      const { data: modelsList, error: modelsError } = await supabase.storage
        .from('models')
        .list('', { limit: 100 })
      
      if (!modelsError && modelsList) {
        modelsList.forEach(file => {
          if (file.metadata && file.metadata.size) {
            totalSize += file.metadata.size
          }
        })
      }

      // Fetch file info from 'audio' bucket
      const { data: audioList, error: audioError } = await supabase.storage
        .from('audio')
        .list('', { limit: 100 })
      
      if (!audioError && audioList) {
        audioList.forEach(file => {
          if (file.metadata && file.metadata.size) {
            totalSize += file.metadata.size
          }
        })
      }

      setStorageUsed(totalSize)
    } catch (err) {
      console.error('Erro ao calcular armazenamento: ', err)
    } finally {
      setCalculatingStorage(false)
    }
  }

  const fetchExhibits = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exhibits')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setExhibits(data || [])
    } catch (error) {
      alert('Erro ao carregar exposições: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!isAdmin) {
      alert('Apenas o administrador do sistema pode excluir exposições.')
      return
    }
    if (!window.confirm('Tem certeza que deseja excluir esta exposição? Isso também excluirá o modelo 3D e o áudio do armazenamento.')) return

    try {
      // Buscar dados da exposição para obter URLs dos arquivos
      const { data: exhibit, error: fetchError } = await supabase
        .from('exhibits')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchError) throw fetchError
      if (!exhibit) throw new Error('Exposição não encontrada.')

      // Excluir modelo 3D do storage se existir
      if (exhibit.model_url) {
        const modelFileName = exhibit.model_url.split('/').pop()
        const { error: modelDeleteError } = await supabase.storage
          .from('models')
          .remove([modelFileName])
        if (modelDeleteError) {
          console.error('Erro ao excluir modelo 3D:', modelDeleteError)
        }
      }

      // Excluir áudio do storage se existir
      if (exhibit.audio_url) {
        const audioFileName = exhibit.audio_url.split('/').pop()
        const { error: audioDeleteError } = await supabase.storage
          .from('audio')
          .remove([audioFileName])
        if (audioDeleteError) {
          console.error('Erro ao excluir áudio:', audioDeleteError)
        }
      }

      // Excluir registro do banco de dados
      const { error } = await supabase.from('exhibits').delete().eq('id', id)
      if (error) throw error
      
      setExhibits(exhibits.filter(e => e.id !== id))
      // Refresh storage metric after deletion
      calculateStorageUsage()
    } catch (error) {
      alert('Erro ao excluir: ' + error.message)
    }
  }

  // Format bytes helper
  const formatMegabytes = (bytes) => {
    return (bytes / (1024 * 1024)).toFixed(2)
  }

  const storagePercentage = Math.min((storageUsed / STORAGE_LIMIT) * 100, 100)

  return (
    <div>
      {!isAdmin && (
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid #f59e0b',
          color: '#f59e0b',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '2rem',
          fontSize: '0.9rem',
          lineHeight: '1.5'
        }}>
          <strong>Aviso de Permissões:</strong> Sua conta de usuário foi criada com sucesso! 
          No entanto, você está no modo de visualização de leitura. É necessária a permissão e aprovação 
          do administrador principal (liberação de acesso) para criar ou editar projetos de Realidade Aumentada.
        </div>
      )}

      {/* Storage Meter Widget */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Armazenamento Utilizado (Plano Gratuito Supabase)</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {formatMegabytes(storageUsed)} MB / 1024.00 MB ({storagePercentage.toFixed(2)}%)
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '10px',
          background: 'var(--border-color)',
          borderRadius: '5px',
          overflow: 'hidden',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: `${storagePercentage}%`,
            height: '100%',
            background: storagePercentage > 90 ? 'var(--danger)' : 'var(--primary)',
            transition: 'width 0.4s ease'
          }}></div>
        </div>
        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          O plano gratuito do Supabase disponibiliza até 1 GB (1024 MB) de armazenamento para modelos 3D e áudios.
        </small>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Suas Exposições</h2>
        {isAdmin && (
          <Link to="/exhibit/new">
            <button className="primary"><Plus size={18} /> Nova Exposição</button>
          </Link>
        )}
      </div>

      {loading ? (
        <p>Carregando exposições...</p>
      ) : exhibits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Você ainda não criou nenhuma exposição.</p>
        </div>
      ) : (
        <div className="exhibit-grid">
          {exhibits.map(exhibit => (
            <div key={exhibit.id} className="card exhibit-card">
              <h3>{exhibit.name}</h3>
              <p>{exhibit.description_text ? exhibit.description_text.substring(0, 80) + '...' : 'Sem descrição'}</p>
              
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                <div><strong>Marcador AR:</strong> ID {exhibit.marker_id || '1'}</div>
                {exhibit.model_url && <div>✓ Modelo 3D anexado</div>}
                {exhibit.audio_url && <div>✓ Áudio anexado</div>}
              </div>

                <div className="exhibit-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
                  {isAdmin ? (
                    <>
                      <Link to={`/exhibit/${exhibit.id}`} style={{ flex: 1 }}>
                        <button style={{ width: '100%', justifyContent: 'center', backgroundColor: 'var(--border-color)', color: 'var(--text-color)' }}>
                          <Edit2 size={16} /> Editar
                        </button>
                      </Link>
                      <button className="danger" onClick={() => handleDelete(exhibit.id)} aria-label="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Modo de Visualização
                    </span>
                  )}
                  {/* Favorite toggle - visible to everyone */}
                  <button onClick={async () => {
                    const isFav = favorites.includes(exhibit.id)
                    if (user) {
                      try {
                        if (isFav) {
                          const { error } = await supabase
                            .from('favorites')
                            .delete()
                            .eq('user_id', user.id)
                            .eq('exhibit_id', exhibit.id)
                          if (error) throw error
                          setFavorites(favorites.filter(id => id !== exhibit.id))
                        } else {
                          const { error } = await supabase
                            .from('favorites')
                            .insert({ user_id: user.id, exhibit_id: exhibit.id })
                          if (error) throw error
                          setFavorites([...favorites, exhibit.id])
                        }
                      } catch (e) {
                        alert('Erro ao atualizar favorito no banco: ' + e.message)
                      }
                    } else {
                      const fav = JSON.parse(localStorage.getItem('favorites') || '[]')
                      let newFav
                      if (fav.includes(exhibit.id)) {
                        newFav = fav.filter(id => id !== exhibit.id)
                      } else {
                        newFav = [...fav, exhibit.id]
                      }
                      localStorage.setItem('favorites', JSON.stringify(newFav))
                      setFavorites(newFav)
                    }
                  }} aria-label="Favoritar" style={{ background: 'transparent', border: 'none', marginLeft: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {favorites.includes(exhibit.id) ? <Star size={20} color="var(--primary)" fill="var(--primary)" /> : <StarOff size={20} color="var(--text-muted)" />}
                  </button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
