let csrfToken = '';
export async function request(path, options = {}) {
  const method = options.method || 'GET';
  if (!['GET', 'HEAD'].includes(method) && !csrfToken) await request('/auth/csrf');
  const response = await fetch('/api' + path, {
    credentials: 'same-origin', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (data?.csrfToken) csrfToken = data.csrfToken;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    const error = new Error(data?.message || 'Could not connect. Please try again.');
    error.fields = data?.errors; error.status = response.status; throw error;
  }
  return data;
}
export const resetCsrf = () => { csrfToken = ''; };
