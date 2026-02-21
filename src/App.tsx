import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Player from './components/Player';
import Admin from './components/Admin';
import { Server } from './types';

export default function App() {
  const [auth, setAuth] = useState<{
    server: Server;
    user: string;
    pass: string;
  } | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('xtream_auth');
    if (saved) {
      setAuth(JSON.parse(saved));
    }
  }, []);

  const handleLogin = (server: Server, user: string, pass: string) => {
    const authData = { server, user, pass };
    setAuth(authData);
    localStorage.setItem('xtream_auth', JSON.stringify(authData));
  };

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem('xtream_auth');
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            auth ? (
              <Player 
                server={auth.server} 
                user={auth.user} 
                pass={auth.pass} 
                onLogout={handleLogout} 
              />
            ) : (
              <Login onLogin={handleLogin} />
            )
          } 
        />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
