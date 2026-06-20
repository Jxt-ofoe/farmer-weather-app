export default function manifest() {
  return {
    name: 'AgriNotify',
    short_name: 'AgriNotify',
    description: 'Real-time weather alerts for your farm',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#15803d',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
