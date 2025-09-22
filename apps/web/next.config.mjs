/** @type {import('next').NextConfig} */
const backendUrl = process.env.NEXT_PUBLIC_API_URL;

const nextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  compress: true,
  images: {
    formats: ["image/webp", "image/avif"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@workspace/ui"],
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/auth/:path*',
          destination: `${backendUrl}/api/auth/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
