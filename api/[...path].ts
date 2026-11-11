import worker, { type Env } from '../apps/server/src/hosted';

export const config = { runtime: 'edge' };

export default function handler(request: Request) {
  return worker.fetch(request, {} as Env);
}
