/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Allow markdown files to be imported
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  // Optimise images
  images: {
    domains: [],
  },
  // Expose content directory to the app at build time
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      use: "raw-loader",
    });
    return config;
  },
};

module.exports = nextConfig;
