import 'dotenv/config'

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberFromEnv(process.env.PORT, 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'local-development-secret-change-me',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: numberFromEnv(process.env.MAX_UPLOAD_MB, 10),
  runway: {
    apiKey: process.env.RUNWAY_API_KEY,
    baseUrl: process.env.RUNWAY_API_BASE_URL || 'https://api.dev.runwayml.com',
    version: process.env.RUNWAY_API_VERSION || '2024-11-06',
    model: process.env.RUNWAY_MODEL || 'hailuo3',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
}

export const isProduction = config.nodeEnv === 'production'
