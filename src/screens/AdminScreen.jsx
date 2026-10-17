import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import PaperReviewEditor from '../components/admin/PaperReviewEditor.jsx'
import { giftAdminUserCoins, listAdminUsers, updateAdminUser } from '../services/adminUsers.js'
import { createAcademicRecord, listAcademicRecords } from '../services/adminAcademics.js'
import { deleteAdminPaper, getAdminPaper, listAdminPapers, saveAdminPaper } from '../services/adminPapers.js'
import { countCollection, deleteDocument, getDocument, getOptionalDocument, listCollectionPage, queryCollectionGroupPage, patchDocument, setDocument } from '../services/firestore.js'
import { importPaperFile } from '../services/paperImport.js'
import { loadAdminMarking } from '../services/adminMarking.js'
import './AdminScreen.css'

const sections = [
  ['dashboard', 'Dashboard', 'home'], ['users', 'Users', 'users'], ['papers', 'Papers', 'file'],
  ['academics', 'Academic structure', 'book'], ['practice', 'Practice analytics', 'spark'],
  ['discussions', 'Group discussions', 'messages'], ['reports', 'Paper reports', 'bell'], ['settings', 'App configuration', 'sliders'],
]
const ADMIN_SECTION_KEY = 'last-minute-admin-section'

function readAdminSection() {
  try {
    const saved = localStorage.getItem(ADMIN_SECTION_KEY)
    return sections.some(([id]) => id === saved) ? saved : 'dashboard'
  } catch { return 'dashboard' }
}

async function loadAdminData(section, token, pageToken = '', search = '', phpSession = false) {
  switch (section) {
    case 'dashboard': {
      const [users, papers, groups] = await Promise.all([
        countCollection(token, 'users'), countCollection(token, 'papers'), countCollection(token, 'studyGroups'),
      ])
      return { users, papers, groups }
    }
    case 'users': return listAdminUsers(token, { cursor: pageToken, search })
    // Older papers may not have updatedAt. Ordering by it silently omits those
    // documents from Firestore results, so use the document-name order here.
    case 'papers': return phpSession
      ? listAdminPapers(token, { cursor: pageToken })
      : listCollectionPage(token, 'papers', { pageSize: 40, pageToken, fields: ['title', 'course', 'year', 'semester', 'departmentId', 'departmentName', 'updatedAt', 'questionCount', 'programmeAssignments'] })
    case 'academics': return phpSession ? { documents: await listAcademicRecords(token, 'colleges'), nextPageToken: '' } : listCollectionPage(token, 'colleges', { pageSize: 40, pageToken, fields: ['name', 'alias'] })
    case 'practice': {
      if (phpSession) {
        const marking = await loadAdminMarking(token)
        return { marking: marking.practiceMarking || { summary: {}, events: [] } }
      }
      const [usage, unlocks] = await Promise.all([
        listCollectionPage(token, 'practiceMarkingUsage', { orderBy: 'submittedAt', descending: true, pageSize: 25, fields: ['paperTitle', 'answerCount', 'coinsCharged', 'status', 'submittedAt'] }),
        listCollectionPage(token, 'coinUsageEvents', { orderBy: 'createdAt', descending: true, pageSize: 25, fields: ['action', 'freeCoinsSpent', 'purchasedCoinsSpent', 'createdAt'] }),
      ])
      return { usage: usage.documents, unlocks: unlocks.documents }
    }
    case 'discussions': {
      if (phpSession) {
        const marking = await loadAdminMarking(token)
        return { groupMarking: marking.groupMarking || { summary: {}, groups: [], events: [] } }
      }
      return queryCollectionGroupPage(token, 'plans', { orderBy: 'scheduledAt', descending: true, limit: 50, fields: ['groupId', 'paperTitle', 'course', 'scheduledAt', 'currentQuestionIndex', 'questionCount'] })
    }
    case 'reports': return listCollectionPage(token, 'paperReports', { orderBy: 'createdAt', descending: true, pageSize: 25, pageToken, fields: ['paperId', 'paperTitle', 'reporterId', 'category', 'details', 'status', 'createdAt'] })
    case 'settings': return (await getOptionalDocument(token, 'settings/appConfiguration')) || {}
    default: return null
  }
}

function valueDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

function userIsAdmin(user) {
  return user?.isAdmin === true || String(user?.role || '').toLowerCase() === 'admin'
}

function paperContentForFirestore(block = {}) {
  const type = String(block.type || 'paragraph')
  if (type === 'paragraph') return { type, text: String(block.text || '') }
  if (type === 'code') return { type, language: String(block.language || ''), code: String(block.code || '') }
  if (type === 'image') return { type, path: String(block.path || ''), caption: String(block.caption || '') }
  if (type === 'bullet_list') return { type, ordered: Boolean(block.ordered), items: Array.isArray(block.items) ? block.items.map(String) : [] }
  if (type === 'table') return { type, title: String(block.title || ''), columns: Array.isArray(block.columns) ? block.columns.map(String) : [], rows: Array.isArray(block.rows) ? block.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []) : [] }
  return { type, text: String(block.text || '') }
}

function paperQuestionForFirestore(question, index) {
  const normalizeSubquestion = (item, subIndex = 0) => ({
    id: String(item.id || `sq-${subIndex + 1}`),
    number: String(item.number ?? String.fromCharCode(97 + subIndex)),
    text: String(item.text || ''),
    marks: item.marks === '' || item.marks === undefined || item.marks === null ? null : Number(item.marks),
    subquestions: Array.isArray(item.subquestions) ? item.subquestions.map(normalizeSubquestion) : [],
  })
  const source = question.source_location || {}
  const cleanPage = (value) => Number.isFinite(Number(value)) ? Number(value) : 1
  return {
    id: String(question.id || `q-${index + 1}`),
    number: String(question.number ?? index + 1),
    order: index + 1,
    type: String(question.type || 'structured'),
    marks: question.marks === '' || question.marks === undefined || question.marks === null ? null : Number(question.marks),
    content: Array.isArray(question.content) ? question.content.map(paperContentForFirestore) : [],
    subquestions: Array.isArray(question.subquestions) ? question.subquestions.map(normalizeSubquestion) : [],
    assets: Array.isArray(question.assets) ? question.assets.filter((asset) => typeof asset === 'string' || (asset && typeof asset === 'object' && (asset.path || asset.url))).map((asset) => typeof asset === 'string' ? asset : { ...(asset.name ? { name: String(asset.name) } : {}), ...(asset.type ? { type: String(asset.type) } : {}), ...(asset.path ? { path: String(asset.path) } : {}), ...(asset.url ? { url: String(asset.url) } : {}), ...(asset.caption ? { caption: String(asset.caption) } : {}) }) : [],
    source_location: { page_start: cleanPage(source.page_start ?? source.pageStart), page_end: cleanPage(source.page_end ?? source.pageEnd) },
  }
}

function Stat({ label, value, icon, tone = 'mint' }) {
  return <article className="admin-stat"><span className={`admin-stat-icon ${tone}`}><Icon name={icon} size={19} /></span><div><small>{label}</small><strong>{Number(value || 0).toLocaleString()}</strong></div></article>
}

function GroupMarkingAnalytics({ data }) {
  const summary = data?.summary || {}
  const groups = data?.groups || []
  const events = data?.events || []
  return <section className="group-marking-analytics">
    <div className="admin-section-title sub"><div><span className="section-kicker">STUDY GROUPS · MYSQL MARKER</span><h2>Group marking analytics</h2><p>One usage record is stored for each member answer sent to the AI marker.</p></div></div>
    <div className="admin-stats-grid"><Stat label="Answer marking attempts" value={summary.attempts} icon="spark"/><Stat label="Groups using marking" value={summary.groupsUsed} icon="users" tone="blue"/><Stat label="Facilitators" value={summary.facilitators} icon="user" tone="violet"/><Stat label="Successfully marked" value={summary.marked} icon="check" tone="mint"/><Stat label="Failed attempts" value={summary.failed} icon="bell" tone="gold"/><Stat label="Average awarded marks" value={summary.averageScore} icon="book" tone="blue"/></div>
    <div className="admin-section-title sub"><h2>Usage by group</h2></div>
    <div className="admin-card-list">{groups.map((item) => <article className="admin-list-row" key={item.groupId}><span className="admin-row-icon violet"><Icon name="users" size={17}/></span><div><strong>{item.groupName || `Group ${item.groupId}`}</strong><small>{item.attempts} answer attempts · {item.discussions} discussions · {item.facilitators} facilitators · {item.marked} marked · {item.failed} failed · Last used {valueDate(item.lastUsed)}</small></div><span className="admin-badge">{item.attempts} attempts</span></article>)}{!groups.length && <div className="admin-empty">No group marking activity recorded yet.</div>}</div>
    <div className="admin-section-title sub"><h2>Recent group marking attempts</h2></div>
    <div className="admin-card-list">{events.map((item) => <article className="admin-list-row" key={item.id}><span className={`admin-row-icon ${item.status === 'marked' ? 'mint' : 'blue'}`}><Icon name={item.status === 'marked' ? 'check' : 'spark'} size={17}/></span><div><strong>{item.groupName || `Group ${item.groupId || ''}`} · {item.paperTitle || 'Paper discussion'}</strong><small>{item.questionNumber ? `Question ${item.questionNumber} · ` : ''}{item.facilitator || 'Unknown facilitator'} · {item.score === null ? 'No score' : `${item.score} / ${item.maxMarks} marks`} · ${item.status || 'pending'} · {valueDate(item.createdAt)}</small></div><span className="admin-badge">{item.course || 'Group marking'}</span></article>)}{!events.length && <div className="admin-empty">No recent group marking attempts.</div>}</div>
  </section>
}

function PracticeMarkingAnalytics({ data }) {
  const summary = data?.summary || {}
  const events = data?.events || []
  return <>
    <div className="admin-section-title"><div><span className="section-kicker">INDIVIDUAL PRACTICE · MYSQL MARKER</span><h2>Practice analytics</h2><p>Single user practice marking activity and outcomes.</p></div></div>
    <div className="admin-stats-grid"><Stat label="Answer attempts" value={summary.attempts} icon="spark"/><Stat label="Students using marking" value={summary.users} icon="users" tone="blue"/><Stat label="Successfully marked" value={summary.marked} icon="check" tone="mint"/><Stat label="Failed attempts" value={summary.failed} icon="bell" tone="gold"/><Stat label="Average score (%)" value={summary.averagePercentage} icon="book" tone="violet"/></div>
    <div className="admin-section-title sub"><h2>Recent individual marking attempts</h2></div>
    <div className="admin-card-list">{events.map((item) => <article className="admin-list-row" key={item.id}><span className={`admin-row-icon ${item.status === 'marked' ? 'mint' : 'blue'}`}><Icon name={item.status === 'marked' ? 'check' : 'spark'} size={17}/></span><div><strong>{item.username || `User ${item.userId}`} · {item.paperTitle || 'Practice marking'}</strong><small>{item.course || 'Course unavailable'}{item.year ? ` · ${item.year}` : ''} · Question {item.questionNumber} · {item.score === null ? 'No score' : `${item.score} / ${item.maxMarks} marks`} · ${item.status || 'pending'} · {valueDate(item.createdAt)}</small></div><span className="admin-badge">{item.model || 'AI marker'}</span></article>)}{!events.length && <div className="admin-empty">No individual practice marking activity recorded yet.</div>}</div>
  </>
}

export default function AdminScreen({ session, profile, onBack, showNotice }) {
  const [section, setSection] = useState(readAdminSection)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [nextPageToken, setNextPageToken] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [paperEditor, setPaperEditor] = useState(null)
  const [paperEditorLoading, setPaperEditorLoading] = useState(false)
  const [paperSaving, setPaperSaving] = useState(false)
  const [paperToDelete, setPaperToDelete] = useState(null)
  const [paperDeleting, setPaperDeleting] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userGiftAmount, setUserGiftAmount] = useState('50')
  const [userActionBusy, setUserActionBusy] = useState(false)
  const [expandedCollege, setExpandedCollege] = useState('')
  const [expandedSchool, setExpandedSchool] = useState('')
  const [expandedDepartment, setExpandedDepartment] = useState('')
  const [academicChildren, setAcademicChildren] = useState({})
  const [loadingNode, setLoadingNode] = useState('')
  const [academicForm, setAcademicForm] = useState(null)
  const [academicDraft, setAcademicDraft] = useState({ name: '', alias: '' })
  const [academicSaving, setAcademicSaving] = useState(false)
  const [academicFormError, setAcademicFormError] = useState('')
  const sectionCache = useRef(new Map())
  const activeSectionRef = useRef(section)
  const importInputRef = useRef(null)
  const isAdmin = profile?.isAdmin === true || String(profile?.role || '').toLowerCase() === 'admin'

  useEffect(() => {
    try { localStorage.setItem(ADMIN_SECTION_KEY, section) } catch { /* Keep the screen usable without storage. */ }
  }, [section])

  useEffect(() => {
    if (!academicForm) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !academicSaving) setAcademicForm(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [academicForm, academicSaving])

  useEffect(() => {
    if (!paperToDelete) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !paperDeleting) setPaperToDelete(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [paperToDelete, paperDeleting])

  useEffect(() => {
    if (!selectedUser) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !userActionBusy) setSelectedUser(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedUser, userActionBusy])

  const refresh = useCallback(() => {
    sectionCache.current.delete(section)
    setLoading(true)
    setNextPageToken('')
    setAcademicChildren({})
    setExpandedCollege('')
    setExpandedSchool('')
    setExpandedDepartment('')
    setReload((value) => value + 1)
  }, [section])
  useEffect(() => {
    if (!isAdmin) return undefined
    const cached = sectionCache.current.get(section)
    if (cached) return undefined
    let active = true
    const token = session.authProvider === 'php-mysql' ? session.token : session.idToken
    loadAdminData(section, token, '', section === 'users' ? search : '', session.authProvider === 'php-mysql').then((result) => {
      const paged = result && Array.isArray(result.documents)
      const resultData = paged ? result.documents : result
      const cursor = paged ? result.nextPageToken : ''
      if (active) {
        sectionCache.current.set(section, { data: resultData, nextPageToken: cursor })
        setData(resultData)
        setNextPageToken(cursor)
        setError('')
      }
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Could not load this admin section.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [section, session.authProvider, session.idToken, session.token, search, reload, isAdmin])

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return
    setLoadingMore(true)
    try {
      const phpSession = session.authProvider === 'php-mysql'
      const result = await loadAdminData(section, phpSession ? session.token : session.idToken, nextPageToken, section === 'users' ? search : '', phpSession)
      if (activeSectionRef.current !== section) return
      const rows = result.documents || []
      const cursor = result.nextPageToken || ''
      const merged = [...(Array.isArray(data) ? data : []), ...rows]
      sectionCache.current.set(section, { data: merged, nextPageToken: cursor })
      setData(merged)
      setNextPageToken(cursor)
    } catch (loadError) { setError(loadError.message || 'Could not load more records.') }
    finally { if (activeSectionRef.current === section) setLoadingMore(false) }
  }

  const toggleAcademicNode = async (kind, id, path, fields) => {
    const key = `${kind}:${id}`
    const expanded = kind === 'schools' ? expandedCollege === id : kind === 'departments' ? expandedSchool === id : kind === 'programmes' ? expandedDepartment === id : false
    if (expanded) {
      if (kind === 'schools') { setExpandedCollege(''); setExpandedSchool('') }
      if (kind === 'departments') setExpandedSchool('')
      if (kind === 'programmes') setExpandedDepartment('')
      return
    }
    if (kind === 'schools') { setExpandedCollege(id); setExpandedSchool('') }
    if (kind === 'departments') { setExpandedSchool(id); setExpandedDepartment('') }
    if (kind === 'programmes') setExpandedDepartment(id)
    if (academicChildren[key]) return
    setLoadingNode(key)
    try {
      const page = session.authProvider === 'php-mysql'
        ? { documents: await listAcademicRecords(session.token, kind, id) }
        : await listCollectionPage(session.idToken, path, { pageSize: 50, fields: [...new Set([...fields, 'alias'])] })
      setAcademicChildren((current) => ({ ...current, [key]: page.documents }))
    } catch (loadError) { showNotice(loadError.message || 'Could not load academic records.') }
    finally { setLoadingNode('') }
  }

  const updateLoadedRows = (transform) => {
    const cached = sectionCache.current.get(section)
    if (cached) {
      cached.data = transform(cached.data)
      sectionCache.current.set(section, cached)
    }
    setData(transform)
  }
  const updateLoadedRow = (id, changes) => {
    updateLoadedRows((rows) => Array.isArray(rows) ? rows.map((row) => row.id === id ? { ...row, ...changes } : row) : rows)
    setSelectedUser((current) => current?.id === id ? { ...current, ...changes } : current)
  }

  const act = async (action, success, optimisticUpdate) => {
    try {
      await action()
      showNotice(success)
      if (optimisticUpdate) optimisticUpdate()
      else refresh()
    }
    catch (actionError) { showNotice(actionError.message || 'The admin action failed.') }
  }

  const confirmPaperDelete = async () => {
    if (!paperToDelete || paperDeleting) return
    setPaperDeleting(true)
    try {
      if (session.authProvider === 'php-mysql') await deleteAdminPaper(session.token, paperToDelete.id)
      else await deleteDocument(session.idToken, `papers/${paperToDelete.id}`)
      updateLoadedRows((rows) => (rows || []).filter((item) => item.id !== paperToDelete.id))
      setPaperToDelete(null)
      showNotice('Paper deleted.')
    } catch (actionError) {
      showNotice(actionError.message || 'Could not delete this paper.')
    } finally { setPaperDeleting(false) }
  }

  const giftCoins = async (user, raw = userGiftAmount) => {
    const amount = Number(raw)
    if (!Number.isInteger(amount) || amount <= 0) return showNotice('Enter a positive whole number of coins.')
    setUserActionBusy(true)
    try { await act(async () => { const updated = await giftAdminUserCoins(session.token, user.id, amount); updateLoadedRow(user.id, updated) }, `${amount} free coins gifted.`) }
    finally { setUserActionBusy(false) }
  }

  const toggleUserFlag = (user, field, success) => {
    const changes = field === 'isAdmin'
      ? { isAdmin: !userIsAdmin(user), role: userIsAdmin(user) ? 'student' : 'admin' }
      : { [field]: !user[field] }
    const payload = field === 'isAdmin' ? { isAdmin: changes.isAdmin } : { isSuspended: changes.isSuspended }
    setUserActionBusy(true)
    void act(async () => { const updated = await updateAdminUser(session.token, user.id, payload); updateLoadedRow(user.id, updated) }, success).finally(() => setUserActionBusy(false))
  }

  const openAcademicForm = (type, parentId, parentName, firestorePath) => {
    setAcademicDraft({ name: '', alias: '' })
    setAcademicFormError('')
    setAcademicForm({ type, parentId, parentName, firestorePath })
  }

  const saveAcademicRecord = async (event) => {
    event.preventDefault()
    if (!academicForm || !academicDraft.name.trim()) {
      setAcademicFormError('Enter a name for this academic record.')
      return
    }
    setAcademicSaving(true)
    setAcademicFormError('')
    try {
      let record
      if (session.authProvider === 'php-mysql') {
        record = await createAcademicRecord(session.token, academicForm.type, academicDraft.name.trim(), academicDraft.alias.trim(), academicForm.parentId)
      } else {
        const id = crypto.randomUUID().replaceAll('-', '')
        record = { id, name: academicDraft.name.trim(), alias: academicDraft.alias.trim() }
        await setDocument(session.idToken, `${academicForm.firestorePath}/${id}`, { ...record, createdAt: new Date() })
      }
      if (academicForm.type === 'colleges') updateLoadedRows((rows) => [...(Array.isArray(rows) ? rows : []), record])
      else {
        const cacheKey = `${academicForm.type}:${academicForm.parentId}`
        setAcademicChildren((current) => ({ ...current, [cacheKey]: [...(current[cacheKey] || []), record] }))
      }
      showNotice(`${academicForm.type.slice(0, -1)} added.`)
      setAcademicForm(null)
    } catch (saveError) {
      setAcademicFormError(saveError.message || 'Could not save this academic record.')
    } finally {
      setAcademicSaving(false)
    }
  }

  const openPaperReview = async (paper) => {
    setPaperEditorLoading(true)
    try {
      const complete = paper.id
        ? session.authProvider === 'php-mysql' ? await getAdminPaper(session.token, paper.id) : await getDocument(session.idToken, `papers/${paper.id}`)
        : paper
      setPaperEditor({ ...complete, programmeAssignments: Array.isArray(complete.programmeAssignments) ? complete.programmeAssignments : [], questions: Array.isArray(complete.questions) ? complete.questions : [] })
    } catch (loadError) { showNotice(loadError.message || 'Could not load the full paper for review.') }
    finally { setPaperEditorLoading(false) }
  }

  const addPaper = () => openPaperReview({ title: '', course: '', year: '', semester: '', questions: [], createdAt: new Date() })

  const handlePaperImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPaperEditorLoading(true)
    try {
      const imported = await importPaperFile(file)
      setPaperEditor(imported)
      showNotice(`Imported ${imported.questions.length} question${imported.questions.length === 1 ? '' : 's'}. Review the paper and save when ready.`)
    } catch (importError) { showNotice(importError.message || 'Could not import this paper.') }
    finally { setPaperEditorLoading(false) }
  }

  const savePaperReview = async (draft) => {
    const title = String(draft.title || '').trim()
    if (!title) return showNotice('Add a paper title before saving.')
    const phpSession = session.authProvider === 'php-mysql'
    let id = draft.id || (phpSession ? '' : crypto.randomUUID().replaceAll('-', ''))
    const now = new Date()
    const questions = (Array.isArray(draft.questions) ? draft.questions : []).map(paperQuestionForFirestore)
    // Persist extracted structured content and paper metadata only. The imported
    // file and temporary parser/source fields are never sent to the backend.
    const payload = {
      title,
      course: String(draft.course || ''),
      year: String(draft.year || ''),
      semester: String(draft.semester || ''),
      departmentId: String(draft.departmentId || ''),
      departmentName: String(draft.departmentName || ''),
      programmeAssignments: Array.isArray(draft.programmeAssignments) ? draft.programmeAssignments : [],
      questions,
      questionCount: questions.length,
      createdAt: draft.createdAt instanceof Date ? draft.createdAt : now,
      updatedAt: now,
    }
    setPaperSaving(true)
    try {
      if (phpSession) {
        const savedPaper = await saveAdminPaper(session.token, payload, id)
        id = savedPaper.id
      } else {
        await setDocument(session.idToken, `papers/${id}`, payload)
      }
      const listRow = { id, title, course: payload.course || '', year: payload.year || '', semester: payload.semester || '', departmentId: payload.departmentId, departmentName: payload.departmentName, programmeAssignments: payload.programmeAssignments, updatedAt: now, questionCount: questions.length }
      updateLoadedRows((rows) => Array.isArray(rows) ? (rows.some((row) => row.id === id) ? rows.map((row) => row.id === id ? { ...row, ...listRow } : row) : [listRow, ...rows]) : [listRow])
      setPaperEditor(null)
      showNotice(draft.id ? 'Paper review saved.' : 'Paper added to the library.')
    } catch (saveError) { showNotice(saveError.message || 'Could not save paper contents.') }
    finally { setPaperSaving(false) }
  }

  const visibleUsers = useMemo(() => (Array.isArray(data) ? data : []).filter((user) => `${user.username || ''} ${user.email || ''} ${user.phoneNumber || ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])
  const visiblePapers = useMemo(() => (Array.isArray(data) ? data : []).filter((paper) => `${paper.title || ''} ${paper.course || ''} ${paper.year || ''} ${paper.semester || ''} ${paper.departmentName || ''} ${(paper.programmeAssignments || []).map((item) => item.programmeName || '').join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search])
  const busy = loading

  if (!isAdmin) return <section className="admin-denied"><span><Icon name="lock" size={24} /></span><h1>Admin access required</h1><p>This area is available to accounts with administrator access.</p><button className="primary-button" onClick={onBack}>Back to profile</button></section>

  return <section className="admin-screen">
    <ScreenHeader kicker="LAST MINUTE · ADMIN" title="Admin panel" description="Manage the study platform and review live activity." action={<button className="admin-back" onClick={onBack}><Icon name="left" size={15} /> Back to app</button>} />
    <nav className="admin-tabs" aria-label="Admin sections">{sections.map(([id, title, icon]) => <button key={id} className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => { if (id === section) return; activeSectionRef.current = id; const cached = sectionCache.current.get(id); setData(cached?.data ?? null); setNextPageToken(cached?.nextPageToken || ''); setError(''); setLoading(!cached); setSection(id); setSearch('') }}><Icon name={icon} size={16} /><span>{title}</span></button>)}</nav>
    <div className="admin-content">
      {error && <div className="admin-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
      {busy ? <div className="content-loader"><span className="notification-spinner"/> Loading {sections.find(([id]) => id === section)?.[1].toLowerCase()}…</div> : <>
        {section === 'dashboard' && <><div className="admin-section-title"><div><span className="section-kicker">OVERVIEW</span><h2>Platform at a glance</h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15} /> Refresh</button></div><div className="admin-stats-grid"><Stat label="Registered users" value={data?.users} icon="users"/><Stat label="Question papers" value={data?.papers} icon="file" tone="blue"/><Stat label="Study groups" value={data?.groups} icon="messages" tone="violet"/></div><div className="admin-welcome"><span className="admin-stat-icon mint"><Icon name="spark" size={18}/></span><div><strong>Welcome, {profile?.username || session.name || 'Administrator'}</strong><p>Dashboard totals use Firestore aggregate counts. Open a section to load only the records needed there.</p></div></div></>}
        {section === 'users' && <><div className="admin-section-title"><div><span className="section-kicker">ACCOUNT MANAGEMENT</span><h2>Users <span className="admin-count">{visibleUsers.length} loaded</span></h2><p>Select a user to review account details and actions.</p></div><label className="admin-search"><Icon name="search" size={16}/><input placeholder="Search loaded users..." value={search} onChange={(event) => setSearch(event.target.value)}/></label></div><div className="admin-table-wrap admin-users-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>User</th><th>Coins</th><th>Status</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id} tabIndex={0} aria-haspopup="dialog" aria-label={`View ${user.username || user.email || 'user'} details`} onClick={() => { setSelectedUser(user); setUserGiftAmount('50') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedUser(user); setUserGiftAmount('50') } }}><td><div className="admin-user-cell"><span>{(user.username || user.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{user.username || 'Student'}</strong><small>{user.email || user.id}</small></div></div></td><td>{(Number(user.coinBalance)||0) + (Number(user.freeCoinBalance)||0)}</td><td><span className={`admin-badge ${user.isSuspended ? 'danger' : userIsAdmin(user) ? 'violet' : 'success'}`}>{user.isSuspended ? 'Suspended' : userIsAdmin(user) ? 'Admin' : 'Active'}</span></td></tr>)}</tbody></table>{!visibleUsers.length && <div className="admin-empty">No users match that search.</div>}</div></>}
        {section === 'papers' && <section className="admin-papers-workspace"><div className="admin-papers-heading"><div><span className="section-kicker">LIBRARY MANAGEMENT</span><h2>Paper library <span className="admin-count">{Array.isArray(data) ? data.length : 0}</span></h2><p>Review exam details, programmes, and questions from one place.</p></div><div className="admin-papers-heading-actions"><button className="admin-import-button" onClick={() => importInputRef.current?.click()}><Icon name="file" size={15}/> Import paper</button><button className="primary-button" onClick={addPaper}><Icon name="plus" size={15}/> Add paper</button></div><input ref={importInputRef} className="admin-hidden-file" type="file" accept=".docx,.pdf,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json" onChange={handlePaperImport}/></div><div className="admin-papers-toolbar"><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search papers" placeholder="Search title, course, department, or programme" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" className="admin-paper-search-clear" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13}/></button>}</label><span>{visiblePapers.length} {visiblePapers.length === 1 ? 'paper' : 'papers'} shown</span></div><div className="admin-paper-list">{visiblePapers.map((paper) => <article className="admin-paper-card" key={paper.id}><span className="admin-paper-card-icon"><Icon name="file" size={20}/></span><div className="admin-paper-card-main"><div className="admin-paper-card-title"><span className="admin-paper-type">{paper.course || 'Course not specified'}</span>{paper.year && <span className="admin-paper-year">{paper.year}</span>}</div><p><span className="admin-paper-exam-type">{paper.title || 'Untitled paper'}</span>{paper.departmentName ? ` ? ${paper.departmentName}` : ''}</p><div className="admin-paper-tags">{paper.semester && <span><Icon name="clock" size={12}/> Semester {String(paper.semester).replace(/^semester\s*/i, '')}</span>}<span><Icon name="book" size={12}/>{Number.isFinite(paper.questionCount) ? `${paper.questionCount} questions` : 'Questions not counted'}</span>{paper.programmeAssignments?.length > 0 && <span><Icon name="users" size={12}/>{paper.programmeAssignments.length} {paper.programmeAssignments.length === 1 ? 'programme' : 'programmes'}</span>}</div>{paper.programmeAssignments?.length > 0 && <div className="admin-paper-programme-list">{paper.programmeAssignments.slice(0, 3).map((assignment, index) => <span key={`${assignment.programmeId || assignment.programmeName}-${index}`}>{assignment.programmeName || 'Programme'}{assignment.studyYear ? ` ? Year ${assignment.studyYear}` : ''}</span>)}{paper.programmeAssignments.length > 3 && <span>+{paper.programmeAssignments.length - 3} more</span>}</div>}</div><div className="admin-paper-card-actions"><button className="admin-paper-review-button" onClick={() => openPaperReview(paper)}><Icon name="book" size={14}/> Review &amp; edit</button><button className="admin-paper-delete-button" onClick={() => setPaperToDelete(paper)} aria-label={`Delete ${paper.title || 'untitled paper'}`} title="Delete paper"><Icon name="trash" size={15}/></button></div></article>)}{!data?.length && <div className="admin-papers-empty"><span><Icon name="file" size={22}/></span><strong>Your paper library is empty</strong><p>Add a paper or import an existing exam to start reviewing its details and questions.</p><div><button className="admin-import-button" onClick={() => importInputRef.current?.click()}><Icon name="file" size={14}/> Import paper</button><button className="primary-button" onClick={addPaper}><Icon name="plus" size={14}/> Add paper</button></div></div>}{data?.length > 0 && !visiblePapers.length && <div className="admin-papers-empty compact"><strong>No papers match this search</strong><p>Try another title, course, department, or programme.</p><button onClick={() => setSearch('')}>Clear search</button></div>}</div></section>}
        {section === 'academics' && <><div className="admin-section-title"><div><span className="section-kicker">ACADEMIC DIRECTORY</span><h2>Academic structure <span className="admin-count">{data?.length || 0}</span></h2><p>Organize institutions, departments, and programmes in one clear directory.</p></div><button className="primary-button" onClick={() => openAcademicForm('colleges', '', 'Institution level', 'colleges')}><Icon name="plus" size={15}/> Add college</button></div><div className="admin-card-list">{(data || []).map((college) => { const schools = academicChildren[`schools:${college.id}`] || []; return <article className="admin-academic-card" key={college.id}><div className="admin-list-row"><span className="admin-row-icon violet"><Icon name="book" size={18}/></span><div><strong>{college.name || 'College'}</strong><small>{college.alias ? `Alias: ${college.alias} | ` : ''}{schools.length ? `${schools.length} schools loaded` : 'Academic institution'}</small></div><button onClick={() => toggleAcademicNode('schools', college.id, `colleges/${college.id}/schools`, ['name'])}>{loadingNode === `schools:${college.id}` ? 'Loading…' : expandedCollege === college.id ? 'Hide schools' : 'View schools'}</button><button className="academic-add-button" onClick={() => openAcademicForm('schools', college.id, college.name, `colleges/${college.id}/schools`)}>Add school</button></div>{expandedCollege === college.id && schools.map((school) => { const departments = academicChildren[`departments:${school.id}`] || []; return <div className="admin-academic-level" key={school.id}><div className="admin-school-row"><div className="admin-school-heading"><strong>{school.name || 'School'}</strong>{school.alias && <small>Alias: {school.alias}</small>}</div><div><button onClick={() => toggleAcademicNode('departments', school.id, `colleges/${college.id}/schools/${school.id}/departments`, ['name', 'code'])}>{loadingNode === `departments:${school.id}` ? 'Loading…' : expandedSchool === school.id ? 'Hide departments' : 'View departments'}</button><button className="academic-add-button" onClick={() => openAcademicForm('departments', school.id, school.name, `colleges/${college.id}/schools/${school.id}/departments`)}>Add department</button></div></div>{expandedSchool === school.id && departments.map((department) => { const programmes = academicChildren[`programmes:${department.id}`] || []; return <div className="admin-department-row" key={department.id}><div><span>{department.name || 'Department'}</span><small>{department.alias || department.code || 'No alias'}</small>{expandedDepartment === department.id && <div className="admin-programme-list">{programmes.map((programme) => <small className="admin-programme-row" key={programme.id}>{programme.name} {(programme.alias || programme.code) && "(" + (programme.alias || programme.code) + ")"}</small>)}</div>}</div><button onClick={() => toggleAcademicNode('programmes', department.id, `colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`, ['name', 'code'])}>{loadingNode === `programmes:${department.id}` ? 'Loading…' : expandedDepartment === department.id ? 'Hide programmes' : 'View programmes'}</button><button className="academic-add-button" onClick={() => openAcademicForm('programmes', department.id, department.name, `colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`)}>Add programme</button></div>})}</div>})}</article>})}{!data?.length && <div className="admin-empty">No colleges found.</div>}</div></>}
        {section === 'practice' && (session.authProvider === 'php-mysql' ? <PracticeMarkingAnalytics data={data?.marking}/> : <><div className="admin-section-title"><div><span className="section-kicker">LEARNING ACTIVITY · LATEST 25 PER STREAM</span><h2>Practice analytics</h2><p>Figures summarize the recent records shown here, not all historical activity.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-stats-grid"><Stat label="Recent marking attempts" value={data?.usage?.length} icon="spark"/><Stat label="Marked in this sample" value={data?.usage?.filter((item) => item.status === 'marked').length} icon="check" tone="blue"/><Stat label="Coins charged in sample" value={data?.usage?.reduce((sum, item) => sum + Number(item.coinsCharged || 0), 0)} icon="coins" tone="gold"/><Stat label="Unlocks in sample" value={data?.unlocks?.filter((item) => item.action === 'paper_unlock').length} icon="lock" tone="violet"/></div><div className="admin-section-title sub"><h2>Recent marking activity</h2></div><div className="admin-card-list">{(data?.usage || []).map((item) => <article className="admin-list-row" key={item.id}><span className="admin-row-icon mint"><Icon name="spark" size={17}/></span><div><strong>{item.paperTitle || 'Practice marking'}</strong><small>{item.answerCount || 0} answers · {item.status || 'pending'} · {valueDate(item.submittedAt)}</small></div><span className="admin-badge">{Number(item.coinsCharged || 0)} coins</span></article>)}{!data?.usage?.length && <div className="admin-empty">No recent marking activity.</div>}</div><div className="admin-section-title sub"><h2>Recent coin unlocks</h2></div><div className="admin-card-list">{(data?.unlocks || []).filter((item) => item.action === 'paper_unlock').map((item) => <article className="admin-list-row" key={item.id}><span className="admin-row-icon blue"><Icon name="lock" size={17}/></span><div><strong>Paper unlocked</strong><small>{item.action || 'Unlock'} · {valueDate(item.createdAt)}</small></div><span className="admin-badge">{Number(item.freeCoinsSpent || 0) + Number(item.purchasedCoinsSpent || 0)} coins</span></article>)}{!data?.unlocks?.some((item) => item.action === 'paper_unlock') && <div className="admin-empty">No paper unlocks in the recent sample.</div>}</div></>)}
        {section === 'discussions' && (session.authProvider === 'php-mysql' ? <GroupMarkingAnalytics data={data?.groupMarking}/> : <><div className="admin-section-title"><div><span className="section-kicker">COMMUNITY ACTIVITY · LATEST 50</span><h2>Group discussions</h2><p>Recent scheduled paper discussions across study groups.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-stats-grid"><Stat label="Recent plans" value={data?.length} icon="messages" tone="violet"/><Stat label="Questions planned" value={(data || []).reduce((sum, plan) => sum + Number(plan.questionCount || 0), 0)} icon="file" tone="blue"/><Stat label="Questions published" value={(data || []).reduce((sum, plan) => sum + Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1), 0)} icon="check"/></div><div className="admin-card-list">{(data || []).map((plan) => <article className="admin-list-row" key={plan.id}><span className="admin-row-icon violet"><Icon name="messages" size={18}/></span><div><strong>{plan.paperTitle || 'Group discussion'}</strong><small>{plan.course || `Group ${String(plan.groupId || '').slice(0, 8)}`} · {valueDate(plan.scheduledAt)} · Question {Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1)} of {plan.questionCount || '—'}</small></div><span className="admin-badge">Scheduled</span></article>)}</div>{!data?.length && <div className="admin-empty">No discussion plans found.</div>}</>)}
        {section === 'reports' && <><div className="admin-section-title"><div><span className="section-kicker">CONTENT QUALITY · LATEST 25</span><h2>Paper reports <span className="admin-count">{data?.length || 0} loaded</span></h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-card-list">{(data || []).map((report) => <article className="admin-report" key={report.id}><div className="admin-report-head"><div><strong>{report.paperTitle || 'Untitled paper'}</strong><small>{report.category || 'Other'} · {valueDate(report.createdAt)}</small></div><select aria-label="Report status" value={report.status || 'open'} onChange={(event) => { const status = event.target.value; act(() => patchDocument(session.idToken, `paperReports/${report.id}`, { status, updatedAt: new Date() }), 'Report status updated.', () => updateLoadedRow(report.id, { status })) }}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select></div><p>{report.details || 'No additional details.'}</p><small>Reported by {report.reporterId || 'Unknown user'}</small></article>)}{!data?.length && <div className="admin-empty">There are no paper reports.</div>}</div></>}
        {section === 'settings' && <SettingsPanel key={reload} value={data || {}} session={session} refresh={refresh} showNotice={showNotice}/>}
        {nextPageToken && ['users', 'papers', 'academics', 'reports'].includes(section) && <div className="admin-load-more"><span>Showing {Array.isArray(data) ? data.length : 0} records</span><button onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
      </>}
    </div>
    {academicForm && <div className="academic-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !academicSaving) setAcademicForm(null) }}><form className="academic-form-modal" role="dialog" aria-modal="true" aria-labelledby="academic-form-title" onSubmit={saveAcademicRecord}><header className="academic-form-header"><div><span className="section-kicker">ACADEMIC DIRECTORY</span><h2 id="academic-form-title">Add {({ colleges: 'college', schools: 'school', departments: 'department', programmes: 'programme' })[academicForm.type]}</h2><p>{academicForm.type === 'colleges' ? 'Create a top-level institution in your academic directory.' : `Add this record under ${academicForm.parentName || 'its parent record'}.`}</p></div><button type="button" className="academic-form-close" aria-label="Close form" disabled={academicSaving} onClick={() => setAcademicForm(null)}>×</button></header><div className="academic-form-fields"><label>Full name<input autoFocus required maxLength={160} value={academicDraft.name} onChange={(event) => setAcademicDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Enter the official name" /></label><label>Alias / short name <span>Optional</span><input maxLength={80} value={academicDraft.alias} onChange={(event) => setAcademicDraft((current) => ({ ...current, alias: event.target.value }))} placeholder="e.g. COM, Poly, BSc CS" /><small>Use a familiar abbreviation or short label.</small></label>{academicFormError && <p className="academic-form-error" role="alert">{academicFormError}</p>}</div><footer className="academic-form-footer"><button type="button" className="academic-cancel-button" disabled={academicSaving} onClick={() => setAcademicForm(null)}>Cancel</button><button className="primary-button" disabled={academicSaving}>{academicSaving ? 'Saving…' : 'Add record'}</button></footer></form></div>}
    {selectedUser && <div className="user-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !userActionBusy) setSelectedUser(null) }}><section className="user-detail-modal" role="dialog" aria-modal="true" aria-labelledby="user-detail-title"><header className="user-detail-header"><div className="user-detail-avatar">{(selectedUser.username || selectedUser.email || 'U').slice(0,1).toUpperCase()}</div><div className="user-detail-heading"><span className="section-kicker">ACCOUNT DETAILS</span><h2 id="user-detail-title">{selectedUser.username || 'Student'}</h2><p>{selectedUser.email || 'No email address'}</p></div><button type="button" className="academic-form-close" aria-label="Close user details" disabled={userActionBusy} onClick={() => setSelectedUser(null)}>×</button></header><div className="user-detail-status"><span className={`admin-badge ${selectedUser.isSuspended ? 'danger' : userIsAdmin(selectedUser) ? 'violet' : 'success'}`}>{selectedUser.isSuspended ? 'Suspended' : userIsAdmin(selectedUser) ? 'Admin' : 'Active account'}</span><span>{Number(selectedUser.coinBalance || 0)} purchased + {Number(selectedUser.freeCoinBalance || 0)} free coins</span></div><dl className="user-detail-fields"><div><dt>Phone</dt><dd>{selectedUser.phoneNumber || 'Not provided'}</dd></div><div><dt>Phone verification</dt><dd>{selectedUser.phoneVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt>User ID</dt><dd>{selectedUser.id}</dd></div><div><dt>Account role</dt><dd>{userIsAdmin(selectedUser) ? 'Administrator' : selectedUser.role || 'Student'}</dd></div><div><dt>College / school</dt><dd>{[selectedUser.college, selectedUser.school].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Department / programme</dt><dd>{[selectedUser.department, selectedUser.program].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Year / semester</dt><dd>{[selectedUser.yearOfStudy ? `Year ${selectedUser.yearOfStudy}` : '', selectedUser.semesterNumber ? `Semester ${selectedUser.semesterNumber}` : ''].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Account created</dt><dd>{valueDate(selectedUser.createdAt)}</dd></div></dl><div className="user-detail-actions"><h3>Account actions</h3><form className="user-gift-form" onSubmit={(event) => { event.preventDefault(); void giftCoins(selectedUser) }}><label>Gift free coins<input type="number" min="1" step="1" value={userGiftAmount} onChange={(event) => setUserGiftAmount(event.target.value)} disabled={userActionBusy}/></label><button type="submit" disabled={userActionBusy}>{userActionBusy ? 'Working...' : 'Gift coins'}</button></form><button type="button" className="user-detail-action" disabled={userActionBusy || selectedUser.id === session.userId} onClick={() => toggleUserFlag(selectedUser, 'isAdmin', userIsAdmin(selectedUser) ? 'Admin access removed.' : 'Admin access granted.')}>{userIsAdmin(selectedUser) ? 'Remove admin access' : 'Grant admin access'}</button><button type="button" className={`user-detail-action ${selectedUser.isSuspended ? '' : 'suspend'}`} disabled={userActionBusy || selectedUser.id === session.userId} onClick={() => toggleUserFlag(selectedUser, 'isSuspended', selectedUser.isSuspended ? 'Account restored.' : 'Account suspended.')}>{selectedUser.isSuspended ? 'Restore account' : 'Suspend account'}</button>{selectedUser.id === session.userId && <small className="user-detail-self-note">You cannot change your own admin or suspension status.</small>}</div></section></div>}
    {paperToDelete && <div className="paper-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !paperDeleting) setPaperToDelete(null) }}><section className="paper-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="paper-delete-title" aria-describedby="paper-delete-description"><span className="paper-delete-icon"><Icon name="file" size={21}/></span><span className="section-kicker">PAPER LIBRARY</span><h2 id="paper-delete-title">Delete this paper?</h2><p id="paper-delete-description">“{paperToDelete.title || 'Untitled paper'}” will be permanently removed from the paper library.</p><div className="paper-delete-details">{[paperToDelete.course, paperToDelete.year, paperToDelete.semester, paperToDelete.departmentName].filter(Boolean).join(' · ') || 'Paper details unavailable'}</div><footer><button type="button" className="paper-delete-cancel" disabled={paperDeleting} onClick={() => setPaperToDelete(null)}>Keep paper</button><button type="button" className="paper-delete-confirm" disabled={paperDeleting} onClick={confirmPaperDelete}>{paperDeleting ? <><span className="paper-delete-spinner"/>Deleting…</> : 'Delete paper'}</button></footer></section></div>}
    {paperEditorLoading && <div className="paper-review-backdrop"><div className="paper-review-loading"><span className="notification-spinner"/> Loading full paper...</div></div>}
    {paperEditor && <PaperReviewEditor key={paperEditor.id || 'new-paper'} paper={paperEditor} session={session} saving={paperSaving} onClose={() => { if (!paperSaving) setPaperEditor(null) }} onSave={savePaperReview}/>}
  </section>
}

function SettingsPanel({ value, session, refresh, showNotice }) {
  const [form, setForm] = useState(value)
  const save = async (event) => {
    event.preventDefault()
    const cost = Number(form.groupDiscussionMarkingCost ?? 4)
    if (!Number.isInteger(cost) || cost < 0) return showNotice('Enter a valid non-negative marking cost.')
    try {
      await patchDocument(session.idToken, 'settings/appConfiguration', { ...form, groupDiscussionMarkingCost: cost, updatedAt: new Date() })
      showNotice('App settings saved.')
      refresh()
    } catch (error) { showNotice(error.message || 'Could not save settings.') }
  }
  const update = (key, val) => setForm((current) => ({ ...current, [key]: val }))
  return <form className="admin-settings" onSubmit={save}><div className="admin-section-title"><div><span className="section-kicker">SERVICE CONTROLS</span><h2>App configuration</h2></div></div><label className="admin-setting-toggle"><span><strong>Maintenance mode</strong><small>Show a maintenance message to users.</small></span><input type="checkbox" checked={Boolean(form.maintenanceEnabled)} onChange={(event) => update('maintenanceEnabled', event.target.checked)}/></label><label className="admin-setting-field">Maintenance message<textarea maxLength={240} rows="3" value={form.maintenanceMessage || ''} onChange={(event) => update('maintenanceMessage', event.target.value)} placeholder="Explain when the app will be available again"/></label><label className="admin-setting-field">Group discussion marking cost<input type="number" min="0" step="1" value={form.groupDiscussionMarkingCost ?? 4} onChange={(event) => update('groupDiscussionMarkingCost', event.target.value)}/><small>Coins charged to the discussion creator per member response.</small></label><label className="admin-setting-toggle"><span><strong>App update notice</strong><small>Show an update message on the home screen.</small></span><input type="checkbox" checked={Boolean(form.updateEnabled)} onChange={(event) => update('updateEnabled', event.target.checked)}/></label><label className="admin-setting-field">Update message<textarea maxLength={240} rows="3" value={form.updateMessage || ''} onChange={(event) => update('updateMessage', event.target.value)} placeholder="Describe what users should update or expect"/></label><label className="admin-setting-toggle"><span><strong>Urgent update</strong><small>Mark the update notice as urgent.</small></span><input type="checkbox" checked={Boolean(form.updateUrgent)} onChange={(event) => update('updateUrgent', event.target.checked)}/></label><div className="admin-settings-actions"><button className="primary-button">Save configuration</button></div></form>
}