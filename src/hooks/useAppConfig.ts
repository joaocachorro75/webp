import { useState, useEffect } from 'react';

export interface AppConfig {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>({
    appName: 'WebTV',
    logoUrl: null,
    faviconUrl: null
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
      
      // Update document title
      if (data.appName) {
        document.title = data.appName;
      }
      
      // Update favicon dynamically
      if (data.faviconUrl) {
        const existingFavicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (existingFavicon) {
          existingFavicon.href = data.faviconUrl;
        } else {
          const newFavicon = document.createElement('link');
          newFavicon.rel = 'icon';
          newFavicon.href = data.faviconUrl;
          document.head.appendChild(newFavicon);
        }
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  return config;
}
