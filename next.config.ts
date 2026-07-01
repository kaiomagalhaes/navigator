import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical is CommonJS and pulls in Node-only deps; require it at runtime
  // instead of bundling it for the server.
  serverExternalPackages: ["node-ical"],
};

export default nextConfig;
