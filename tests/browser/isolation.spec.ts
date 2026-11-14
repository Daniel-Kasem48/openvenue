import { expect, test } from './fixtures';

test('login limit is enforced within a test', async ({ request }) => {
  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await request.post('/api/auth/login', {
      data: { password: 'integration-password-123' },
    });
    expect(response.status()).toBe(attempt < 10 ? 200 : 429);
  }
});

test('login limit does not leak into the next test', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { password: 'integration-password-123' },
  });
  expect(response.status()).toBe(200);
});
