import axios from 'axios';

export const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || ''}/api`, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // The server gives the AI up to 45 s, so don't give up on it sooner here.
  if (config.url?.startsWith('/ai/')) config.timeout = 50000;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Human-readable message from an API error, including the first field error.
export function errorMessage(err) {
  const data = err?.response?.data;
  if (data?.errors?.length) return `${data.message}: ${data.errors.map((e) => (e.field ? `${e.field} ${e.message}` : e.message)).join(', ')}`;
  return data?.message || err?.message || 'Something went wrong';
}

export async function downloadFile(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: filename });
  a.click();
  URL.revokeObjectURL(href);
}
