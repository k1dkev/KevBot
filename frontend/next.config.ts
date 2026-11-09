import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Repository-level formatter dependencies must not expand this app's tracing root.
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["pino", "pino-pretty"],
  transpilePackages: ["@kevbot/api-client"],
  reactStrictMode: false,
};

export default nextConfig;
