import { prisma } from './prisma.js'
import { videoProvider } from './providers/runway.js'
import { persistVideo } from './storage.js'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function refundCredits(userId, videoId, reason) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { credits: { increment: 1 } } }),
    prisma.usageCredit.create({
      data: { userId, videoId, amount: 1, type: 'REFUND', reason },
    }),
  ])
}

export function startGenerationJob({ jobId, videoId, userId, input, imageDataUrl }) {
  void processGeneration({ jobId, videoId, userId, input, imageDataUrl })
}

async function processGeneration({ jobId, videoId, userId, input, imageDataUrl }) {
  try {
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } })
    await prisma.video.update({ where: { id: videoId }, data: { status: 'PROCESSING' } })

    const task = await videoProvider.create({ ...input, imageDataUrl })
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { providerTaskId: task.taskId },
    })
    await prisma.video.update({ where: { id: videoId }, data: { providerTaskId: task.taskId } })

    const maxAttempts = 180
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await delay(5000)
      const status = await videoProvider.getStatus(task.taskId)

      if (status.status === 'completed' && status.outputUrl) {
        const storedOutputUrl = await persistVideo(videoId, status.outputUrl)
        await prisma.$transaction([
          prisma.video.update({
            where: { id: videoId },
            data: { status: 'COMPLETED', outputUrl: storedOutputUrl, completedAt: new Date() },
          }),
          prisma.generationJob.update({ where: { id: jobId }, data: { status: 'COMPLETED', attempts: attempt + 1 } }),
          prisma.usageCredit.create({
            data: { userId, videoId, amount: -1, type: 'USAGE', reason: 'Runway video generation' },
          }),
        ])
        return
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'The provider failed this generation.')
      }

      await prisma.generationJob.update({ where: { id: jobId }, data: { attempts: attempt + 1 } })
    }

    throw new Error('The provider timed out before returning a video.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error.'
    await prisma.$transaction([
      prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED', errorMessage: message } }),
      prisma.generationJob.update({ where: { id: jobId }, data: { status: 'FAILED', lastError: message } }),
    ])
    await refundCredits(userId, videoId, `Generation failed: ${message}`)
    console.error(`[generation:${jobId}] ${message}`)
  }
}
