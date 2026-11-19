import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Prevents double-mount lifecycle in development
  images: { unoptimized: true },
};

export default nextConfig;
