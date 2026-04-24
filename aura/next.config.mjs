/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '0.1.0',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.imgur.com',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com', // O Imgur usa muito esse subdomínio para os links diretos (.png)
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      }
    ],
  },
};

export default nextConfig;
