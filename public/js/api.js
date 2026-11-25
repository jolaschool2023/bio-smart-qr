/* Cliente API — BIOSMART QR */
'use strict';

async function apiReq(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(t('common.error_network'));
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuestas sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/me' && path !== '/api/auth/admin-unlock') {
      try { window.dispatchEvent(new Event('bs:unauthorized')); } catch { /* sin ventana */ }
    }
    const err = new Error((data && data.message) || t('common.error_generic'));
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }
  return data;
}

const API = {
  get: (p) => apiReq(p),
  post: (p, body) => apiReq(p, { method: 'POST', body }),
  put: (p, body) => apiReq(p, { method: 'PUT', body }),
  patch: (p, body) => apiReq(p, { method: 'PATCH', body }),
  del: (p) => apiReq(p, { method: 'DELETE' }),
  me: () => apiReq('/api/auth/me'),
  unlock: (password) => apiReq('/api/auth/admin-unlock', { method: 'POST', body: { password } }),
  login: (email, password) => apiReq('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (email, password, password2) => apiReq('/api/auth/register', { method: 'POST', body: { email, password, password2 } }),
  logout: () => apiReq('/api/auth/logout', { method: 'POST', body: {} }),
};

/* Comprime una imagen del dispositivo (celular, tableta o PC) a JPEG/WebP
   para reducir su tamaño antes de enviarla. Devuelve dataURL. */
function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error(t('form.photo.invalid')));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error(t('form.photo.toobig')));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const outType = file.type === 'image/png' && file.size < 700 * 1024 ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(outType, quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('form.photo.invalid'))); };
    img.src = url;
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

window.API = API; window.compressImage = compressImage; window.uuid = uuid;
