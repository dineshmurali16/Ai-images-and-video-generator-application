import { config } from '../config.js'

const providerError = (message, status = 502) => {
  const error = new Error(message)
  error.status = status
  return error
}

const request = async (path, options = {}) => {
  if (!config.runway.apiKey) {
    throw providerError('Runway is not configured. Add RUNWAY_API_KEY to the server environment.', 503)
  }

  const response = await fetch(`${config.runway.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.runway.apiKey}`,
      'X-Runway-Version': config.runway.version,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = body?.error || body?.message || `Runway returned HTTP ${response.status}.`
    const status = response.status === 429 ? 429 : 502
    throw providerError(detail, status)
  }
  return body
}

const pixelRatios = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
}

export class RunwayProvider {
  name = 'runway'

  async create({ prompt, negativePrompt, aspectRatio, duration, resolution, imageDataUrl }) {
    const model = config.runway.model
    const payload = {
      model,
      promptText: [prompt, negativePrompt ? `Avoid: ${negativePrompt}` : ''].filter(Boolean).join('\n'),
      ratio: model === 'hailuo3' ? (aspectRatio || '16:9') : (pixelRatios[aspectRatio] || pixelRatios['16:9']),
      duration: Number(duration),
    }

    if (model === 'hailuo3') payload.resolution = resolution === '2k' ? '2k' : '768p'

    const endpoint = imageDataUrl ? '/v1/image_to_video' : '/v1/text_to_video'
    if (imageDataUrl) payload.promptImage = imageDataUrl

    const result = await request(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!result.id) throw providerError('Runway did not return a task id.')
    return { taskId: result.id }
  }

  async getStatus(taskId) {
    const result = await request(`/v1/tasks/${encodeURIComponent(taskId)}`)
    const status = String(result.status || '').toLowerCase()
    if (status === 'succeeded') {
      return { status: 'completed', outputUrl: result.output?.[0] || result.output?.video || null }
    }
    if (['failed', 'cancelled'].includes(status)) {
      return { status: 'failed', error: result.failure || result.failureCode || 'Runway could not complete this generation.' }
    }
    return { status: 'processing' }
  }
}

export const videoProvider = new RunwayProvider()
