// Тонкий REST-клієнт. Vite проксіює /api на Node-сервер (:3000).

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* порожня відповідь */
  }
  if (!res.ok) {
    const message = data?.error || `Помилка сервера (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  register: (username, password) =>
    request('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  guest: () => request('/auth/guest', { method: 'POST', body: {} }),
  me: (token) => request('/auth/me', { token }),
  leaderboard: () => request('/leaderboard'),
};
