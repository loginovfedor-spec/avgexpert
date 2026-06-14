import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { SelfHostedEmbeddingProvider } from '../../src/modules/vector/providers/selfhosted.embedding';

test('SelfHostedEmbeddingProvider: custom HTTP batch + query', async () => {
  const dims = 4;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const embeddings = payload.texts.map((text: string, index: number) =>
        Array.from({ length: dims }, (_, i) => (text.length + index + i + 1) / 100)
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ embeddings }));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test HTTP server');
  }

  try {
    const provider = new SelfHostedEmbeddingProvider({
      model: 'bge-m3',
      dimensions: dims,
      apiUrl: `http://127.0.0.1:${address.port}/embed`,
      apiFormat: 'custom',
      queryPrefix: '',
    });

    const vectors = await provider.embed(['alpha', 'beta']);
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0].length, dims);

    const query = await provider.embedQuery('alpha');
    assert.equal(query.length, dims);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
});

test('SelfHostedEmbeddingProvider: TEI format', async () => {
  const dims = 4;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const inputs = Array.isArray(payload.inputs) ? payload.inputs : [payload.inputs];
      const embeddings = inputs.map((text: string, index: number) =>
        Array.from({ length: dims }, (_, i) => (text.length + index + i + 1) / 100)
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(embeddings));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test HTTP server');
  }

  try {
    const provider = new SelfHostedEmbeddingProvider({
      model: 'bge-m3',
      dimensions: dims,
      apiUrl: `http://127.0.0.1:${address.port}/embed`,
      apiFormat: 'tei',
      queryPrefix: '',
    });

    const vectors = await provider.embed(['alpha', 'beta']);
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0].length, dims);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
});
