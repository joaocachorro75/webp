import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tv, Film, Clapperboard, LogOut, Search, 
  ChevronRight, Play, Info, X, Menu, AlertTriangle
} from 'lucide-react';
import Hls from 'hls.js';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'mux.js';
import { Server, Category, Stream, SeriesInfo, Episode } from '../types';

interface PlayerProps {
  server: Server;
  user: string;
  pass: string;
  onLogout: () => void;
}

export default function Player({ server, user, pass, onLogout }: PlayerProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'movie' | 'series'>('live');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [selectedSeriesInfo, setSelectedSeriesInfo] = useState<SeriesInfo | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  
  const videoNode = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    fetchCategories();
  }, [activeTab]);

  useEffect(() => {
    if (selectedCategory) {
      fetchStreams();
    }
  }, [selectedCategory]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      destroyPlayer();
    };
  }, []);

  const destroyPlayer = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
  };

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const action = activeTab === 'live' ? 'get_live_categories' : 
                     activeTab === 'movie' ? 'get_vod_categories' : 'get_series_categories';
      
      const params = new URLSearchParams({
        targetUrl: `${server.url}/player_api.php`,
        username: user,
        password: pass,
        action
      });
      
      const res = await fetch(`/api/proxy?${params.toString()}`);
      const data = await res.json();
      const categoriesList = Array.isArray(data) ? data : [];
      setCategories(categoriesList);
      if (categoriesList.length > 0) {
        setSelectedCategory(categoriesList[0].category_id);
      } else {
        setSelectedCategory('');
        setStreams([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStreams = async () => {
    if (!selectedCategory) return;
    setLoading(true);
    try {
      const action = activeTab === 'live' ? 'get_live_streams' : 
                     activeTab === 'movie' ? 'get_vod_streams' : 'get_series';
      
      const params = new URLSearchParams({
        targetUrl: `${server.url}/player_api.php`,
        username: user,
        password: pass,
        action,
        category_id: selectedCategory
      });
      
      const res = await fetch(`/api/proxy?${params.toString()}`);
      const data = await res.json();
      
      // Xtream sometimes returns an object instead of array for series
      let streamsList = Array.isArray(data) ? data : [];
      if (!Array.isArray(data) && typeof data === 'object' && data !== null) {
        streamsList = Object.values(data);
      }
      
      setStreams(streamsList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeriesInfo = async (seriesId: number) => {
    setInfoLoading(true);
    try {
      const params = new URLSearchParams({
        targetUrl: `${server.url}/player_api.php`,
        username: user,
        password: pass,
        action: 'get_series_info',
        series_id: seriesId.toString()
      });
      
      const res = await fetch(`/api/proxy?${params.toString()}`);
      const data = await res.json();
      
      if (data && data.episodes) {
        setSelectedSeriesInfo({
          seasons: data.episodes,
          info: data.info
        });
        const seasons = Object.keys(data.episodes);
        if (seasons.length > 0) setSelectedSeason(seasons[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInfoLoading(false);
    }
  };

  const handleStreamClick = (stream: Stream) => {
    if (activeTab === 'series') {
      if (stream.stream_id) {
        fetchSeriesInfo(stream.stream_id);
      } else if ((stream as any).series_id) {
        fetchSeriesInfo((stream as any).series_id);
      }
    } else {
      playStream(stream);
    }
  };

  const playStream = (stream: any, isEpisode = false) => {
    // If it's an episode, we use its ID and extension
    const streamId = isEpisode ? stream.id : (stream.stream_id || stream.series_id);
    const streamName = isEpisode ? stream.title : stream.name;
    
    setSelectedStream({ ...stream, name: streamName, stream_id: streamId } as any);
    setPlayerError(null);
    destroyPlayer();

    let streamUrl = '';
    let tryHlsFirst = false;

    if (activeTab === 'live') {
      streamUrl = `${server.url}/live/${user}/${pass}/${streamId}.m3u8`;
      tryHlsFirst = true;
    } else if (activeTab === 'movie') {
      // Try m3u8 first (many VOD servers use HLS), fallback to original extension
      const ext = stream.container_extension || 'mp4';
      streamUrl = `${server.url}/movie/${user}/${pass}/${streamId}.${ext}`;
      tryHlsFirst = ext === 'm3u8';
    } else if (activeTab === 'series' || isEpisode) {
      const ext = stream.container_extension || 'mp4';
      streamUrl = `${server.url}/series/${user}/${pass}/${streamId}.${ext}`;
      tryHlsFirst = ext === 'm3u8';
    }

    console.log(`[Player] Playing: ${streamUrl}`);

    const proxiedUrl = `/api/stream?url=${encodeURIComponent(streamUrl)}`;

    setTimeout(() => {
      if (!videoNode.current) return;
      
      const video = videoNode.current;
      video.muted = true;

      // Always try HLS first for live, and also for VOD if extension is m3u8
      if (tryHlsFirst && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hlsRef.current = hls;
        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[Player] HLS manifest parsed');
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error("[Player] HLS Fatal Error:", data);
            // For live, fallback to .ts
            if (activeTab === 'live') {
              const tsUrl = `${server.url}/live/${user}/${pass}/${streamId}.ts`;
              const proxiedTs = `/api/stream?url=${encodeURIComponent(tsUrl)}`;
              setupVideoJS(proxiedTs, 'video/mp2t');
            } else {
              // For VOD, try VideoJS with the original URL
              setupVideoJS(proxiedUrl, 'video/mp4');
            }
          }
        });
      } else if (tryHlsFirst && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = proxiedUrl;
        video.play().catch(() => {});
      } else {
        // Use VideoJS for VOD (handles MP4, MKV, etc.)
        setupVideoJS(proxiedUrl, 'video/mp4');
      }
    }, 200);
  };

  const setupVideoJS = (url: string, type: string) => {
    if (!videoNode.current) return;
    
    const parent = videoNode.current.parentElement;
    if (parent) {
      parent.innerHTML = '';
      const newVideo = document.createElement('video');
      newVideo.id = 'video-js-player';
      newVideo.className = 'video-js vjs-big-play-centered vjs-theme-city w-full h-full';
      parent.appendChild(newVideo);
      
      playerRef.current = videojs(newVideo, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        muted: true,
        sources: [{ src: url, type }]
      });

      playerRef.current.on('error', () => {
        setPlayerError("Este formato não é suportado pelo seu navegador.");
      });
    }
  };

  const filteredStreams = streams.filter(s => 
    s && s.name && s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div id="player-container" className="flex h-screen overflow-hidden bg-brand-bg">
      {/* Sidebar */}
      <motion.aside 
        id="sidebar"
        animate={{ width: sidebarOpen ? 280 : 80 }}
        className="glass-panel rounded-none border-y-0 border-l-0 flex flex-col z-20"
      >
        <div className="p-6 flex items-center justify-between">
          {sidebarOpen && <h1 id="app-logo" className="font-bold text-xl tracking-tighter text-brand-accent">WebTV</h1>}
          <button id="toggle-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav id="sidebar-nav" className="flex-1 px-4 space-y-2">
          {[
            { id: 'live', icon: Tv, label: 'Canais ao Vivo' },
            { id: 'movie', icon: Film, label: 'Filmes' },
            { id: 'series', icon: Clapperboard, label: 'Séries' },
          ].map((tab) => (
            <button
              id={`tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${
                activeTab === tab.id ? 'bg-brand-accent text-white' : 'hover:bg-white/5 text-white/60'
              }`}
            >
              <tab.icon className="w-6 h-6 shrink-0" />
              {sidebarOpen && <span className="font-medium">{tab.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            id="logout-button"
            onClick={onLogout}
            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-red-500/10 text-red-500 transition-all"
          >
            <LogOut className="w-6 h-6 shrink-0" />
            {sidebarOpen && <span className="font-medium">Sair</span>}
          </button>
        </div>

        <footer className="p-4 text-center">
          {sidebarOpen && (
            <a href="https://to-ligado.com" target="_blank" rel="noopener noreferrer" className="text-xs text-white/30 hover:text-brand-accent transition-colors">
              Desenvolvido por To-Ligado.com
            </a>
          )}
        </footer>
      </motion.aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar */}
        <header id="top-bar" className="h-20 border-b border-white/10 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
              <input 
                id="search-input"
                type="text" 
                placeholder="Pesquisar..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-12 py-2"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <div className="text-right">
              <p id="user-display-name" className="text-sm font-medium">{user}</p>
              <p id="server-display-name" className="text-xs text-white/40">{server.name}</p>
            </div>
            <div id="user-avatar" className="w-10 h-10 rounded-full bg-brand-accent flex items-center justify-center font-bold">
              {user[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div id="content-area" className="flex-1 flex overflow-hidden">
          {/* Categories List */}
          <div id="categories-sidebar" className="w-64 border-r border-white/10 overflow-y-auto p-4 shrink-0">
            <h3 className="text-xs font-bold text-white/20 uppercase tracking-widest mb-4 px-2">Categorias</h3>
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  id={`category-${cat.category_id}`}
                  key={cat.category_id}
                  onClick={() => setSelectedCategory(cat.category_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCategory === cat.category_id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>
          </div>

          {/* Streams Grid */}
          <div id="streams-grid-container" className="flex-1 overflow-y-auto p-8">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div id="loading-spinner" className="w-12 h-12 border-4 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
              </div>
            ) : (
              <div id="streams-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                {filteredStreams.map((stream) => (
                  <motion.div
                    id={`stream-card-${stream.stream_id || stream.series_id}`}
                    key={stream.stream_id || stream.series_id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -5 }}
                    onClick={() => handleStreamClick(stream)}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-[2/3] rounded-2xl overflow-hidden relative mb-3 bg-white/5 border border-white/10 group-hover:border-brand-accent/50 transition-colors">
                      {(stream.stream_icon || (stream as any).cover) ? (
                        <img 
                          id={`stream-icon-${stream.stream_id || stream.series_id}`}
                          src={stream.stream_icon || (stream as any).cover} 
                          alt={stream.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/iptv/200/300';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tv className="w-12 h-12 text-white/10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-brand-accent flex items-center justify-center">
                          <Play className="w-6 h-6 fill-current" />
                        </div>
                      </div>
                    </div>
                    <h4 className="font-medium text-sm line-clamp-2 group-hover:text-brand-accent transition-colors">{stream.name}</h4>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Series Info Modal */}
        <AnimatePresence>
          {infoLoading && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-12 h-12 border-4 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
            </div>
          )}
          {selectedSeriesInfo && (
            <motion.div 
              id="series-info-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            >
              <div className="w-full max-w-5xl glass-panel max-h-[90vh] overflow-hidden flex flex-col relative">
                <button 
                  onClick={() => setSelectedSeriesInfo(null)}
                  className="absolute top-4 right-4 z-10 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="flex flex-col md:flex-row h-full overflow-hidden">
                  {/* Series Poster & Info */}
                  <div className="w-full md:w-1/3 p-8 border-r border-white/10 overflow-y-auto">
                    <img 
                      src={selectedSeriesInfo.info.cover} 
                      alt={selectedSeriesInfo.info.name}
                      className="w-full aspect-[2/3] object-cover rounded-2xl shadow-2xl mb-6"
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/series/300/450'}
                    />
                    <h2 className="text-2xl font-bold mb-2">{selectedSeriesInfo.info.name}</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="px-2 py-1 bg-brand-accent/20 text-brand-accent text-xs font-bold rounded uppercase">
                        {selectedSeriesInfo.info.rating}
                      </span>
                      <span className="px-2 py-1 bg-white/5 text-white/60 text-xs font-bold rounded uppercase">
                        {selectedSeriesInfo.info.genre}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 leading-relaxed mb-6">
                      {selectedSeriesInfo.info.plot}
                    </p>
                    <div className="space-y-2 text-xs">
                      <p><span className="text-white/40">Elenco:</span> {selectedSeriesInfo.info.cast}</p>
                      <p><span className="text-white/40">Diretor:</span> {selectedSeriesInfo.info.director}</p>
                    </div>
                  </div>

                  {/* Seasons & Episodes */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-8 border-b border-white/10">
                      <h3 className="text-lg font-bold mb-4">Temporadas</h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {Object.keys(selectedSeriesInfo.seasons).map(seasonNum => (
                          <button
                            key={seasonNum}
                            onClick={() => setSelectedSeason(seasonNum)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                              selectedSeason === seasonNum ? 'bg-brand-accent text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            Temporada {seasonNum}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-4">
                      {selectedSeriesInfo.seasons[selectedSeason]?.map((episode) => (
                        <div 
                          key={episode.id}
                          onClick={() => playStream(episode, true)}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 cursor-pointer group transition-all"
                        >
                          <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center group-hover:bg-brand-accent transition-all">
                            <Play className="w-5 h-5 text-brand-accent group-hover:text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Episódio {episode.episode_num}: {episode.title}</p>
                            <p className="text-xs text-white/40 line-clamp-1">{episode.info.plot}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Player Modal */}
        <AnimatePresence>
          {selectedStream && (
            <motion.div 
              id="player-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 md:p-12"
            >
              <div id="player-modal-content" className="w-full max-w-6xl aspect-video glass-panel overflow-hidden relative">
                <button 
                  id="close-player-button"
                  onClick={() => {
                    destroyPlayer();
                    setSelectedStream(null);
                  }}
                  className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                
                <div id="video-wrapper" className="w-full h-full flex items-center justify-center bg-black">
                  {playerError ? (
                    <div id="player-error-display" className="text-center p-8">
                      <AlertTriangle className="w-16 h-16 text-brand-accent mx-auto mb-4" />
                      <p className="text-xl font-bold mb-2">{playerError}</p>
                      <p className="text-white/40">Tente outro canal ou verifique sua conexão.</p>
                    </div>
                  ) : (
                    <video 
                      id="main-video-element"
                      ref={videoNode} 
                      className="w-full h-full" 
                      controls 
                      autoPlay
                    />
                  )}
                </div>
                
                <div id="player-info-overlay" className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                  <h2 id="playing-stream-name" className="text-2xl font-bold">{selectedStream.name}</h2>
                  <p id="playing-server-name" className="text-white/60">Assistindo agora no {server.name}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
