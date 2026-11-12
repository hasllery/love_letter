import worker, { type Env } from '../../apps/server/src/hosted';

export default async (req: Request) => {
  const url = new URL(req.url);
  // Ensure health check responds with 200 OK for either /health, /api/health, or GET requests
  if (
    url.pathname === '/health' ||
    url.pathname.endsWith('/health') ||
    (req.method === 'GET' && url.pathname.endsWith('/court'))
  ) {
    const origin = req.headers.get('origin');
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
  }

  return worker.fetch(req, {} as Env);
};

export const config = {
  path: ['/api/court', '/api/health', '/health', '/api/oracle'],
};
