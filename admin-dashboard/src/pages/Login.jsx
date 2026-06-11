import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setMessage('Verifique seu e-mail para confirmar a conta.')
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto' }} className="card">
      <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Login do Admin</h2>
      
      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
      {message && <div style={{ color: 'var(--primary)', marginBottom: '1rem' }}>{message}</div>}
        {/* Botão para acesso ao modo visitante */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => window.location.href = '/visitor'}
            className="secondary"
            style={{ width: '100%', padding: '0.75rem', fontWeight: 'bold' }}
          >
            Acesso de Visitante
          </button>
        </div>
      <form onSubmit={handleLogin}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>E-mail</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            placeholder="admin@eduar.com"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Senha</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            placeholder="••••••••"
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button type="submit" className="primary" disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
            {loading ? 'Carregando...' : 'Entrar'}
          </button>
          <button type="button" onClick={handleSignUp} disabled={loading} style={{ flex: 1, justifyContent: 'center', backgroundColor: 'var(--border-color)', color: 'var(--text-color)' }}>
            Registrar
          </button>
        </div>
      </form>
    </div>
  )
}
