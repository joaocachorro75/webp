import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Server as ServerIcon, User, Lock, Play, AlertCircle, Loader2 } from 'lucide-react';
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
  const [testingServers, setTestingServers] = useState(false);
  const [testingServerName, setTestingServerName] = useState('');

  useEffect(() => {
    fetch('/api/servers')
      .then(res => res.json())
      .then(data => {
        setServers(data);
        // Don't auto-select - we'll test all servers
      });
  }, []);

  // Test a single server with credentials
  const testServer = async (server: Server, user: string, pass: string): Promise<boolean> => {
    try {
      const params = new URLSearchParams({
        targetUrl: `${server.url}/player_api.php`,
        username: user,
        password: pass
      });
      
      const res = await fetch(`/api/proxy?${params.toString()}`, {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!res.ok) return false;
      
      const data = await res.json();
      return data.user_info && data.user_info.auth === 1;
    } catch {
      return false;
    }
  };

  // Auto-detect correct server
  const autoDetectServer = async (user: string, pass: string): Promise<Server | null> => {
    if (servers.length === 0) return null;
    
    setTestingServers(true);
    setError('');
    
    for (const server of servers) {
      setTestingServerName(server.name);
      console.log(`[AutoDetect] Testing server: ${server.name}`);
      
      const isValid = await testServer(server, user, pass);
      
      if (isValid) {
        console.log(`[AutoDetect] Found valid server: ${server.name}`);
        setTestingServers(false);
        setTestingServerName('');
        return server;
      }
    }
    
    setTestingServers(false);
    setTestingServerName('');
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Por favor, preencha usuário e senha.');
      return;
    }

    setLoading(true);

    try {
      // Auto-detect server
      const validServer = await autoDetectServer(username, password);
      
      if (validServer) {
        onLogin(validServer, username, password);
      } else {
        if (servers.length === 0) {
          setError('Nenhum servidor configurado. Contate o administrador.');
        } else {
          setError('Usuário ou senha incorretos, ou servidor indisponível.');
        }
      }
    } catch (err) {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(circle_at_50%_30%,#3a1510_0%,transparent_60%)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-brand-accent mb-4 shadow-[0_0_30px_rgba(255,78,0,0.3)]">
            <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-current" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter">WebTV</h1>
          <p className="text-white/40 mt-2 text-sm md:text-base">Acesse sua lista de canais e filmes</p>
        </div>

        <form id="login-form" onSubmit={handleSubmit} className="glass-panel p-6 md:p-8 space-y-4 md:space-y-6">
          {error && (
            <motion.div 
              id="login-error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl flex items-center gap-2 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Auto-detect status */}
          {testingServers && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-brand-accent/10 border border-brand-accent/20 text-brand-accent p-3 rounded-xl flex items-center gap-3 text-sm"
            >
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              <span>Testando servidor: <strong>{testingServerName}</strong></span>
            </motion.div>
          )}

          <div className="space-y-4">
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
                  autoComplete="username"
                  disabled={loading || testingServers}
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
                  autoComplete="current-password"
                  disabled={loading || testingServers}
                />
              </div>
            </div>
          </div>

          <button 
            id="login-submit-button"
            type="submit" 
            disabled={loading || testingServers}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading || testingServers ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {testingServers ? 'Detectando servidor...' : 'Entrando...'}
              </>
            ) : (
              <>Entrar Agora</>
            )}
          </button>

          {/* Info about auto-detection */}
          {servers.length > 0 && (
            <p className="text-center text-white/30 text-xs">
              O servidor será detectado automaticamente
            </p>
          )}
        </form>

        <p className="text-center mt-6 text-white/20 text-xs md:text-sm">
          Acesso restrito para assinantes autorizados.
        </p>

        <footer className="text-center mt-4 text-white/30 text-xs">
          <a href="https://to-ligado.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand-accent transition-colors">
            Desenvolvido por To-Ligado.com
          </a>
        </footer>
      </motion.div>
    </div>
  );
}
