import axios from 'axios';

export const TOKEN_KEY = 'talkat_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach the saved login token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;