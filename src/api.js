const getToken = () => localStorage.getItem('visionai_token')

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...options, headers })
  if (response.status === 204) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'Something went wrong.')
    error.status = response.status
    throw error
  }
  return body
}

export const api = {
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  signup: (data) => request('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/api/auth/me'),
  dashboard: () => request('/api/dashboard'),
  videos: () => request('/api/videos'),
  prompts: () => request('/api/prompts'),
  enhancePrompt: (prompt) => request('/api/prompts/enhance', { method: 'POST', body: JSON.stringify({ prompt }) }),
  createGeneration: (data) => {
    const form = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key !== 'image') form.append(key, String(value))
    })
    if (data.image) form.append('image', data.image)
    return request('/api/generations', { method: 'POST', body: form })
  },
  generation: (id) => request(`/api/generations/${id}`),
  removeVideo: (id) => request(`/api/videos/${id}`, { method: 'DELETE' }),
  shareVideo: (id) => request(`/api/videos/${id}/share`, { method: 'POST' }),
  file: async (path) => {
    const token = getToken()
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error('Unable to load the video file.')
    return response.blob()
  },
}

export const saveSession = (result) => {
  localStorage.setItem('visionai_token', result.token)
  localStorage.setItem('visionai_user', JSON.stringify(result.user))
}

export const clearSession = () => {
  localStorage.removeItem('visionai_token')
  localStorage.removeItem('visionai_user')
}
