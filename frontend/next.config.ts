import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Use current working directory so Turbopack doesn't infer repo root (multiple lockfiles)
  turbopack: { root: process.cwd() },
};

export default nextConfig;
