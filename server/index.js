import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import fs from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { prisma } from './prisma.js'
import { createToken, publicUser, requireAuth } from './auth.js'
import { generationSchema, loginSchema, signupSchema } from './validation.js'
import { startGenerationJob } from './jobs.js'
import { streamVideo } from './storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const uploadDir = path.resolve(rootDir, config.uploadDir)
await fs.mkdir(uploadDir, { recursive: true })

const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: config.clientUrl, credentials: false }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    callback(null, allowed.includes(file.mimetype))
  },
})

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

const videoSelect = {
  id: true,
  title: true,
  prompt: true,
  negativePrompt: true,
  style: true,
  aspectRatio: true,
  duration: true,
  resolution: true,
  mode: true,
  status: true,
  provider: true,
  errorMessage: true,
  createdAt: true,
  completedAt: true,
}

const serializeVideo = (video) => ({
  ...video,
  createdAt: video.createdAt?.toISOString(),
  completedAt: video.completedAt?.toISOString() || null,
  previewUrl: video.status === 'COMPLETED' ? `/api/videos/${video.id}/stream` : null,
  downloadUrl: video.status === 'COMPLETED' ? `/api/videos/${video.id}/download` : null,
})

app.get('/api/health', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ ok: true, provider: 'runway' })
}))

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  const { name, email, password } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' })

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name, email, passwordHash, credits: 40 } })
    await tx.usageCredit.create({ data: { userId: created.id, amount: 40, type: 'ALLOCATION', reason: 'Welcome credits' } })
    return created
  })
  res.status(201).json({ token: createToken(user.id), user: publicUser(user) })
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  const valid = user && await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Email or password is incorrect.' })
  res.json({ token: createToken(user.id), user: publicUser(user) })
}))

app.get('/api/auth/me', requireAuth, (_req, res) => res.json({ user: publicUser(_req.user) }))
app.post('/api/auth/logout', requireAuth, (_req, res) => res.status(204).end())

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const [totalVideos, completedVideos, processingVideos, recentVideos] = await Promise.all([
    prisma.video.count({ where: { userId: req.user.id } }),
    prisma.video.count({ where: { userId: req.user.id, status: 'COMPLETED' } }),
    prisma.video.count({ where: { userId: req.user.id, status: { in: ['QUEUED', 'PROCESSING'] } } }),
    prisma.video.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 4, select: videoSelect }),
  ])
  res.json({
    stats: { totalVideos, completedVideos, processingVideos, credits: req.user.credits },
    recentVideos: recentVideos.map(serializeVideo),
  })
}))

app.get('/api/videos', requireAuth, asyncRoute(async (req, res) => {
  const status = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(req.query.status) ? req.query.status : undefined
  const videos = await prisma.video.findMany({
    where: { userId: req.user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: videoSelect,
  })
  res.json({ videos: videos.map(serializeVideo) })
}))

app.post('/api/generations', requireAuth, upload.single('image'), asyncRoute(async (req, res) => {
  const parsed = generationSchema.safeParse({ ...req.body, mode: req.file ? 'IMAGE_TO_VIDEO' : req.body.mode })
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  if (parsed.data.mode === 'IMAGE_TO_VIDEO' && !req.file) {
    return res.status(400).json({ error: 'Upload a JPG, PNG, or WebP image for image-to-video.' })
  }

  const creditCost = 1
  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({
        where: { id: req.user.id, credits: { gte: creditCost } },
        data: { credits: { decrement: creditCost } },
      })
      if (charged.count !== 1) {
        const error = new Error('You are out of credits. Upgrade your plan to keep creating.')
        error.status = 402
        throw error
      }

      const video = await tx.video.create({
        data: {
          userId: req.user.id,
          title: parsed.data.prompt.slice(0, 48),
          prompt: parsed.data.prompt,
          negativePrompt: parsed.data.negativePrompt || null,
          style: parsed.data.style,
          aspectRatio: parsed.data.aspectRatio,
          duration: parsed.data.duration,
          resolution: parsed.data.resolution,
          mode: parsed.data.mode,
          status: 'QUEUED',
        },
      })
      await tx.prompt.create({
        data: {
          userId: req.user.id,
          videoId: video.id,
          input: parsed.data.prompt,
          negativePrompt: parsed.data.negativePrompt || null,
          style: parsed.data.style,
          aspectRatio: parsed.data.aspectRatio,
          duration: parsed.data.duration,
          resolution: parsed.data.resolution,
        },
      })
      const job = await tx.generationJob.create({ data: { userId: req.user.id, videoId: video.id, status: 'QUEUED' } })
      return { video, job }
    })
  } catch (error) {
    if (error.status === 402) return res.status(402).json({ error: error.message })
    throw error
  }

  const imageDataUrl = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : undefined
  const providerInput = {
    prompt: `${parsed.data.prompt}. Visual direction: ${parsed.data.style} style.`,
    negativePrompt: parsed.data.negativePrompt,
    aspectRatio: parsed.data.aspectRatio,
    duration: parsed.data.duration,
    resolution: parsed.data.resolution,
  }
  startGenerationJob({ jobId: created.job.id, videoId: created.video.id, userId: req.user.id, input: providerInput, imageDataUrl })
  const refreshedUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { credits: true } })
  res.status(202).json({ video: serializeVideo(created.video), jobId: created.job.id, creditsRemaining: refreshedUser?.credits ?? 0 })
}))

app.get('/api/generations/:id', requireAuth, asyncRoute(async (req, res) => {
  const video = await prisma.video.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: videoSelect })
  if (!video) return res.status(404).json({ error: 'Generation not found.' })
  res.json({ video: serializeVideo(video) })
}))

app.post('/api/prompts/enhance', requireAuth, asyncRoute(async (req, res) => {
  const prompt = String(req.body.prompt || '').trim()
  if (prompt.length < 8) return res.status(400).json({ error: 'Add a little more detail before enhancing your prompt.' })
  if (!config.openai.apiKey) return res.status(503).json({ error: 'Prompt enhancement needs OPENAI_API_KEY on the server.' })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openai.model,
      input: `Rewrite this text-to-video idea as one vivid, production-ready prompt. Keep the subject and intent, then add camera movement, lighting, environment, motion, and visual detail. Return only the prompt.\n\nIdea: ${prompt}`,
      max_output_tokens: 300,
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: body?.error?.message || 'Prompt enhancement failed.' })
  const enhanced = body.output_text || body.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text
  if (!enhanced) return res.status(502).json({ error: 'The prompt model returned an empty result.' })
  res.json({ enhanced: enhanced.trim() })
}))

app.get('/api/prompts', requireAuth, asyncRoute(async (req, res) => {
  const prompts = await prisma.prompt.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100 })
  res.json({ prompts })
}))

app.delete('/api/videos/:id', requireAuth, asyncRoute(async (req, res) => {
  const deleted = await prisma.video.deleteMany({ where: { id: req.params.id, userId: req.user.id } })
  if (!deleted.count) return res.status(404).json({ error: 'Video not found.' })
  res.status(204).end()
}))

app.post('/api/videos/:id/share', requireAuth, asyncRoute(async (req, res) => {
  const video = await prisma.video.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true, status: true, shareToken: true } })
  if (!video) return res.status(404).json({ error: 'Video not found.' })
  if (video.status !== 'COMPLETED') return res.status(409).json({ error: 'Only completed videos can be shared.' })
  const shareToken = video.shareToken || randomBytes(24).toString('hex')
  if (!video.shareToken) await prisma.video.update({ where: { id: video.id }, data: { shareToken } })
  res.json({ shareUrl: `${req.protocol}://${req.get('host')}/api/share/${shareToken}/stream` })
}))

app.get('/api/share/:token/stream', asyncRoute(async (req, res) => {
  const video = await prisma.video.findUnique({ where: { shareToken: req.params.token }, select: { outputUrl: true, status: true, title: true } })
  if (!video || video.status !== 'COMPLETED' || !video.outputUrl) return res.status(404).json({ error: 'Shared video not found.' })
  await streamVideo(video.outputUrl, res, { asDownload: false, title: video.title })
}))

async function streamProviderVideo(req, res, asDownload) {
  const video = await prisma.video.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { outputUrl: true, status: true, title: true } })
  if (!video) return res.status(404).json({ error: 'Video not found.' })
  if (video.status !== 'COMPLETED' || !video.outputUrl) return res.status(409).json({ error: 'This video is not ready yet.' })

  await streamVideo(video.outputUrl, res, { asDownload, title: video.title })
}

app.get('/api/videos/:id/stream', requireAuth, asyncRoute((req, res) => streamProviderVideo(req, res, false)))
app.get('/api/videos/:id/download', requireAuth, asyncRoute((req, res) => streamProviderVideo(req, res, true)))

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError || error.message === 'Unexpected field') return res.status(400).json({ error: 'Upload a single JPG, PNG, or WebP image under the configured size limit.' })
  const status = Number.isInteger(error.status) ? error.status : 500
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : error.message })
})

app.listen(config.port, () => {
  console.log(`VisionAI API listening on http://localhost:${config.port}`)
})
