import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import AuthScreen from './screens/AuthScreen.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import CoinsScreen from './screens/CoinsScreen.jsx'
import GroupsScreen from './screens/GroupsScreen.jsx'
import HistoryScreen from './screens/HistoryScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import PaperDetailScreen from './screens/PaperDetailScreen.jsx'
import { submitPaperReport } from './services/paperReports.js'
import NotificationsScreen from './screens/NotificationsScreen.jsx'
import ProfileScreen from './screens/ProfileScreen.jsx'
import PapersScreen from './screens/PapersScreen.jsx'
import MyPapersScreen from './screens/MyPapersScreen.jsx'
import SavedScreen from './screens/SavedScreen.jsx'
import { clearSession, restoreSession, saveSession, signOut as signOutApi } from './services/authApi.js'
import { decoratePapers, listPapers, listSavedPaperIds, setPaperSaved, fetchUserProfile } from './services/studyRepository.js'
import { getStudentPaper, listStudentPapers, saveStudentPaper, unlockStudentPaper } from './services/studentPapers.js'
import './styles/layout.css'
import './styles/screens.css'
import './styles/adminStandalone.css'
import './styles/theme.css'

const navItems = [
  { label: 'Home', icon: 'home' },
  { label: 'Papers', icon: 'file' },
  { label: 'My papers', icon: 'book' },
  { label: 'Coins', icon: 'coins' },
  { label: 'Study groups', icon: 'users' },
]

const PAGE_STATE_KEY = 'last-minute-page-state'
const THEME_STORAGE_KEY = 'last-minute-theme'
const validTabs = new Set(['Home', 'Papers', 'My papers', 'Saved', 'Coins', 'Study groups', 'Notifications', 'Profile', 'History', 'Admin'])

function readTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

function readPageState() {
  try {
    const sharedPaperId = new URLSearchParams(window.location.search).get('paper')
    const sharedGroupInvite = new URLSearchParams(window.location.search).get('groupInvite')
    const saved = JSON.parse(localStorage.getItem(PAGE_STATE_KEY) || '{}')
    const selectedPaper = sharedPaperId ? { id: sharedPaperId, detailLoading: true } : saved.selectedPaper && typeof saved.selectedPaper === 'object'
      ? { ...saved.selectedPaper, questions: undefined, detailLoading: true }
      : null
    return {
      activeTab: sharedGroupInvite ? 'Study groups' : validTabs.has(saved.activeTab) ? saved.activeTab : 'Home',
      query: typeof saved.query === 'string' ? saved.query : '',
      selectedPaper: selectedPaper && selectedPaper.id !== undefined ? selectedPaper : null,
      sharedPaperId,
      sharedGroupInvite,
    }
  } catch {
    return { activeTab: 'Home', query: '', selectedPaper: null, sharedPaperId: null, sharedGroupInvite: null }
  }
}

function App() {
  const [initialPage] = useState(readPageState)
  const [activeTab, setActiveTab] = useState(initialPage.activeTab)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [topProfileMenuOpen, setTopProfileMenuOpen] = useState(false)
  const [query, setQuery] = useState(initialPage.query)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const [savedIds, setSavedIds] = useState([])
  const [papers, setPapers] = useState([])
  const [papersLoading, setPapersLoading] = useState(true)
  const [savedLoading, setSavedLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [selectedPaper, setSelectedPaper] = useState(initialPage.selectedPaper)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authPrompt, setAuthPrompt] = useState(false)
  const [theme, setTheme] = useState(readTheme)
  const coinBalance = Number(profile?.coinBalance || 0) + Number(profile?.freeCoinBalance || 0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Keep the current theme for this session. */ }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_STATE_KEY, JSON.stringify({ activeTab, query, selectedPaper: selectedPaper ? { ...selectedPaper, questions: undefined } : null }))
    } catch {
      // The current view still works if browser storage is unavailable.
    }
  }, [activeTab, query, selectedPaper])

  const showNotice = useCallback((text) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 8000)
  }, [])

  useEffect(() => {
    if (initialPage.sharedGroupInvite) setActiveTab('Study groups')
    restoreSession().then((restored) => {
      if (!restored) {
        setActiveTab(initialPage.sharedGroupInvite ? 'Study groups' : 'Home')
        setSelectedPaper(null)
        if (initialPage.sharedPaperId || initialPage.sharedGroupInvite) setAuthPrompt(true)
      }
      if (restored?.authProvider === 'php-mysql') {
        setProfile(restored.profile || null)
        setPapers([])
        setSavedIds([])
        setPapersLoading(false)
        setSavedLoading(false)
      }
      setSession(restored)
    }).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let active = true
    if (session.authProvider === 'php-mysql') {
      listStudentPapers(session.token).then((records) => {
        if (!active) return
        const decorated = decoratePapers(records)
        setPapers(decorated)
        setSavedIds(records.filter((paper) => paper.isSaved).map((paper) => paper.id))
      }).catch((error) => {
        if (active) showNotice(error.message || 'Could not load papers from the library.')
      }).finally(() => {
        if (active) { setPapersLoading(false); setSavedLoading(false) }
      })
      return () => { active = false }
    }
    Promise.allSettled([
      listPapers(session.idToken),
      listSavedPaperIds(session.idToken, session.userId),
      fetchUserProfile(session.idToken, session.userId),
    ]).then(([paperResult, savedResult, profileResult]) => {
      if (!active) return
      if (paperResult.status === 'fulfilled') setPapers(paperResult.value)
      else showNotice(paperResult.reason?.message || 'Could not load papers from Firestore.')
      if (savedResult.status === 'fulfilled') setSavedIds(savedResult.value)
      else showNotice(savedResult.reason?.message || 'Could not load saved papers.')
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
    }).finally(() => {
      if (active) {
        setPapersLoading(false)
        setSavedLoading(false)
      }
    })
    return () => { active = false }
  }, [session, showNotice])

  useEffect(() => {
    const activeUnlocks = [...papers, ...(selectedPaper ? [selectedPaper] : [])]
      .filter((paper) => paper.isUnlocked && paper.unlockExpiresAt != null && Number.isFinite(Number(paper.unlockExpiresAt)))
    if (!activeUnlocks.length) return undefined
    const expiresAt = Math.min(...activeUnlocks.map((paper) => Number(paper.unlockExpiresAt)))
    const timer = window.setTimeout(() => {
      const now = Date.now()
      setPapers((current) => current.map((paper) => (
        paper.isUnlocked && Number(paper.unlockExpiresAt) <= now
          ? { ...paper, isUnlocked: false, unlockExpiresAt: null }
          : paper
      )))
      setSelectedPaper((current) => (
        current?.isUnlocked && Number(current.unlockExpiresAt) <= now
          ? { ...current, isUnlocked: false, unlockExpiresAt: null, questions: undefined }
          : current
      ))
    }, Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [papers, selectedPaper])

  useEffect(() => {
    const paperId = initialPage.sharedPaperId || initialPage.selectedPaper?.id
    if (!session || !paperId) return undefined
    let active = true
    const paperRequest = session.authProvider === 'php-mysql'
      ? getStudentPaper(session.token, paperId)
      : listPapers(session.idToken).then((records) => records.find((paper) => String(paper.id) === String(paperId)) || Promise.reject(new Error('This paper is no longer available.')))
    paperRequest.then((paper) => {
      if (!active) return
      const [decorated] = decoratePapers([paper])
      setSelectedPaper(decorated)
    }).catch((error) => {
      if (active) { setSelectedPaper(null); showNotice(error.message || 'Could not reopen this paper.') }
    })
    return () => { active = false }
  }, [session, initialPage.sharedPaperId, initialPage.selectedPaper?.id, showNotice])

  const filteredPapers = useMemo(() => papers.filter((paper) => {
    const searchText = `${paper.subject || ''} ${paper.course || ''} ${paper.title || ''} ${paper.detail || ''} ${paper.departmentName || ''} ${(paper.programmeAssignments || []).map((item) => item.programmeName || '').join(' ')}`.toLowerCase()
    return searchText.includes(query.toLowerCase())
  }), [papers, query])

  const toggleSaved = (id) => {
    if (!session) { setAuthPrompt(true); return }
    const currentlySaved = savedIds.includes(id)
    setSavedIds((current) => currentlySaved
      ? current.filter((savedId) => savedId !== id)
      : [...current, id])
    setPapers((current) => current.map((paper) => paper.id === id ? { ...paper, isSaved: !currentlySaved } : paper))
    setSelectedPaper((current) => current?.id === id ? { ...current, isSaved: !currentlySaved } : current)
    const persistence = session.authProvider === 'php-mysql'
      ? saveStudentPaper(session.token, id, !currentlySaved)
      : setPaperSaved(session.idToken, session.userId, id, !currentlySaved)
    persistence
      .catch((error) => {
        setSavedIds((current) => currentlySaved ? [...current, id] : current.filter((savedId) => savedId !== id))
        setPapers((current) => current.map((paper) => paper.id === id ? { ...paper, isSaved: currentlySaved } : paper))
        setSelectedPaper((current) => current?.id === id ? { ...current, isSaved: currentlySaved } : current)
        showNotice(error.message || 'Could not update saved papers.')
      })
  }

  const navigate = (tab) => {
    if (!session && tab !== 'Home') { setAuthPrompt(true); return }
    setProfileMenuOpen(false)
    setTopProfileMenuOpen(false)
    setActiveTab(tab)
    setSelectedPaper(null)
    if (tab === 'Papers' && session?.authProvider === 'php-mysql') {
      setPapersLoading(true)
      listStudentPapers(session.token).then((records) => {
        const decorated = decoratePapers(records)
        setPapers(decorated)
        setSavedIds(records.filter((paper) => paper.isSaved).map((paper) => paper.id))
      }).catch((error) => {
        showNotice(error.message || 'Could not refresh the paper library.')
      }).finally(() => setPapersLoading(false))
    }
  }

  const openPaper = (paper) => {
    if (!session) { setAuthPrompt(true); return }
    setSelectedPaper({ ...paper, detailLoading: true, detailError: '' })
    const loadDetail = session.authProvider === 'php-mysql'
      ? getStudentPaper(session.token, paper.id)
      : Promise.resolve(paper)
    loadDetail.then((details) => {
      const [decorated] = decoratePapers([{ ...paper, ...details }])
      setSelectedPaper(decorated)
    }).catch((error) => {
      setSelectedPaper((current) => current?.id === paper.id ? { ...current, detailLoading: false, detailError: error.message || 'Could not load this paper.' } : current)
      showNotice(error.message || 'Could not load this paper.')
    })
  }

  const sharePaper = async (paper) => {
    const url = new URL(window.location.href)
    url.searchParams.set('paper', String(paper.id))
    url.hash = ''
    try {
      if (navigator.share) await navigator.share({ title: paper.course || paper.title || 'Exam paper', url: url.toString() })
      else {
        await navigator.clipboard.writeText(url.toString())
        showNotice('Paper link copied. Anyone opening it will need to sign in.')
      }
    } catch (error) {
      if (error.name !== 'AbortError') showNotice('Could not share this link. Copy the page URL and try again.')
    }
  }

  const unlockPaper = async (paperId, durationDays) => {
    const result = await unlockStudentPaper(session.token, paperId, durationDays)
    const [decorated] = decoratePapers([result.paper])
    setSelectedPaper(decorated)
    setPapers((current) => current.map((paper) => paper.id === paperId ? { ...paper, isUnlocked: true, unlockExpiresAt: result.paper.unlockExpiresAt } : paper))
    if (result.user) setProfile((current) => ({ ...current, ...result.user }))
    showNotice(result.alreadyUnlocked ? 'This paper is already unlocked.' : 'Paper unlocked. You can now view all questions.')
  }

  const signOut = async () => {
    setProfileMenuOpen(false)
    setTopProfileMenuOpen(false)
    await signOutApi(session)
    clearSession()
    setSession(null)
    setSelectedPaper(null)
    setActiveTab('Home')
    setQuery('')
    try {
      localStorage.removeItem(PAGE_STATE_KEY)
      localStorage.removeItem('last-minute-admin-section')
    } catch {
      // Signing out must still complete if browser storage is unavailable.
    }
    setProfile(null)
    setPapers([])
    setSavedIds([])
  }

  const expireSession = useCallback(() => {
    clearSession()
    setSession(null)
    setProfile(null)
    setSelectedPaper(null)
    setActiveTab('Home')
    setPapers([])
    setSavedIds([])
  }, [])

  if (authLoading) return <div className="auth-loading" role="status">Loading your study space…</div>

  const acceptSession = (userSession) => { setAuthPrompt(false); setActiveTab(initialPage.sharedGroupInvite ? 'Study groups' : 'Home'); setQuery(''); setSelectedPaper(null); saveSession(userSession); setProfile(userSession.profile); setPapers([]); setSavedIds([]); setPapersLoading(true); setSavedLoading(true); setSession(userSession) }

  if (!session) return <div className="guest-shell">
    <header className="guest-topbar"><a className="brand" href="#home" onClick={() => { setActiveTab('Home'); setAuthPrompt(false) }}><img src="/logo.png" alt=""/><span><strong>Last Minute</strong><small>EXAM PAPER LIBRARY</small></span></a><div className="guest-topbar-actions"><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18}/></button><button className="guest-signin" onClick={() => setAuthPrompt(true)}>Sign in</button></div></header>
    <main className="guest-content" id="home"><HomeScreen query={query} setQuery={setQuery} papers={[]} loading={false} onNavigate={navigate} onOpenPaper={openPaper} savedIds={[]} onToggleSaved={toggleSaved} guest/></main>
    {authPrompt && <div className="guest-auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in to continue"><button className="guest-auth-close" aria-label="Close sign in" onClick={() => setAuthPrompt(false)}>×</button><AuthScreen onAuthenticated={acceptSession} showNotice={showNotice}/></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>

  const renderScreen = () => {
    if (selectedPaper) {
      return <PaperDetailScreen
        paper={selectedPaper}
        session={session}
        sessionToken={session.token}
        activeTab={activeTab}
        balance={coinBalance}
        onBack={() => setSelectedPaper(null)}
        showNotice={showNotice}
        saved={savedIds.includes(selectedPaper.id)}
        onToggleSaved={() => toggleSaved(selectedPaper.id)}
        onReport={(category, details) => submitPaperReport(session, selectedPaper, category, details)}
        onUnlock={(durationDays) => unlockPaper(selectedPaper.id, durationDays)}
        onGetCoins={() => navigate('Coins')}
        onShare={() => sharePaper(selectedPaper)}
        onRetry={() => openPaper(selectedPaper)}
      />
    }

    const sharedPaperProps = {
      papers: filteredPapers,
      allPapers: papers,
      savedIds,
      onToggleSaved: toggleSaved,
      onOpenPaper: openPaper,
    }

    switch (activeTab) {
      case 'Papers':
        return <PapersScreen {...sharedPaperProps} profile={profile} query={query} setQuery={setQuery} onOpenProfile={() => navigate('Profile')} showNotice={showNotice} loading={papersLoading} />
      case 'My papers':
        return <MyPapersScreen papers={papers} profile={profile} emailFallback={session.email} savedIds={savedIds} loading={papersLoading} onOpenPaper={openPaper} onToggleSaved={toggleSaved} onOpenProfile={() => navigate('Profile')} />
      case 'Saved':
        return <SavedScreen papers={papers} savedIds={savedIds} loading={savedLoading || papersLoading} onToggleSaved={toggleSaved} onOpenPaper={openPaper} onBrowse={() => navigate('Papers')} />
      case 'Coins':
        return <CoinsScreen profile={profile} balance={coinBalance} freeBalance={Number(profile?.freeCoinBalance || 0)} session={session} onProfileChange={setProfile} showNotice={showNotice} />
      case 'Study groups':
        return <GroupsScreen session={session} profile={profile} onOpenProfile={() => navigate('Profile')} showNotice={showNotice} />
      case 'Notifications':
        return <NotificationsScreen session={session} onUnreadCount={setUnreadNotifications} showNotice={showNotice} />
      case 'Profile':
        return <ProfileScreen session={session} profile={profile} onProfileChange={setProfile} onSignOut={signOut} onOpenAdmin={() => navigate('Admin')} showNotice={showNotice} />
      case 'History':
        return <HistoryScreen session={session} />
      default:
        return <HomeScreen
          query={query}
          setQuery={setQuery}
          papers={filteredPapers}
          loading={papersLoading}
          onNavigate={navigate}
          onOpenPaper={openPaper}
          savedIds={savedIds}
          onToggleSaved={toggleSaved}
        />
    }
  }

  const navigation = (className) => (
    <nav className={className} aria-label="Main navigation">
      {navItems.map((item) => (
        <button key={item.label} className={activeTab === item.label ? 'selected' : ''} onClick={() => navigate(item.label)}>
          <Icon name={item.icon} size={18} />
          <span>{item.label === 'Study groups' && className === 'mobile-nav' ? 'Groups' : item.label}</span>
        </button>
      ))}
    </nav>
  )

  if (activeTab === 'Admin') return <main className="admin-standalone-shell"><AdminScreen session={session} profile={profile} onBack={() => navigate('Profile')} onSessionExpired={expireSession} showNotice={showNotice} />{notice && <div className="toast" role="status">{notice}</div>}</main>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => navigate('Home')}>
          <img src="/logo.png" alt="" />
          <span><strong>Last Minute</strong><small>EXAM PAPER LIBRARY</small></span>
        </a>
        <div className="nav-label">STUDY SPACE</div>
        {navigation('side-nav')}
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Icon name="spark" size={17} /></div><strong>Keep your momentum</strong><p>A little practice each day adds up.</p><button onClick={() => showNotice('Your study streak starts today!')}>View study tips <Icon name="arrow" size={12} /></button></div>
          <div className="profile-menu-wrap"><button className="profile-row" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><span className="avatar">{(profile?.username || session.name || session.email || 'S').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.username || session.name || session.email || 'Student account'}</strong><small>Account menu</small></span><span className="more"><Icon name="more" size={18} /></span></button>{profileMenuOpen && <div className="profile-dropdown" role="menu"><button role="menuitem" className={activeTab === 'Profile' ? 'active' : ''} onClick={() => navigate('Profile')}><Icon name="users" size={16}/> My profile</button><button role="menuitem" className={activeTab === 'Saved' ? 'active' : ''} onClick={() => navigate('Saved')}><Icon name="bookmark" size={16}/> Saved papers</button><button role="menuitem" className={activeTab === 'History' ? 'active' : ''} onClick={() => navigate('History')}><Icon name="clock" size={16}/> Account history</button><button role="menuitem" className="profile-logout-item" onClick={signOut}><Icon name="logout" size={16}/> Log out</button></div>}</div>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="breadcrumb">Study space <span>/</span> <strong>{selectedPaper ? 'Paper details' : activeTab}</strong></div>
          <div className="top-actions"><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18}/></button><button className="icon-button" aria-label="Notifications" onClick={() => navigate('Notifications')}><Icon name="bell" size={18} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button><div className="profile-menu-wrap top-profile-menu"><button className="top-avatar" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={topProfileMenuOpen} onClick={() => setTopProfileMenuOpen((open) => !open)}>{(profile?.username || session.name || session.email || 'S').slice(0, 1).toUpperCase()}</button>{topProfileMenuOpen && <div className="profile-dropdown" role="menu"><button role="menuitem" className={activeTab === 'Profile' ? 'active' : ''} onClick={() => navigate('Profile')}><Icon name="users" size={16}/> My profile</button><button role="menuitem" className={activeTab === 'Saved' ? 'active' : ''} onClick={() => navigate('Saved')}><Icon name="bookmark" size={16}/> Saved papers</button><button role="menuitem" className={activeTab === 'History' ? 'active' : ''} onClick={() => navigate('History')}><Icon name="clock" size={16}/> Account history</button><button role="menuitem" className="profile-logout-item" onClick={signOut}><Icon name="logout" size={16}/> Log out</button></div>}</div></div>
        </header>
        <div className="page-content">{renderScreen()}</div>
      </main>
      {navigation('mobile-nav')}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

export default App
