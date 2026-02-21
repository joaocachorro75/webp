import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Server as ServerIcon, User, Lock, Play, AlertCircle } from 'lucide-react';
import { Server } from '../types';

interface LoginProps {
  onLogin: (server: Server, user: string, pass: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/servers')
      .then(res => res.json())
      .then(data => {
        setServers(data);
        if (data.length > 0) setSelectedServerId(data[0].id.toString());
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const server = servers.find(s => s.id.toString() === selectedServerId);
    if (!server) {
      setError('Por favor, selecione um servidor.');
      return;
    }

    setLoading(true);
    try {
      // Test login via proxy
      const params = new URLSearchParams({
        targetUrl: `${server.url}/player_api.php`,
        username,
        password
      });
      
      const res = await fetch(`/api/proxy?${params.toString()}`);
      const data = await res.json();

      if (data.user_info && data.user_info.auth === 1) {
        onLogin(server, username, password);
      } else {
        setError('Usuário ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_50%_30%,#3a1510_0%,transparent_60%)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-accent mb-4 shadow-[0_0_30px_rgba(255,78,0,0.3)]">
            <Play className="w-10 h-10 text-white fill-current" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter">XTREAM PLAYER</h1>
          <p className="text-white/40 mt-2">Acesse sua lista de canais e filmes</p>
        </div>

        <form id="login-form" onSubmit={handleSubmit} className="glass-panel p-8 space-y-6">
          {error && (
            <motion.div 
              id="login-error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl flex items-center gap-2 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">Servidor</label>
              <div className="relative">
                <ServerIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <select 
                  id="server-select"
                  value={selectedServerId}
                  onChange={(e) => setSelectedServerId(e.target.value)}
                  className="input-field pl-12 appearance-none cursor-pointer"
                  required
                >
                  <option value="" disabled>Selecione um servidor</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id.toString()}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">Usuário</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input 
                  id="username-input"
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Seu usuário"
                  className="input-field pl-12"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input 
                  id="password-input"
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="input-field pl-12"
                  required
                />
              </div>
            </div>
          </div>

          <button 
            id="login-submit-button"
            type="submit" 
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Entrar Agora</>
            )}
          </button>
        </form>

        <p className="text-center mt-8 text-white/20 text-sm">
          Acesso restrito para assinantes autorizados.
        </p>
      </motion.div>
    </div>
  );
}
