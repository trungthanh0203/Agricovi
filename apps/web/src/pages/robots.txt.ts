import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => new Response(
  `User-agent: *\nAllow: /\nDisallow: /bao-gia/\nDisallow: /tim-kiem/\n\nSitemap: ${url.origin}/sitemap.xml\n`,
  { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' } },
);
