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
    sessionId: string;
  } | null>(null);

  // Generate unique session ID
  const generateSessionId = () => {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('xtream_auth');
    if (saved) {
      setAuth(JSON.parse(saved));
    }
  }, []);

  // Heartbeat - send every 2 minutes to keep session alive
  useEffect(() => {
    if (!auth) return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/session/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: auth.sessionId })
        });
      } catch (err) {
        console.error('Heartbeat error:', err);
      }
    };

    // Send immediately and then every 2 minutes
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [auth]);

  const handleLogin = async (server: Server, user: string, pass: string) => {
    const sessionId = generateSessionId();
    const authData = { server, user, pass, sessionId };
    
    // Create session on server
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          user,
          serverName: server.name,
          serverUrl: server.url
        })
      });
    } catch (err) {
      console.error('Error creating session:', err);
    }
    
    setAuth(authData);
    localStorage.setItem('xtream_auth', JSON.stringify(authData));
  };

  const handleLogout = async () => {
    if (auth?.sessionId) {
      try {
        await fetch(`/api/session/${auth.sessionId}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Error ending session:', err);
      }
    }
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
