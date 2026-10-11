import { z } from 'zod'

export const generationSchema = z.object({
  prompt: z.string().trim().min(8, 'Describe your scene in at least 8 characters.').max(2000),
  negativePrompt: z.string().trim().max(500).optional().default(''),
  style: z.enum(['cinematic', 'realistic', 'anime', 'cartoon', '3d']).default('cinematic'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  duration: z.coerce.number().int().refine((value) => [5, 10].includes(value), 'Choose a supported duration.'),
  resolution: z.enum(['768p', '2k']).default('2k'),
  mode: z.enum(['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO']).default('TEXT_TO_VIDEO'),
})

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(72),
})

export const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
})
