import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  Film,
  FolderOpen,
  Gauge,
  Grid2X2,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  MoveUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { api, clearSession, saveSession } from './api.js'
import { samplePrompts, sampleVideos, styleOptions } from './data.js'

const demoUser = { id: 'demo', name: 'Alex Morgan', email: 'alex@visionai.studio', credits: 32 }
const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { label: 'Text to Video', icon: WandSparkles, view: 'text' },
  { label: 'Image to Video', icon: ImagePlus, view: 'image' },
  { label: 'My Videos', icon: Film, view: 'videos' },
  { label: 'Prompt History', icon: Clock3, view: 'prompts' },
]

const formatDate = (value) => {
  if (!value) return 'Just now'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

const formatRelative = (value) => {
  const date = new Date(value)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function App() {
  const savedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('visionai_user')) } catch { return null }
  }, [])
  const [user, setUser] = useState(savedUser || demoUser)
  const [activeView, setActiveView] = useState('dashboard')
  const [videos, setVideos] = useState(sampleVideos)
  const [prompts, setPrompts] = useState(samplePrompts)
  const [stats, setStats] = useState({ totalVideos: 24, completedVideos: 21, processingVideos: 1, credits: savedUser?.credits ?? demoUser.credits })
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [videoSrc, setVideoSrc] = useState('')
  const [generatingId, setGeneratingId] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const isAuthenticated = Boolean(localStorage.getItem('visionai_token'))

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  useEffect(() => {
    const token = localStorage.getItem('visionai_token')
    if (!token) return
    Promise.all([api.me(), api.dashboard(), api.videos(), api.prompts()])
      .then(([me, dashboard, videoResult, promptResult]) => {
        setUser(me.user)
        setStats(dashboard.stats)
        setVideos(videoResult.videos)
        setPrompts(promptResult.prompts)
      })
      .catch(() => {
        clearSession()
        toast.error('Your session expired. You can sign in again when you are ready.')
      })
  }, [])

  useEffect(() => {
    if (!generatingId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const result = await api.generation(generatingId)
        if (cancelled) return
        const nextVideo = result.video
        setVideos((current) => [nextVideo, ...current.filter((video) => video.id !== nextVideo.id)])
        if (nextVideo.status === 'COMPLETED') {
          setGeneratingId(null)
          setSelectedVideo(nextVideo)
          setActiveView('text')
          setStats((current) => ({ ...current, completedVideos: current.completedVideos + 1, processingVideos: Math.max(0, current.processingVideos - 1) }))
          await loadVideoBlob(nextVideo)
          toast.success('Your video is ready to watch.')
        } else if (nextVideo.status === 'FAILED') {
          setGeneratingId(null)
          setStats((current) => ({ ...current, processingVideos: Math.max(0, current.processingVideos - 1), credits: current.credits + 1 }))
          toast.error(nextVideo.errorMessage || 'Generation failed. Your credit was returned.')
        }
      } catch (error) {
        if (!cancelled) toast.error(error.message)
      }
    }
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [generatingId])

  async function loadVideoBlob(video) {
    if (!video?.previewUrl || !localStorage.getItem('visionai_token')) return
    try {
      const blob = await api.file(video.previewUrl)
      setVideoSrc((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return URL.createObjectURL(blob)
      })
    } catch (error) {
      toast.error(error.message)
    }
  }

  function openAuth(mode = 'signup') {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  function handleNavigate(view) {
    if (view === 'image') setActiveView('image')
    else setActiveView(view)
    setMobileOpen(false)
  }

  async function handleGenerate(values) {
    if (!localStorage.getItem('visionai_token')) {
      openAuth('signup')
      toast('Create a free account to start generating.', { icon: '✦' })
      return
    }
    try {
      const result = await api.createGeneration(values)
      setStats((current) => ({ ...current, credits: result.creditsRemaining, processingVideos: current.processingVideos + 1, totalVideos: current.totalVideos + 1 }))
      setGeneratingId(result.video.id)
      setSelectedVideo(result.video)
      setVideoSrc('')
      toast.success('Generation started. We’ll keep you posted here.')
    } catch (error) {
      if (error.status === 401) openAuth('login')
      else toast.error(error.message)
    }
  }

  async function handleDelete(video) {
    if (video.id.startsWith('sample-')) {
      setVideos((current) => current.filter((item) => item.id !== video.id))
      toast.success('Removed from this view.')
      return
    }
    try {
      await api.removeVideo(video.id)
      setVideos((current) => current.filter((item) => item.id !== video.id))
      if (selectedVideo?.id === video.id) setSelectedVideo(null)
      toast.success('Video deleted.')
    } catch (error) { toast.error(error.message) }
  }

  async function handleAuth(result) {
    saveSession(result)
    setUser(result.user)
    setAuthOpen(false)
    setStats((current) => ({ ...current, credits: result.user.credits }))
    try {
      const [dashboard, videoResult, promptResult] = await Promise.all([api.dashboard(), api.videos(), api.prompts()])
      setStats(dashboard.stats)
      setVideos(videoResult.videos)
      setPrompts(promptResult.prompts)
    } catch { /* the session itself is still valid */ }
    toast.success(`Welcome to the studio, ${result.user.name.split(' ')[0]}.`)
  }

  function handleLogout() {
    clearSession()
    setUser(demoUser)
    setVideos(sampleVideos)
    setPrompts(samplePrompts)
    setStats({ totalVideos: 24, completedVideos: 21, processingVideos: 1, credits: demoUser.credits })
    setActiveView('dashboard')
    toast.success('You have been logged out.')
  }

  const content = activeView === 'dashboard'
    ? <Dashboard user={user} stats={stats} videos={videos} onNavigate={handleNavigate} onOpenVideo={(video) => { setSelectedVideo(video); setActiveView('text'); loadVideoBlob(video) }} />
    : activeView === 'videos'
      ? <VideosView videos={videos} onNavigate={handleNavigate} onOpenVideo={(video) => { setSelectedVideo(video); setActiveView('text'); loadVideoBlob(video) }} onDelete={handleDelete} />
      : activeView === 'prompts'
        ? <PromptsView prompts={prompts} onUsePrompt={(prompt) => { setActiveView('text'); setSelectedVideo({ prompt }) }} />
        : activeView === 'settings'
          ? <SettingsView user={user} darkMode={darkMode} setDarkMode={setDarkMode} onLogout={handleLogout} />
          : <CreatorView mode={activeView === 'image' ? 'IMAGE_TO_VIDEO' : 'TEXT_TO_VIDEO'} user={user} stats={stats} selectedVideo={selectedVideo} videoSrc={videoSrc} generating={Boolean(generatingId)} onGenerate={handleGenerate} onEnhanceRequired={() => openAuth('login')} />

  return (
    <div className="app-shell">
      <AnimatePresence>
        {mobileOpen && <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      </AnimatePresence>
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} activeView={activeView} onNavigate={handleNavigate} onCollapse={() => setCollapsed((value) => !value)} onLogout={handleLogout} onOpenAuth={openAuth} authenticated={isAuthenticated} />
      <main className={`main-area ${collapsed ? 'main-collapsed' : ''}`}>
        <Topbar onMenu={() => setMobileOpen(true)} user={user} stats={stats} darkMode={darkMode} onToggleTheme={() => setDarkMode((value) => !value)} onOpenAuth={openAuth} authenticated={isAuthenticated} />
        <AnimatePresence mode="wait">
          <motion.div key={activeView} className="page-wrap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {content}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>{authOpen && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} onSuccess={handleAuth} />}</AnimatePresence>
    </div>
  )
}

function Sidebar({ collapsed, mobileOpen, activeView, onNavigate, onCollapse, onLogout, onOpenAuth, authenticated }) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Sparkles size={17} strokeWidth={2.5} /></div>
        {!collapsed && <span className="brand-name">Vision<span>AI</span></span>}
        <button className="icon-btn collapse-btn" onClick={onCollapse} aria-label="Collapse sidebar">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
      </div>
      <div className="side-create-wrap">
        <button className="side-create" onClick={() => onNavigate('text')} title="Create new video"><Plus size={18} />{!collapsed && <span>New creation</span>}</button>
      </div>
      <nav className="side-nav">
        {!collapsed && <span className="nav-caption">Workspace</span>}
        {navItems.map(({ label, icon: Icon, view }) => (
          <button key={view} className={`nav-item ${activeView === view ? 'active' : ''}`} onClick={() => onNavigate(view)} title={label}>
            <Icon size={18} strokeWidth={activeView === view ? 2.2 : 1.8} /><span>{!collapsed && label}</span>{!collapsed && view === 'text' && <span className="nav-hot">NEW</span>}
          </button>
        ))}
        <div className="nav-separator" />
        {!collapsed && <span className="nav-caption">Manage</span>}
        <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')} title="Settings"><Settings size={18} /><span>{!collapsed && 'Settings'}</span></button>
      </nav>
      {!collapsed && <div className="side-bottom">
        <div className="upgrade-card">
          <div className="upgrade-icon"><Zap size={15} fill="currentColor" /></div>
          <strong>Need more credits?</strong>
          <p>Unlock unlimited ideas with Pro.</p>
          <button onClick={() => toast('Plans are coming soon — your early access is saved.', { icon: '✦' })}>View plans <ArrowUpRight size={13} /></button>
        </div>
        <div className="side-footer">
          <button className="help-link"><CircleHelp size={16} /> Help center</button>
          {authenticated ? <button className="help-link logout-link" onClick={onLogout}><LogOut size={16} /> Log out</button> : <button className="help-link logout-link" onClick={() => onOpenAuth('login')}><LogIn size={16} /> Sign in</button>}
        </div>
      </div>}
    </aside>
  )
}

function Topbar({ onMenu, user, stats, darkMode, onToggleTheme, onOpenAuth, authenticated }) {
  return (
    <header className="topbar">
      <button className="mobile-menu icon-btn" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="breadcrumbs"><span>Studio</span><ChevronRight size={14} /><strong>{authenticated ? 'Workspace' : 'Preview mode'}</strong></div>
      <div className="top-actions">
        <button className="credits-pill" onClick={() => toast('Each generation uses 1 credit. Upgrade options are coming soon.', { icon: '◈' })}><span className="credits-dot"><Zap size={12} fill="currentColor" /></span><strong>{stats.credits}</strong><span>credits</span><ChevronDown size={13} /></button>
        <button className="icon-btn theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={17} /><i /></button>
        <div className="avatar" title={user.name}>{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
        {!authenticated && <button className="top-signin" onClick={() => onOpenAuth('login')}>Sign in <ArrowUpRight size={14} /></button>}
      </div>
    </header>
  )
}

function Dashboard({ user, stats, videos, onNavigate, onOpenVideo }) {
  const recent = videos.slice(0, 4)
  return (
    <div className="dashboard-view">
      <div className="page-heading dashboard-heading">
        <div><p className="eyebrow"><span className="eyebrow-dot" /> Sunday, October 11, 2026</p><h1>Good evening, {user.name.split(' ')[0]}<span className="heading-period">.</span></h1><p className="heading-subtitle">Shape a feeling. Turn it into motion.</p></div>
        <button className="outline-btn" onClick={() => onNavigate('prompts')}><Clock3 size={15} /> Prompt history</button>
      </div>
      <div className="dash-grid">
        <motion.button whileHover={{ y: -3 }} className="create-hero" onClick={() => onNavigate('text')}>
          <div className="create-copy"><span className="hero-overline"><Sparkles size={13} /> CREATE WITH AI</span><h2>Start with a thought.<br /><em>Leave with a world.</em></h2><p>Describe a moment, a mood, or a story. VisionAI turns your words into cinematic video.</p><span className="hero-action">Create a video <ArrowUpRight size={16} /></span></div>
          <div className="create-orbit orbit-one" /><div className="create-orbit orbit-two" /><div className="hero-noise" /><div className="hero-line line-one" /><div className="hero-line line-two" /><div className="hero-star star-one">✦</div><div className="hero-star star-two">✧</div>
          <div className="hero-preview-label"><span className="live-dot" /> canvas / 01</div>
        </motion.button>
        <div className="stat-stack">
          <StatCard icon={Film} label="Videos created" value={stats.totalVideos} change="+18%" accent="purple" />
          <StatCard icon={Gauge} label="Generation credits" value={stats.credits} change="available" accent="blue" />
        </div>
      </div>
      <div className="section-row"><div><p className="section-kicker">YOUR CANVAS</p><h2 className="section-title">Recent creations <span>{recent.length}</span></h2></div><button className="text-btn" onClick={() => onNavigate('videos')}>View all <ArrowUpRight size={15} /></button></div>
      <div className="video-grid dashboard-video-grid">{recent.map((video, index) => <VideoCard key={video.id} video={video} featured={index === 0} onOpen={() => onOpenVideo(video)} />)}</div>
      <div className="dash-bottom-grid">
        <div className="insight-card"><div className="insight-top"><span className="insight-icon"><Lightbulb size={16} /></span><span>CREATOR INSIGHT</span><MoreHorizontal size={17} /></div><p>Great videos start with a clear <strong>subject</strong> and a feeling. Try adding how the camera should move next.</p><button onClick={() => onNavigate('text')}>Try an idea <ArrowUpRight size={14} /></button></div>
        <div className="activity-card"><div className="activity-heading"><div><p className="section-kicker">ACTIVITY</p><h3>Generation pulse</h3></div><span className="pulse-status"><i /> Live</span></div><div className="pulse-chart"><span style={{ height: '28%' }} /><span style={{ height: '44%' }} /><span style={{ height: '36%' }} /><span style={{ height: '62%' }} /><span style={{ height: '52%' }} /><span style={{ height: '78%' }} /><span style={{ height: '68%' }} /><span style={{ height: '92%' }} /><span style={{ height: '70%' }} /><span style={{ height: '84%' }} /><span style={{ height: '100%' }} /><span style={{ height: '89%' }} /></div><div className="chart-labels"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div></div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, change, accent }) {
  return <div className="stat-card"><div className={`stat-icon ${accent}`}><Icon size={16} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><span className={`stat-change ${accent}`}>{change === 'available' ? <Check size={11} /> : <MoveUpRight size={11} />}{change}</span></div>
}

function CreatorView({ mode, user, stats, selectedVideo, videoSrc, generating, onGenerate, onEnhanceRequired }) {
  const [prompt, setPrompt] = useState(selectedVideo?.prompt || '')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [style, setStyle] = useState('cinematic')
  const [aspectRatio, setAspectRatio] = useState(mode === 'IMAGE_TO_VIDEO' ? '9:16' : '16:9')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('2k')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (selectedVideo?.prompt) setPrompt(selectedVideo.prompt)
  }, [selectedVideo])

  async function enhancePrompt() {
    if (!localStorage.getItem('visionai_token')) return onEnhanceRequired()
    if (prompt.trim().length < 8) return toast.error('Add a little more detail before enhancing.')
    setEnhancing(true)
    try {
      const result = await api.enhancePrompt(prompt)
      setPrompt(result.enhanced)
      toast.success('Prompt expanded with camera and lighting direction.')
    } catch (error) { toast.error(error.message) } finally { setEnhancing(false) }
  }

  function chooseImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Please choose a JPG, PNG, or WebP image.')
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function submit(event) {
    event.preventDefault()
    onGenerate({ prompt, negativePrompt, style, aspectRatio, duration, resolution, mode, image })
  }

  return (
    <div className="creator-view">
      <div className="page-heading creator-heading"><div><p className="eyebrow"><span className="eyebrow-dot purple-dot" /> CREATIVE LAB / {mode === 'IMAGE_TO_VIDEO' ? 'IMAGE TO VIDEO' : 'TEXT TO VIDEO'}</p><h1>Make it <span className="gradient-text">move.</span></h1><p className="heading-subtitle">Give your idea a little momentum.</p></div><div className="creator-credit-note"><span className="credits-dot"><Zap size={12} fill="currentColor" /></span>{stats.credits} credits left</div></div>
      <div className="creator-layout">
        <form className="creator-form panel-card" onSubmit={submit}>
          <div className="form-card-heading"><div><span className="number-tag">01</span><h2>{mode === 'IMAGE_TO_VIDEO' ? 'Bring an image to life' : 'Describe your scene'}</h2></div><span className="private-label"><Layers3 size={13} /> private canvas</span></div>
          {mode === 'IMAGE_TO_VIDEO' && <div className={`upload-zone ${imagePreview ? 'has-image' : ''}`} onClick={() => fileRef.current?.click()}>{imagePreview ? <><img src={imagePreview} alt="Reference preview" /><div className="upload-overlay"><Upload size={16} /> Replace image</div></> : <><div className="upload-circle"><ImagePlus size={20} /></div><strong>Drop a reference image here</strong><span>JPG, PNG or WebP · max {10} MB</span><button type="button">Browse files <ArrowUpRight size={13} /></button></>}<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></div>}
          <div className="prompt-field"><div className="field-label-row"><label htmlFor="scene-prompt">{mode === 'IMAGE_TO_VIDEO' ? 'Direction for motion' : 'Your prompt'}</label><span>{prompt.length}/2000</span></div><textarea id="scene-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A lone astronaut walks through a glowing canyon on an alien planet..." maxLength={2000} required /><div className="prompt-tools"><button type="button" className="enhance-btn" onClick={enhancePrompt} disabled={enhancing}>{enhancing ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} {enhancing ? 'Enhancing...' : 'Enhance prompt'}</button><span><WandSparkles size={12} /> AI assisted</span></div></div>
          <div className="optional-field"><div className="field-label-row"><label htmlFor="negative-prompt">Negative prompt <span>(optional)</span></label><span><CircleHelp size={12} /></span></div><input id="negative-prompt" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="blurry, low quality, distorted hands..." /></div>
          <div className="settings-section"><div className="form-card-heading compact"><div><span className="number-tag">02</span><h2>Set the mood</h2></div><span>Fine tune your output</span></div><div className="style-options">{styleOptions.map((option) => <button type="button" key={option.value} className={`style-option ${style === option.value ? 'selected' : ''}`} onClick={() => setStyle(option.value)}><span className={`style-swatch ${option.value}`} /> <span>{option.label}</span>{style === option.value && <Check size={13} />}</button>)}</div></div>
          <div className="settings-row"><OptionGroup label="Frame" options={['16:9', '9:16', '1:1']} value={aspectRatio} onChange={setAspectRatio} /><OptionGroup label="Length" options={[5, 10]} value={duration} onChange={setDuration} suffix="s" /><OptionGroup label="Output" options={['768p', '2k']} value={resolution} onChange={setResolution} /></div>
          <div className="generate-row"><div className="cost-note"><Zap size={14} fill="currentColor" /><span>1 credit per generation</span></div><button className="generate-btn" type="submit" disabled={generating || !prompt.trim() || (mode === 'IMAGE_TO_VIDEO' && !image)}>{generating ? <><LoaderCircle size={17} className="spin" /> Rendering scene...</> : <><Sparkles size={17} /> Generate video <ArrowUpRight size={16} /></>}</button></div>
        </form>
        <PreviewPanel selectedVideo={selectedVideo} videoSrc={videoSrc} generating={generating} onRegenerate={() => onGenerate({ prompt, negativePrompt, style, aspectRatio, duration, resolution, mode, image })} />
      </div>
      <div className="creator-footer-note"><Check size={13} /> Your work is private by default <span /> <CircleHelp size={13} /> Need a little help? <button onClick={() => toast('Try describing the subject, camera, lighting, and the feeling you want.')}>See prompting tips</button></div>
    </div>
  )
}

function OptionGroup({ label, options, value, onChange, suffix = '' }) {
  return <div className="option-group"><span className="option-label">{label}</span><div className="option-buttons">{options.map((option) => <button type="button" key={option} className={value === option ? 'selected' : ''} onClick={() => onChange(option)}>{option}{suffix}</button>)}</div></div>
}

function PreviewPanel({ selectedVideo, videoSrc, generating, onRegenerate }) {
  const hasVideo = Boolean(videoSrc)
  async function downloadVideo() {
    if (!selectedVideo?.downloadUrl) return
    try {
      const blob = await api.file(selectedVideo.downloadUrl)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${selectedVideo.title || 'visionai-video'}.mp4`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error) { toast.error(error.message) }
  }

  async function shareVideo() {
    try {
      const result = await api.shareVideo(selectedVideo.id)
      const shareData = { title: selectedVideo?.title || 'VisionAI creation', text: selectedVideo?.prompt || 'A video created in VisionAI Studio', url: result.shareUrl }
      if (navigator.share) await navigator.share(shareData)
      else { await navigator.clipboard?.writeText(result.shareUrl); toast.success('Private share link copied.') }
    } catch (error) { if (error.name !== 'AbortError') toast.error('Unable to share this video yet.') }
  }

  return <div className="preview-column"><div className="preview-top"><div><p className="section-kicker">LIVE PREVIEW</p><h2>{generating ? 'Rendering your scene' : hasVideo ? 'Your finished frame' : 'Your canvas'}</h2></div><span className={`preview-status ${generating ? 'rendering' : hasVideo ? 'ready' : ''}`}><i />{generating ? 'In progress' : hasVideo ? 'Ready' : 'Waiting for input'}</span></div><div className="preview-stage"><div className="stage-grid" />{hasVideo ? <video src={videoSrc} controls autoPlay loop className="real-video" /> : <div className="abstract-scene"><div className="scene-sun" /><div className="scene-mountain mountain-back" /><div className="scene-mountain mountain-front" /><div className="scene-ring" /><div className="scene-person" /><span className="scene-caption">{generating ? 'building atmosphere...' : 'your story starts here'}</span></div>}{generating && <div className="render-overlay"><div className="render-loader"><LoaderCircle size={25} className="spin" /></div><strong>Bringing your idea to life</strong><span>Usually takes 1–3 minutes</span><div className="render-progress"><i /></div></div>} {!hasVideo && !generating && <div className="preview-tip"><Sparkles size={13} /> Hit generate to see your first frame</div>}</div><div className="preview-meta"><div><span>OUTPUT FORMAT</span><strong>MP4 · H.264</strong></div><div><span>RESOLUTION</span><strong>Up to 2k</strong></div><div><span>POWERED BY</span><strong>Runway <span className="provider-dot" /></strong></div></div>{hasVideo && <div className="preview-actions"><button onClick={downloadVideo}><Download size={14} /> Download MP4</button><button onClick={shareVideo}><Share2 size={14} /> Share</button><button onClick={onRegenerate}><RotateCcw size={14} /> Regenerate</button></div>}</div>
}

function VideoCard({ video, featured, onOpen }) {
  return <motion.button whileHover={{ y: -4 }} className={`video-card ${featured ? 'featured' : ''}`} onClick={onOpen}><div className={`video-thumb thumb-${video.id}`} style={video.image ? { backgroundImage: `url(${video.image})` } : undefined}><div className="thumb-shade" /><span className="video-type"><Film size={11} /> {video.duration}s</span><span className="play-circle"><Play size={15} fill="currentColor" /></span><span className={`status-pill ${video.status?.toLowerCase()}`}>{video.status === 'PROCESSING' ? <LoaderCircle size={10} className="spin" /> : <i />}{video.status === 'COMPLETED' ? 'Ready' : video.status === 'PROCESSING' ? 'Rendering' : video.status === 'FAILED' ? 'Failed' : 'Queued'}</span></div><div className="video-card-info"><div><h3>{video.title}</h3><p>{formatRelative(video.createdAt)}</p></div><MoreHorizontal size={16} /></div></motion.button>
}

function VideosView({ videos, onNavigate, onOpenVideo, onDelete }) {
  const [query, setQuery] = useState('')
  const visible = videos.filter((video) => `${video.title} ${video.prompt}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="library-view"><div className="page-heading library-heading"><div><p className="eyebrow"><span className="eyebrow-dot" /> YOUR LIBRARY</p><h1>My videos<span className="heading-period">.</span></h1><p className="heading-subtitle">Every idea you’ve brought to life, in one place.</p></div><button className="primary-btn" onClick={() => onNavigate('text')}><Plus size={16} /> New video</button></div><div className="library-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Search your creations" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="toolbar-actions"><button className="filter-btn">All videos <ChevronDown size={14} /></button><button className="icon-btn"><Grid2X2 size={16} /></button></div></div><div className="library-count"><span>{visible.length} creations</span><span className="count-line" /><span>Sorted by newest</span></div><div className="video-grid library-grid">{visible.map((video) => <div className="video-card-wrap" key={video.id}><VideoCard video={video} onOpen={() => onOpenVideo(video)} /><button className="delete-video" onClick={(event) => { event.stopPropagation(); onDelete(video) }} aria-label={`Delete ${video.title}`}><Trash2 size={14} /></button></div>)}</div>{visible.length === 0 && <div className="empty-state"><Film size={25} /><h3>No videos match that search</h3><p>Try a different phrase or start a new creation.</p></div>}</div>
}

function PromptsView({ prompts, onUsePrompt }) {
  return <div className="prompts-view"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-dot blue-dot" /> IDEA ARCHIVE</p><h1>Prompt history<span className="heading-period">.</span></h1><p className="heading-subtitle">Your best ideas are worth coming back to.</p></div><button className="primary-btn" onClick={() => onUsePrompt({ prompt: '' })}><Plus size={16} /> New prompt</button></div><div className="prompt-archive panel-card">{prompts.map((prompt, index) => <div className="archive-row" key={prompt.id || index}><div className="archive-index">0{index + 1}</div><div className="archive-prompt"><p>{prompt.input || prompt.text}</p><div><span>{prompt.style || 'Cinematic'}</span><i /> <small>{prompt.createdAt?.includes?.('T') ? formatDate(prompt.createdAt) : prompt.createdAt}</small></div></div><button className="copy-prompt" onClick={() => { navigator.clipboard?.writeText(prompt.input || prompt.text); toast.success('Prompt copied.') }}><Copy size={14} /> Copy</button><button className="use-prompt" onClick={() => onUsePrompt({ prompt: prompt.input || prompt.text })}>Use prompt <ArrowUpRight size={13} /></button></div>)}{prompts.length === 0 && <div className="empty-state"><Clock3 size={25} /><h3>Your prompt archive is empty</h3><p>Enhanced prompts and completed generations will show up here.</p></div>}</div></div>
}

function SettingsView({ user, darkMode, setDarkMode, onLogout }) {
  return <div className="settings-view"><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-dot" /> PREFERENCES</p><h1>Settings<span className="heading-period">.</span></h1><p className="heading-subtitle">Make VisionAI feel like your studio.</p></div></div><div className="settings-layout"><div className="settings-nav"><span className="settings-nav-active"><UserRound size={15} /> Profile</span><span><Bell size={15} /> Notifications</span><span><Settings size={15} /> Workspace</span></div><div className="settings-panels"><section className="setting-section panel-card"><div className="setting-title"><div><h2>Profile</h2><p>Your account details and personal workspace.</p></div><button className="outline-btn">Edit profile</button></div><div className="profile-row"><div className="large-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div><strong>{user.name}</strong><p>{user.email}</p><span className="member-since">Member since October 2026</span></div></div></section><section className="setting-section panel-card"><div className="setting-title"><div><h2>Appearance</h2><p>Choose how VisionAI looks on your screen.</p></div></div><div className="appearance-row"><div className="appearance-choice"><div className={`appearance-preview ${darkMode ? 'selected' : ''}`} /><span>Dark studio</span>{darkMode && <Check size={14} />}</div><div className="appearance-choice"><div className={`appearance-preview light ${!darkMode ? 'selected' : ''}`} /><span>Light studio</span>{!darkMode && <Check size={14} />}</div><button className="appearance-toggle" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Moon size={14} /> : <Sun size={14} />} Toggle theme</button></div></section><section className="setting-section panel-card danger-section"><div className="setting-title"><div><h2>Session</h2><p>Sign out of this VisionAI workspace.</p></div><button className="logout-action" onClick={onLogout}><LogOut size={14} /> Log out</button></div></section></div></div></div>
}

function AuthModal({ mode, setMode, onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = isSignup ? await api.signup({ name, email, password }) : await api.login({ email, password })
      onSuccess(result)
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><motion.div className="auth-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}><button className="modal-close icon-btn" onClick={onClose}><X size={17} /></button><div className="auth-brand"><div className="brand-mark"><Sparkles size={17} /></div><span>Vision<span>AI</span></span></div><p className="eyebrow"><span className="eyebrow-dot purple-dot" /> CREATIVE ACCESS</p><h2>{isSignup ? 'Make room for more ideas.' : 'Welcome back to the studio.'}</h2><p className="auth-copy">{isSignup ? 'Create your workspace and get 40 starter credits.' : 'Your next world is waiting.'}</p><form onSubmit={submit}>{isSignup && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required minLength={2} /></label>}<label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="8+ characters" required minLength={isSignup ? 8 : 1} /></label><button className="generate-btn auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin" /> Opening studio...</> : isSignup ? <><Sparkles size={16} /> Create free account</> : <><LogIn size={16} /> Sign in</>}</button></form><div className="auth-switch">{isSignup ? 'Already have an account?' : 'New to VisionAI?'} <button onClick={() => setMode(isSignup ? 'login' : 'signup')}>{isSignup ? 'Sign in' : 'Create an account'}</button></div><p className="auth-terms">By continuing, you agree to VisionAI’s terms and privacy policy.</p></motion.div></motion.div>
}

export default App
