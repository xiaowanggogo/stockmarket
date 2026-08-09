/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// 前后端分离：浏览器访问同源的 /api/*，由 Next 在 server 端反向代理到 FastAPI 后端。
// 这样前端无需关心后端地址，也天然规避浏览器跨域；后端地址可用 BACKEND_URL 覆盖。
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
    ];
  },
};

export default nextConfig;
