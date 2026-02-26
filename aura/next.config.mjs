/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.imgur.com',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com', // O Imgur usa muito esse subdomínio para os links diretos (.png)
      }
    ],
  },
};

export default nextConfig;
