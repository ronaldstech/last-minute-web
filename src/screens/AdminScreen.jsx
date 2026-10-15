import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import PaperReviewEditor from '../components/admin/PaperReviewEditor.jsx'
import { countCollection, deleteDocument, getDocument, getOptionalDocument, listCollectionPage, queryCollectionGroupPage, patchDocument, setDocument, commitWrites, documentName, encodeFields } from '../services/firestore.js'
import { importPaperFile } from '../services/paperImport.js'
import './AdminScreen.css'

const sections = [
  ['dashboard', 'Dashboard', 'home'], ['users', 'Users', 'users'], ['papers', 'Papers', 'file'],
  ['academics', 'Academic structure', 'book'], ['practice', 'Practice analytics', 'spark'],
  ['discussions', 'Group discussions', 'messages'], ['reports', 'Paper reports', 'bell'], ['settings', 'App configuration', 'sliders'],
]

async function loadAdminData(section, token, pageToken = '') {
  switch (section) {
    case 'dashboard': {
      const [users, papers, groups] = await Promise.all([
        countCollection(token, 'users'), countCollection(token, 'papers'), countCollection(token, 'studyGroups'),
      ])
      return { users, papers, groups }
    }
    case 'users': return listCollectionPage(token, 'users', { pageSize: 40, pageToken, fields: ['username', 'email', 'phoneNumber', 'coinBalance', 'freeCoinBalance', 'isAdmin', 'role', 'isSuspended', 'phoneVerified'] })
    // Older papers may not have updatedAt. Ordering by it silently omits those
    // documents from Firestore results, so use the document-name order here.
    case 'papers': return listCollectionPage(token, 'papers', { pageSize: 40, pageToken, fields: ['title', 'course', 'year', 'semester', 'updatedAt', 'questionCount'] })
    case 'academics': return listCollectionPage(token, 'colleges', { pageSize: 40, pageToken, fields: ['name'] })
    case 'practice': {
      const [usage, unlocks] = await Promise.all([
        listCollectionPage(token, 'practiceMarkingUsage', { orderBy: 'submittedAt', descending: true, pageSize: 25, fields: ['paperTitle', 'answerCount', 'coinsCharged', 'status', 'submittedAt'] }),
        listCollectionPage(token, 'coinUsageEvents', { orderBy: 'createdAt', descending: true, pageSize: 25, fields: ['action', 'freeCoinsSpent', 'purchasedCoinsSpent', 'createdAt'] }),
      ])
      return { usage: usage.documents, unlocks: unlocks.documents }
    }
    case 'discussions': return queryCollectionGroupPage(token, 'plans', { orderBy: 'scheduledAt', descending: true, limit: 50, fields: ['groupId', 'paperTitle', 'course', 'scheduledAt', 'currentQuestionIndex', 'questionCount'] })
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

export default function AdminScreen({ session, profile, onBack, showNotice }) {
  const [section, setSection] = useState('dashboard')
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
  const [expandedCollege, setExpandedCollege] = useState('')
  const [expandedSchool, setExpandedSchool] = useState('')
  const [expandedDepartment, setExpandedDepartment] = useState('')
  const [academicChildren, setAcademicChildren] = useState({})
  const [loadingNode, setLoadingNode] = useState('')
  const sectionCache = useRef(new Map())
  const activeSectionRef = useRef(section)
  const importInputRef = useRef(null)
  const isAdmin = profile?.isAdmin === true || String(profile?.role || '').toLowerCase() === 'admin'

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
    loadAdminData(section, session.idToken).then((result) => {
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
  }, [section, session.idToken, reload, isAdmin])

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await loadAdminData(section, session.idToken, nextPageToken)
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
      const page = await listCollectionPage(session.idToken, path, { pageSize: 50, fields })
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
  const updateLoadedRow = (id, changes) => updateLoadedRows((rows) => Array.isArray(rows) ? rows.map((row) => row.id === id ? { ...row, ...changes } : row) : rows)

  const act = async (action, success, optimisticUpdate) => {
    try {
      await action()
      showNotice(success)
      if (optimisticUpdate) optimisticUpdate()
      else refresh()
    }
    catch (actionError) { showNotice(actionError.message || 'The admin action failed.') }
  }

  const giftCoins = async (user) => {
    const raw = window.prompt(`Free coins to gift to ${user.username || user.email || user.id}:`, '50')
    if (raw === null) return
    const amount = Number(raw)
    if (!Number.isInteger(amount) || amount <= 0) return showNotice('Enter a positive whole number of coins.')
    const id = `admin-coin-gift-${user.id}-${crypto.randomUUID().replaceAll('-', '')}`
    await act(() => commitWrites(session.idToken, [
      { transform: { document: documentName(`users/${user.id}`), fieldTransforms: [{ fieldPath: 'freeCoinBalance', increment: { integerValue: amount } }] } },
      { update: { name: documentName(`notifications/${id}`), fields: encodeFields({ title: 'You received a coin gift!', body: `The Last Minute team gifted you ${amount} free coins.`, kind: 'success', userId: user.id, createdBy: session.userId, createdAt: new Date(), details: { Gift: `${amount} free coins` }, readBy: [] }) } },
    ]), `${amount} free coins gifted.`, () => updateLoadedRow(user.id, { freeCoinBalance: Number(user.freeCoinBalance || 0) + amount }))
  }

  const toggleUserFlag = (user, field, success) => {
    const changes = field === 'isAdmin'
      ? { isAdmin: !userIsAdmin(user), role: userIsAdmin(user) ? 'student' : 'admin' }
      : { [field]: !user[field] }
    act(() => patchDocument(session.idToken, `users/${user.id}`, changes), success, () => updateLoadedRow(user.id, changes))
  }

  const addAcademicNode = (path, promptLabel, withCode = false) => {
    const name = window.prompt(promptLabel)
    if (!name?.trim()) return
    const code = withCode ? window.prompt('Short code (optional):') || '' : ''
    const id = crypto.randomUUID().replaceAll('-', '')
    act(() => setDocument(session.idToken, `${path}/${id}`, { name: name.trim(), ...(withCode ? { code: code.trim() } : {}), createdAt: new Date() }), `${promptLabel.replace(' name', '')} added.`)
  }

  const openPaperReview = async (paper) => {
    setPaperEditorLoading(true)
    try {
      const complete = paper.id ? await getDocument(session.idToken, `papers/${paper.id}`) : paper
      setPaperEditor({ ...complete, questions: Array.isArray(complete.questions) ? complete.questions : [] })
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
    const id = draft.id || crypto.randomUUID().replaceAll('-', '')
    const now = new Date()
    const questions = (Array.isArray(draft.questions) ? draft.questions : []).map(paperQuestionForFirestore)
    // Persist extracted structured content and paper metadata only. The imported
    // file and temporary parser/source fields are never written to Firestore.
    const payload = {
      title,
      course: String(draft.course || ''),
      year: String(draft.year || ''),
      semester: String(draft.semester || ''),
      questions,
      questionCount: questions.length,
      createdAt: draft.createdAt instanceof Date ? draft.createdAt : now,
      updatedAt: now,
    }
    setPaperSaving(true)
    try {
      await setDocument(session.idToken, `papers/${id}`, payload)
      const listRow = { id, title, course: payload.course || '', year: payload.year || '', semester: payload.semester || '', updatedAt: now, questionCount: questions.length }
      updateLoadedRows((rows) => Array.isArray(rows) ? (rows.some((row) => row.id === id) ? rows.map((row) => row.id === id ? { ...row, ...listRow } : row) : [listRow, ...rows]) : [listRow])
      setPaperEditor(null)
      showNotice(draft.id ? 'Paper review saved.' : 'Paper added to the library.')
    } catch (saveError) { showNotice(saveError.message || 'Could not save paper contents.') }
    finally { setPaperSaving(false) }
  }

  const visibleUsers = useMemo(() => (Array.isArray(data) ? data : []).filter((user) => `${user.username || ''} ${user.email || ''} ${user.phoneNumber || ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])
  const busy = loading

  if (!isAdmin) return <section className="admin-denied"><span><Icon name="lock" size={24} /></span><h1>Admin access required</h1><p>This area is available to accounts with administrator access.</p><button className="primary-button" onClick={onBack}>Back to profile</button></section>

  return <section className="admin-screen">
    <ScreenHeader kicker="LAST MINUTE · ADMIN" title="Admin panel" description="Manage the study platform and review live activity." action={<button className="admin-back" onClick={onBack}><Icon name="left" size={15} /> Back to app</button>} />
    <nav className="admin-tabs" aria-label="Admin sections">{sections.map(([id, title, icon]) => <button key={id} className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => { if (id === section) return; activeSectionRef.current = id; const cached = sectionCache.current.get(id); setData(cached?.data ?? null); setNextPageToken(cached?.nextPageToken || ''); setError(''); setLoading(!cached); setSection(id); setSearch('') }}><Icon name={icon} size={16} /><span>{title}</span></button>)}</nav>
    <div className="admin-content">
      {error && <div className="admin-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
      {busy ? <div className="content-loader"><span className="notification-spinner"/> Loading {sections.find(([id]) => id === section)?.[1].toLowerCase()}…</div> : <>
        {section === 'dashboard' && <><div className="admin-section-title"><div><span className="section-kicker">OVERVIEW</span><h2>Platform at a glance</h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15} /> Refresh</button></div><div className="admin-stats-grid"><Stat label="Registered users" value={data?.users} icon="users"/><Stat label="Question papers" value={data?.papers} icon="file" tone="blue"/><Stat label="Study groups" value={data?.groups} icon="messages" tone="violet"/></div><div className="admin-welcome"><span className="admin-stat-icon mint"><Icon name="spark" size={18}/></span><div><strong>Welcome, {profile?.username || session.name || 'Administrator'}</strong><p>Dashboard totals use Firestore aggregate counts. Open a section to load only the records needed there.</p></div></div></>}
        {section === 'users' && <><div className="admin-section-title"><div><span className="section-kicker">ACCOUNT MANAGEMENT</span><h2>Users <span className="admin-count">{visibleUsers.length} loaded</span></h2></div><label className="admin-search"><Icon name="search" size={16}/><input placeholder="Search loaded users…" value={search} onChange={(event) => setSearch(event.target.value)}/></label></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Phone</th><th>Coins</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="admin-user-cell"><span>{(user.username || user.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{user.username || 'Student'}</strong><small>{user.email || user.id}</small></div></div></td><td>{user.phoneNumber || '—'}</td><td>{(Number(user.coinBalance)||0) + (Number(user.freeCoinBalance)||0)}</td><td><span className={`admin-badge ${user.isSuspended ? 'danger' : userIsAdmin(user) ? 'violet' : 'success'}`}>{user.isSuspended ? 'Suspended' : userIsAdmin(user) ? 'Admin' : 'Active'}</span></td><td><div className="admin-actions"><button onClick={() => giftCoins(user)}>Gift coins</button><button disabled={user.id === session.userId} onClick={() => toggleUserFlag(user, 'isAdmin', userIsAdmin(user) ? 'Admin access removed.' : 'Admin access granted.')}>{userIsAdmin(user) ? 'Remove admin' : 'Make admin'}</button><button className="danger-action" disabled={user.id === session.userId} onClick={() => toggleUserFlag(user, 'isSuspended', user.isSuspended ? 'Account restored.' : 'Account suspended.')}>{user.isSuspended ? 'Restore' : 'Suspend'}</button></div></td></tr>)}</tbody></table>{!visibleUsers.length && <div className="admin-empty">No users match that search.</div>}</div></>}
        {section === 'papers' && <><div className="admin-section-title"><div><span className="section-kicker">LIBRARY MANAGEMENT</span><h2>Papers <span className="admin-count">{data?.length || 0} loaded</span></h2></div><label className="admin-search"><Icon name="search" size={16}/><input placeholder="Search loaded papers…" value={search} onChange={(event) => setSearch(event.target.value)}/></label><input ref={importInputRef} className="admin-hidden-file" type="file" accept=".docx,.pdf,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json" onChange={handlePaperImport}/><button className="admin-import-button" onClick={() => importInputRef.current?.click()}><Icon name="file" size={15}/> Import file</button><button className="primary-button" onClick={addPaper}><Icon name="plus" size={15}/> Add blank paper</button></div><div className="admin-card-list">{(data || []).filter((paper) => `${paper.title||''} ${paper.course||''} ${paper.year||''}`.toLowerCase().includes(search.toLowerCase())).map((paper) => <article className="admin-list-row" key={paper.id}><span className="admin-row-icon blue"><Icon name="file" size={18}/></span><div><strong>{paper.title || 'Untitled paper'}</strong><small>{[paper.course, paper.year, paper.semester, Number.isFinite(paper.questionCount) ? `${paper.questionCount} questions` : ''].filter(Boolean).join(' · ') || 'No exam details'}</small></div><button onClick={() => openPaperReview(paper)}>Review &amp; edit</button><button className="danger-action" onClick={() => { if (window.confirm(`Delete “${paper.title || 'Untitled paper'}” from the paper library?`)) act(() => deleteDocument(session.idToken, `papers/${paper.id}`), 'Paper deleted.') }}>Delete</button></article>)}{!data?.length && <div className="admin-empty">No papers have been loaded yet.</div>}{data?.length > 0 && !data.some((paper) => `${paper.title||''} ${paper.course||''} ${paper.year||''}`.toLowerCase().includes(search.toLowerCase())) && <div className="admin-empty">No papers match that search on this page. Load more papers or clear the search.</div>}</div></>}
        {section === 'academics' && <><div className="admin-section-title"><div><span className="section-kicker">ACADEMIC DIRECTORY</span><h2>Academic structure</h2></div><button className="primary-button" onClick={() => addAcademicNode('colleges', 'College name')}><Icon name="plus" size={15}/> Add college</button></div><div className="admin-card-list">{(data || []).map((college) => { const schools = academicChildren[`schools:${college.id}`] || []; return <article className="admin-academic-card" key={college.id}><div className="admin-list-row"><span className="admin-row-icon violet"><Icon name="book" size={18}/></span><div><strong>{college.name || 'College'}</strong><small>{schools.length ? `${schools.length} schools loaded` : 'Academic institution'}</small></div><button onClick={() => toggleAcademicNode('schools', college.id, `colleges/${college.id}/schools`, ['name'])}>{loadingNode === `schools:${college.id}` ? 'Loading…' : expandedCollege === college.id ? 'Hide schools' : 'View schools'}</button><button onClick={() => addAcademicNode(`colleges/${college.id}/schools`, 'School name', true)}>Add school</button></div>{expandedCollege === college.id && schools.map((school) => { const departments = academicChildren[`departments:${school.id}`] || []; return <div className="admin-academic-level" key={school.id}><div className="admin-school-row"><strong>{school.name || 'School'}</strong><div><button onClick={() => toggleAcademicNode('departments', school.id, `colleges/${college.id}/schools/${school.id}/departments`, ['name', 'code'])}>{loadingNode === `departments:${school.id}` ? 'Loading…' : expandedSchool === school.id ? 'Hide departments' : 'View departments'}</button><button onClick={() => addAcademicNode(`colleges/${college.id}/schools/${school.id}/departments`, 'Department name', true)}>Add department</button></div></div>{expandedSchool === school.id && departments.map((department) => { const programmes = academicChildren[`programmes:${department.id}`] || []; return <div className="admin-department-row" key={department.id}><div><span>{department.name || 'Department'}</span><small>{department.code || 'No code'}</small></div><button onClick={() => toggleAcademicNode('programmes', department.id, `colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`, ['name', 'code'])}>{loadingNode === `programmes:${department.id}` ? 'Loading…' : expandedDepartment === department.id ? 'Hide programmes' : 'View programmes'}</button><button onClick={() => addAcademicNode(`colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`, 'Programme name', true)}>Add programme</button>{expandedDepartment === department.id && programmes.map((programme) => <small className="admin-programme-row" key={programme.id}>{programme.name} {programme.code && `(${programme.code})`}</small>)}</div>})}</div>})}</article>})}{!data?.length && <div className="admin-empty">No colleges found in Firestore.</div>}</div></>}
        {section === 'practice' && <><div className="admin-section-title"><div><span className="section-kicker">LEARNING ACTIVITY · LATEST 25 PER STREAM</span><h2>Practice analytics</h2><p>Figures summarize the recent records shown here, not all historical activity.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-stats-grid"><Stat label="Recent marking attempts" value={data?.usage?.length} icon="spark"/><Stat label="Marked in this sample" value={data?.usage?.filter((item) => item.status === 'marked').length} icon="check" tone="blue"/><Stat label="Coins charged in sample" value={data?.usage?.reduce((sum, item) => sum + Number(item.coinsCharged || 0), 0)} icon="coins" tone="gold"/><Stat label="Unlocks in sample" value={data?.unlocks?.filter((item) => item.action === 'paper_unlock').length} icon="lock" tone="violet"/></div><div className="admin-section-title sub"><h2>Recent marking activity</h2></div><div className="admin-card-list">{(data?.usage || []).map((item) => <article className="admin-list-row" key={item.id}><span className="admin-row-icon mint"><Icon name="spark" size={17}/></span><div><strong>{item.paperTitle || 'Practice marking'}</strong><small>{item.answerCount || 0} answers · {item.status || 'pending'} · {valueDate(item.submittedAt)}</small></div><span className="admin-badge">{Number(item.coinsCharged || 0)} coins</span></article>)}{!data?.usage?.length && <div className="admin-empty">No recent marking activity.</div>}</div><div className="admin-section-title sub"><h2>Recent coin unlocks</h2></div><div className="admin-card-list">{(data?.unlocks || []).filter((item) => item.action === 'paper_unlock').map((item) => <article className="admin-list-row" key={item.id}><span className="admin-row-icon blue"><Icon name="lock" size={17}/></span><div><strong>Paper unlocked</strong><small>{item.action || 'Unlock'} · {valueDate(item.createdAt)}</small></div><span className="admin-badge">{Number(item.freeCoinsSpent || 0) + Number(item.purchasedCoinsSpent || 0)} coins</span></article>)}{!data?.unlocks?.some((item) => item.action === 'paper_unlock') && <div className="admin-empty">No paper unlocks in the recent sample.</div>}</div></>}
        {section === 'discussions' && <><div className="admin-section-title"><div><span className="section-kicker">COMMUNITY ACTIVITY · LATEST 50</span><h2>Group discussions</h2><p>Recent scheduled paper discussions across study groups.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-stats-grid"><Stat label="Recent plans" value={data?.length} icon="messages" tone="violet"/><Stat label="Questions planned" value={(data || []).reduce((sum, plan) => sum + Number(plan.questionCount || 0), 0)} icon="file" tone="blue"/><Stat label="Questions published" value={(data || []).reduce((sum, plan) => sum + Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1), 0)} icon="check"/></div><div className="admin-card-list">{(data || []).map((plan) => <article className="admin-list-row" key={plan.id}><span className="admin-row-icon violet"><Icon name="messages" size={18}/></span><div><strong>{plan.paperTitle || 'Group discussion'}</strong><small>{plan.course || `Group ${String(plan.groupId || '').slice(0, 8)}`} · {valueDate(plan.scheduledAt)} · Question {Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1)} of {plan.questionCount || '—'}</small></div><span className="admin-badge">Scheduled</span></article>)}</div>{!data?.length && <div className="admin-empty">No discussion plans found.</div>}</>}
        {section === 'reports' && <><div className="admin-section-title"><div><span className="section-kicker">CONTENT QUALITY · LATEST 25</span><h2>Paper reports <span className="admin-count">{data?.length || 0} loaded</span></h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div><div className="admin-card-list">{(data || []).map((report) => <article className="admin-report" key={report.id}><div className="admin-report-head"><div><strong>{report.paperTitle || 'Untitled paper'}</strong><small>{report.category || 'Other'} · {valueDate(report.createdAt)}</small></div><select aria-label="Report status" value={report.status || 'open'} onChange={(event) => { const status = event.target.value; act(() => patchDocument(session.idToken, `paperReports/${report.id}`, { status, updatedAt: new Date() }), 'Report status updated.', () => updateLoadedRow(report.id, { status })) }}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select></div><p>{report.details || 'No additional details.'}</p><small>Reported by {report.reporterId || 'Unknown user'}</small></article>)}{!data?.length && <div className="admin-empty">There are no paper reports.</div>}</div></>}
        {section === 'settings' && <SettingsPanel key={reload} value={data || {}} session={session} refresh={refresh} showNotice={showNotice}/>}
        {nextPageToken && ['users', 'papers', 'academics', 'reports'].includes(section) && <div className="admin-load-more"><span>Showing {Array.isArray(data) ? data.length : 0} records</span><button onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
      </>}
    </div>
    {paperEditorLoading && <div className="paper-review-backdrop"><div className="paper-review-loading"><span className="notification-spinner"/> Loading full paper...</div></div>}
    {paperEditor && <PaperReviewEditor key={paperEditor.id || 'new-paper'} paper={paperEditor} saving={paperSaving} onClose={() => { if (!paperSaving) setPaperEditor(null) }} onSave={savePaperReview}/>}
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
