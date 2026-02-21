import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Server as ServerIcon, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { Server } from '../types';

export default function Admin() {
  const [servers, setServers] = useState<Server[]>([]);
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

  const fetchServers = async () => {
    const res = await fetch('/api/servers');
    const data = await res.json();
    setServers(data);
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
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="text-brand-accent w-8 h-8" />
        <h1 className="text-3xl font-bold">Super Admin</h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6 mb-8"
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
    </div>
  );
}
