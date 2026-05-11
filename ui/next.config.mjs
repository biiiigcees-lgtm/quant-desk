

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9191';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/god-tier/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
