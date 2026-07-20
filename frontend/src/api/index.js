import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
});

export default api;
