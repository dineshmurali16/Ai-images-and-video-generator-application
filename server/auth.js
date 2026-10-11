import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { prisma } from './prisma.js'

export const createToken = (userId) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' })

export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  credits: user.credits,
})

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret)
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return res.status(401).json({ error: 'Your session is no longer valid.' })
    req.user = user
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }
}
