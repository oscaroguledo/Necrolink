/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf.js loads its worker at runtime; let Node require it instead of bundling
  serverExternalPackages: ['pdfjs-dist'],
  // No CORS headers: the API is only called by Necrolink's own pages. Allowing
  // every origin would let any website use this server to fetch URLs and spend
  // the Internet Archive and AI budgets.
};

module.exports = nextConfig;
