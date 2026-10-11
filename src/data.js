export const sampleVideos = [
  {
    id: 'sample-aurora',
    title: 'Aurora over the black sand',
    prompt: 'A lone explorer watching an aurora ripple over black sand dunes',
    style: 'Cinematic',
    aspectRatio: '16:9',
    duration: 10,
    status: 'COMPLETED',
    createdAt: '2026-10-10T21:18:00.000Z',
    image: 'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=1000&q=85',
  },
  {
    id: 'sample-tokyo',
    title: 'Neon rain // Tokyo',
    prompt: 'A futuristic sports car driving through Tokyo at night in heavy rain',
    style: 'Realistic',
    aspectRatio: '9:16',
    duration: 5,
    status: 'COMPLETED',
    createdAt: '2026-10-09T17:40:00.000Z',
    image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85',
  },
  {
    id: 'sample-moon',
    title: 'Moonlit observatory',
    prompt: 'An observatory floating above the clouds, stars moving in time-lapse',
    style: '3D Animation',
    aspectRatio: '1:1',
    duration: 10,
    status: 'COMPLETED',
    createdAt: '2026-10-08T11:06:00.000Z',
    image: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1000&q=85',
  },
  {
    id: 'sample-desert',
    title: 'A door into the desert',
    prompt: 'A luminous doorway standing in a quiet desert at blue hour',
    style: 'Anime',
    aspectRatio: '16:9',
    duration: 5,
    status: 'COMPLETED',
    createdAt: '2026-10-07T09:22:00.000Z',
    image: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1000&q=85',
  },
]

export const samplePrompts = [
  { id: 'p1', text: 'A quiet Japanese garden after rain, koi moving beneath floating lanterns, slow dolly forward', style: 'Cinematic', createdAt: '2 hours ago' },
  { id: 'p2', text: 'Macro shot of a tiny astronaut repairing a satellite above a blue planet, volumetric light', style: 'Realistic', createdAt: 'Yesterday' },
  { id: 'p3', text: 'A whimsical seaside town built from paper and watercolor, clouds folding overhead', style: 'Anime', createdAt: '3 days ago' },
]

export const styleOptions = [
  { value: 'cinematic', label: 'Cinematic', note: 'Film-grade depth' },
  { value: 'realistic', label: 'Realistic', note: 'Natural motion' },
  { value: 'anime', label: 'Anime', note: 'Illustrated worlds' },
  { value: 'cartoon', label: 'Cartoon', note: 'Playful & bold' },
  { value: '3d', label: '3D animation', note: 'Rendered detail' },
]
