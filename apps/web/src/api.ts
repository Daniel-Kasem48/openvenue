export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ message: 'The server could not complete your request.' }));
    throw new Error(data.message);
  }
  return res.json();
}
export const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const localTime = (date: Date) =>
  new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
