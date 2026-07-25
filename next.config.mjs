/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The legacy static demo (index.html, /admin, /buyer, /seller, /assets) is kept
  // in the repo as design reference only; it is not part of the Next.js build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
