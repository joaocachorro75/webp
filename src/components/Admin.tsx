import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Server as ServerIcon, Shield, Users, Clock, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { Server } from '../types';

interface OnlineUser {
  id: string;
  user: string;
  serverName: string;
  loginTime: number;
  lastActivity: number;
  duration: number;
  ipAddress?: string;
}

export default function Admin() {
  const [servers, setServers] = useState<Server[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const savedPass = localStorage.getItem('admin_password');
    if (savedPass) {
      setAdminPass(savedPass);
      setIsAuthenticated(true);
    }
    fetchServers();
  }, []);

  // Auto-refresh online users every 10 seconds
  useEffect(() => {
    if (isAuthenticated) {
      fetchOnlineUsers();
      const interval = setInterval(fetchOnlineUsers, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, adminPass]);

  const fetchServers = async () => {
    const res = await fetch('/api/servers');
    const data = await res.json();
    setServers(data);
  };

  const fetchOnlineUsers = async () => {
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'x-admin-password': adminPass }
      });
      if (res.ok) {
        const data = await res.json();
        setOnlineUsers(data);
      }
    } catch (err) {
      console.error('Error fetching online users:', err);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('admin_password', adminPass);
    setIsAuthenticated(true);
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;

    setLoading(true);
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPass
        },
        body: JSON.stringify({ name, url }),
      });
      if (res.ok) {
        setName('');
        setUrl('');
        fetchServers();
      } else if (res.status === 401) {
        alert('Senha de admin incorreta.');
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteServer = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este servidor?')) return;
    
    try {
      const res = await fetch(`/api/servers/${id}`, { 
        method: 'DELETE',
        headers: { 'x-admin-password': adminPass }
      });
      if (res.ok) {
        fetchServers();
      } else if (res.status === 401) {
        alert('Senha de admin incorreta.');
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel p-8 w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="text-brand-accent w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Login</h1>
          </div>
        <form id="admin-login-form" onSubmit={handleLogin} className="space-y-4">
          <input 
            id="admin-password-input"
            type="password" 
            value={adminPass} 
            onChange={(e) => setAdminPass(e.target.value)}
            placeholder="Senha do Super Admin"
            className="input-field"
            required
          />
          <button id="admin-login-submit" type="submit" className="btn-primary w-full">Acessar Painel</button>
        </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="text-brand-accent w-8 h-8" />
          <h1 className="text-2xl md:text-3xl font-bold">Super Admin</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-white/60">{onlineUsers.length} online</span>
        </div>
      </div>

      {/* Online Users Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-4 md:p-6 mb-8"
      >
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-brand-accent" />
          <h2 className="text-xl font-semibold">Usuários Online</h2>
          <span className="ml-auto text-sm text-white/40">Atualiza a cada 10s</span>
        </div>
        
        {onlineUsers.length === 0 ? (
          <p className="text-white/40 italic text-center py-4">Nenhum usuário online no momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/40">
                  <th className="pb-3 pr-4">Usuário</th>
                  <th className="pb-3 pr-4">Servidor</th>
                  <th className="pb-3 pr-4 hidden md:table-cell">IP</th>
                  <th className="pb-3 pr-4">Tempo</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {onlineUsers.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 pr-4 font-medium">{user.user}</td>
                    <td className="py-3 pr-4 text-white/60">{user.serverName}</td>
                    <td className="py-3 pr-4 text-white/40 hidden md:table-cell">{user.ipAddress || '-'}</td>
                    <td className="py-3 pr-4 text-white/60">{formatDuration(user.duration)}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-green-500">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Ativo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Add Server Form */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel p-4 md:p-6 mb-8"
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" /> Adicionar Novo Servidor
        </h2>
        <form id="add-server-form" onSubmit={handleAddServer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/60 mb-1">Nome do Servidor</label>
            <input 
              id="server-name-input"
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Servidor VIP"
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">URL (DNS)</label>
            <input 
              id="server-url-input"
              type="url" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://dns.com:8080"
              className="input-field"
              required
            />
          </div>
          <div className="md:col-span-2">
            <button 
              id="add-server-submit"
              type="submit" 
              disabled={loading}
              className="btn-primary w-full md:w-auto"
            >
              {loading ? 'Adicionando...' : 'Adicionar Servidor'}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Servers List */}
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold mb-2">Servidores Configurados</h2>
        {servers.length === 0 ? (
          <p className="text-white/40 italic">Nenhum servidor adicionado ainda.</p>
        ) : (
          servers.map((server) => (
            <motion.div 
              key={server.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-panel p-4 flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <ServerIcon className="w-5 h-5 text-brand-accent" />
                </div>
                <div>
                  <h3 className="font-medium">{server.name}</h3>
                  <p className="text-sm text-white/40">{server.url}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteServer(server.id)}
                className="p-2 text-white/20 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </motion.div>
          ))
        )}
      </div>

      <footer className="mt-8 text-center text-white/30 text-sm">
        <a href="https://to-ligado.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand-accent transition-colors">
          Desenvolvido por To-Ligado.com
        </a>
      </footer>
    </div>
  );
}
