import worker, { type Env } from '../../apps/server/src/hosted';

export default async (req: Request) => {
  return worker.fetch(req, {} as Env);
};

export const config = {
  path: ['/api/court', '/api/health', '/health'],
};
