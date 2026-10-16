import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import AuthScreen from './screens/AuthScreen.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import CoinsScreen from './screens/CoinsScreen.jsx'
import GroupsScreen from './screens/GroupsScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import PaperDetailScreen from './screens/PaperDetailScreen.jsx'
import NotificationsScreen from './screens/NotificationsScreen.jsx'
import ProfileScreen from './screens/ProfileScreen.jsx'
import PapersScreen from './screens/PapersScreen.jsx'
import SavedScreen from './screens/SavedScreen.jsx'
import { clearSession, restoreSession, saveSession, signOut as signOutApi } from './services/authApi.js'
import { decoratePapers, listPapers, listSavedPaperIds, setPaperSaved, fetchUserProfile } from './services/studyRepository.js'
import { getStudentPaper, listStudentPapers, saveStudentPaper, unlockStudentPaper } from './services/studentPapers.js'
import './styles/layout.css'
import './styles/screens.css'

const navItems = [
  { label: 'Home', icon: 'home' },
  { label: 'Papers', icon: 'file' },
  { label: 'Saved', icon: 'bookmark' },
  { label: 'Coins', icon: 'coins' },
  { label: 'Study groups', icon: 'users' },
]

const PAGE_STATE_KEY = 'last-minute-page-state'
const validTabs = new Set(['Home', 'Papers', 'Saved', 'Coins', 'Study groups', 'Notifications', 'Profile', 'Admin'])

function readPageState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAGE_STATE_KEY) || '{}')
    const selectedPaper = saved.selectedPaper && typeof saved.selectedPaper === 'object'
      ? { ...saved.selectedPaper, questions: undefined, detailLoading: true }
      : null
    return {
      activeTab: validTabs.has(saved.activeTab) ? saved.activeTab : 'Home',
      query: typeof saved.query === 'string' ? saved.query : '',
      selectedPaper: selectedPaper && selectedPaper.id !== undefined ? selectedPaper : null,
    }
  } catch {
    return { activeTab: 'Home', query: '', selectedPaper: null }
  }
}

function App() {
  const [initialPage] = useState(readPageState)
  const [activeTab, setActiveTab] = useState(initialPage.activeTab)
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
  const coinBalance = Number(profile?.coinBalance || 0) + Number(profile?.freeCoinBalance || 0)

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
    restoreSession().then((restored) => {
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
    if (session?.authProvider !== 'php-mysql' || !initialPage.selectedPaper?.id || selectedPaper?.id !== initialPage.selectedPaper.id) return undefined
    let active = true
    getStudentPaper(session.token, initialPage.selectedPaper.id).then((paper) => {
      if (!active) return
      const [decorated] = decoratePapers([paper])
      setSelectedPaper(decorated)
    }).catch((error) => {
      if (active) { setSelectedPaper(null); showNotice(error.message || 'Could not reopen this paper.') }
    })
    return () => { active = false }
  }, [session, initialPage.selectedPaper?.id, selectedPaper?.id, showNotice])

  const filteredPapers = useMemo(() => papers.filter((paper) => {
    const searchText = `${paper.subject || ''} ${paper.course || ''} ${paper.title || ''} ${paper.detail || ''} ${paper.departmentName || ''} ${(paper.programmeAssignments || []).map((item) => item.programmeName || '').join(' ')}`.toLowerCase()
    return searchText.includes(query.toLowerCase())
  }), [papers, query])

  const toggleSaved = (id) => {
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
    setActiveTab(tab)
    setSelectedPaper(null)
  }

  const openPaper = (paper) => {
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

  const unlockPaper = async (paperId) => {
    const result = await unlockStudentPaper(session.token, paperId)
    const [decorated] = decoratePapers([result.paper])
    setSelectedPaper(decorated)
    setPapers((current) => current.map((paper) => paper.id === paperId ? { ...paper, isUnlocked: true } : paper))
    if (result.user) setProfile((current) => ({ ...current, ...result.user }))
    showNotice(result.alreadyUnlocked ? 'This paper is already unlocked.' : 'Paper unlocked. You can now view all questions.')
  }

  const signOut = async () => {
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

  if (authLoading) return <div className="auth-loading" role="status">Loading your study space…</div>

  if (!session) {
    return <>
      <AuthScreen onAuthenticated={(userSession) => { setActiveTab('Home'); setQuery(''); setSelectedPaper(null); saveSession(userSession); setProfile(userSession.profile); setPapers([]); setSavedIds([]); setPapersLoading(true); setSavedLoading(true); setSession(userSession) }} showNotice={showNotice} />
      {notice && <div className="toast auth-toast" role="status">{notice}</div>}
    </>
  }

  const renderScreen = () => {
    if (selectedPaper) {
      return <PaperDetailScreen
        paper={selectedPaper}
        sessionToken={session.token}
        activeTab={activeTab}
        balance={coinBalance}
        onBack={() => setSelectedPaper(null)}
        showNotice={showNotice}
        saved={savedIds.includes(selectedPaper.id)}
        onToggleSaved={() => toggleSaved(selectedPaper.id)}
        onUnlock={() => unlockPaper(selectedPaper.id)}
        onGetCoins={() => navigate('Coins')}
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
        return <PapersScreen {...sharedPaperProps} query={query} setQuery={setQuery} showNotice={showNotice} loading={papersLoading} />
      case 'Saved':
        return <SavedScreen papers={papers} savedIds={savedIds} loading={savedLoading || papersLoading} onToggleSaved={toggleSaved} onOpenPaper={openPaper} onBrowse={() => navigate('Papers')} />
      case 'Coins':
        return <CoinsScreen profile={profile} balance={coinBalance} freeBalance={Number(profile?.freeCoinBalance || 0)} session={session} onProfileChange={setProfile} showNotice={showNotice} />
      case 'Study groups':
        return <GroupsScreen session={session} profile={profile} showNotice={showNotice} />
      case 'Notifications':
        return <NotificationsScreen session={session} onUnreadCount={setUnreadNotifications} showNotice={showNotice} />
      case 'Profile':
        return <ProfileScreen session={session} profile={profile} onProfileChange={setProfile} onSignOut={signOut} onOpenAdmin={() => navigate('Admin')} showNotice={showNotice} />
      case 'Admin':
        return <AdminScreen session={session} profile={profile} onBack={() => navigate('Profile')} showNotice={showNotice} />
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
          {item.label === 'Saved' && savedIds.length > 0 && className === 'side-nav' && <span className="nav-count">{savedIds.length}</span>}
        </button>
      ))}
    </nav>
  )

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
          <button className="profile-row" onClick={() => navigate('Profile')}><span className="avatar">{(profile?.username || session.name || session.email || 'S').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.username || session.name || session.email || 'Student account'}</strong><small>View profile</small></span><span className="more"><Icon name="more" size={18} /></span></button>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="breadcrumb">Study space <span>/</span> <strong>{selectedPaper ? 'Paper details' : activeTab}</strong></div>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications" onClick={() => navigate('Notifications')}><Icon name="bell" size={18} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button><button className="top-avatar" aria-label="Open profile" onClick={() => navigate('Profile')}>{(profile?.username || session.name || session.email || 'S').slice(0, 1).toUpperCase()}</button></div>
        </header>
        <div className="page-content">{renderScreen()}</div>
      </main>
      {navigation('mobile-nav')}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

export default App
