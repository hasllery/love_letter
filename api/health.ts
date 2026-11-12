export const config = { runtime: 'edge' };

export default function handler(request: Request) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
}
