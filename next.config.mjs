/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Allow up to 8 MB per submission — 5 photos at ~1 MB each + headroom.
      // Photos are client-side compressed to ~500 KB but unprocessed heic can be larger.
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
