import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const uiSrc = path.resolve(__dirname, "../../packages/ui/src");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui"],
  turbopack: {
    resolveAlias: {
      "~/components/ui": path.join(uiSrc, "components"),
      "~": uiSrc,
    },
  },
  webpack(config) {
    config.resolve.alias["~/components/ui"] = path.join(uiSrc, "components");
    config.resolve.alias["~"] = uiSrc;
    return config;
  },
};

export default nextConfig;
