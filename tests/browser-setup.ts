import { createServer } from 'vite';

// Keep the test server in this process so Windows teardown closes it reliably.
export default async function setup() {
  const server = await createServer({
    server: { host: '127.0.0.1', port: 5199, strictPort: true },
  });
  await server.listen();
  return async () => {
    await server.close();
  };
}
