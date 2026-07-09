import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { supabase } from './lib/supabase'

// Pages (we will create these next)
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Favorites from './pages/Favorites'
import EditExhibit from './pages/EditExhibit'

function App() {
  const [session, setSession] = useState(null)
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || ''
  const isAdmin = session?.user?.email === adminEmail
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')

  useEffect(() => {
    // Set theme on body
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <Router>
      <div className="container">
        <header>
          <h1>PROJECT AR-EDU</h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {session && (
              <button className="danger" onClick={handleLogout}>Sair</button>
            )}
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={24} /> : <Sun size={24} />}
            </button>
          </div>
        </header>

        <main>
          <Routes>
            <Route 
              path="/" 
              element={session ? <Navigate to="/dashboard" /> : <Login />} 
            />
            <Route 
              path="/dashboard" 
              element={session ? <Dashboard isAdmin={isAdmin} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/exhibit/new" 
              element={session ? <EditExhibit isAdmin={isAdmin} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/exhibit/:id" 
              element={session ? <EditExhibit isAdmin={isAdmin} /> : <Navigate to="/" />} 
            />
            <Route path="/favorites" element={<Favorites />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
