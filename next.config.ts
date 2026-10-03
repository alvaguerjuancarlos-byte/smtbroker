import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // @smt/shared-realestate se publica como .ts fuente sin paso de build propio (mismo criterio
  // que el resto de este repo) -- Turbopack no transpila TS dentro de node_modules por default,
  // así que hay que decirle explícitamente que sí lo haga para este paquete.
  transpilePackages: ["@smt/shared-realestate"],
};

export default nextConfig;
