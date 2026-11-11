import { createCourtServer } from './server';
const server = createCourtServer({
  origins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
});
const port = await server.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? '0.0.0.0',
);
console.log(`Crimson Court server listening on http://localhost:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
