import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Use webpack for PWA support
  turbopack: {},

  // PWA will be configured separately
  // next-pwa doesn't support Turbopack yet
};

export default nextConfig;
