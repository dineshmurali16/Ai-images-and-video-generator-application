import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'

const storageRoot = path.resolve(process.cwd(), config.uploadDir, 'videos')

export async function persistVideo(videoId, remoteUrl) {
  const response = await fetch(remoteUrl)
  if (!response.ok) throw new Error(`Could not download the provider output (HTTP ${response.status}).`)
  await fsp.mkdir(storageRoot, { recursive: true })
  const outputPath = path.join(storageRoot, `${videoId}.mp4`)
  await fsp.writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
  return `file://${outputPath}`
}

export async function streamVideo(outputUrl, res, { asDownload, title }) {
  if (outputUrl.startsWith('file://')) {
    const filePath = outputUrl.slice(7)
    const info = await fsp.stat(filePath)
    res.status(200)
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', info.size)
    if (asDownload) res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'visionai-video'}.mp4"`)
    fs.createReadStream(filePath).pipe(res)
    return
  }

  const providerResponse = await fetch(outputUrl)
  if (!providerResponse.ok || !providerResponse.body) throw new Error('The provider video is temporarily unavailable.')
  res.status(200)
  res.setHeader('Content-Type', providerResponse.headers.get('content-type') || 'video/mp4')
  if (providerResponse.headers.get('content-length')) res.setHeader('Content-Length', providerResponse.headers.get('content-length'))
  if (asDownload) res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'visionai-video'}.mp4"`)
  for await (const chunk of providerResponse.body) res.write(chunk)
  res.end()
}
