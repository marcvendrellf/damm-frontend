import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Demo mode reads public/demo-data on the server as well, so the server
  // functions need those files next to them.
  outputFileTracingIncludes: {
    "/**": ["./public/demo-data/**/*"],
  },
};

export default nextConfig;
