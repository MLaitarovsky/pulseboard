/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    // API_URL is a server-side-only var for Docker/internal network (e.g. http://server:3001)
    // Falls back to NEXT_PUBLIC_SOCKET_URL (Vercel) or localhost (dev)
    const apiUrl =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
