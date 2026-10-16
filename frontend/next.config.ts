import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Repository-level formatter dependencies must not expand this app's tracing root.
  outputFileTracingRoot: __dirname,
  reactStrictMode: false,
};

export default nextConfig;
