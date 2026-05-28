import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "apache-arrow",
    // Teams bot (Chat SDK) — keep native/dynamic-require deps out of the bundle.
    "pg",
    "chat",
    "@chat-adapter/teams",
    "@chat-adapter/state-pg",
  ],
};

export default nextConfig;
