/** @type {import('next').NextConfig} */

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
};

export default nextConfig;
