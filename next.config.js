/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Allow larger file uploads
    },
    // pdf.js loads its worker and optional canvas at runtime; let Node require it
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  // No CORS headers: the API is only called by Necrolink's own pages. Allowing
  // every origin would let any website use this server to fetch URLs and spend
  // the Internet Archive and AI budgets.
};

module.exports = nextConfig;
