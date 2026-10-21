import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import PaperReviewEditor from '../components/admin/PaperReviewEditor.jsx'
import { giftAdminUserCoins, listAdminUsers, updateAdminUser } from '../services/adminUsers.js'
import { getAdminConfiguration, saveAdminConfiguration } from '../services/adminConfiguration.js'
import { createAcademicRecord, listAcademicRecords } from '../services/adminAcademics.js'
import { deleteAdminPaper, getAdminPaper, listAdminPapers, saveAdminPaper } from '../services/adminPapers.js'
import { countCollection, deleteDocument, getDocument, getOptionalDocument, listCollectionPage, queryCollectionGroupPage, patchDocument, setDocument } from '../services/firestore.js'
import { importPaperFile } from '../services/paperImport.js'
import { loadAdminMarking } from '../services/adminMarking.js'
import { loadAdminAccountHistory } from '../services/adminAccountHistory.js'
import { getAdminGroupDetails, listAdminGroups } from '../services/adminGroups.js'
import { listAdminPaperReports, updateAdminPaperReport } from '../services/paperReports.js'
import { listAdminTransactions } from '../services/adminTransactions.js'
import './AdminScreen.css'

const sections = [
  ['dashboard', 'Dashboard', 'home'], ['users', 'Users', 'users'], ['groups', 'Study groups', 'users'], ['papers', 'Papers', 'file'],
  ['accountHistory', 'Account analytics', 'clock'], ['transactions', 'Transactions', 'coins'],
  ['academics', 'Academic structure', 'book'], ['practice', 'Practice analytics', 'spark'],
  ['discussions', 'Group discussions', 'messages'], ['reports', 'Paper reports', 'bell'], ['settings', 'App configuration', 'sliders'],
]
const ADMIN_SECTION_KEY = 'last-minute-admin-section'
const USERS_PAGE_SIZE = 20

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
    case 'groups': return phpSession
      ? listAdminGroups(token)
      : listCollectionPage(token, 'studyGroups', { pageSize: 40, pageToken, fields: ['name', 'course', 'description', 'ownerId', 'ownerName', 'memberIds', 'createdAt'] })
    case 'accountHistory': return phpSession ? loadAdminAccountHistory(token) : { unavailable: true }
    case 'transactions': return phpSession ? listAdminTransactions(token, pageToken) : { unavailable: true }
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
    case 'reports': return phpSession
      ? listAdminPaperReports(token, { cursor: pageToken })
      : listCollectionPage(token, 'paperReports', { orderBy: 'createdAt', descending: true, pageSize: 25, pageToken, fields: ['paperId', 'paperTitle', 'course', 'reporterId', 'reporterName', 'category', 'details', 'status', 'createdAt'] })
    case 'settings': return phpSession ? getAdminConfiguration(token) : (await getOptionalDocument(token, 'settings/appConfiguration')) || {}
    default: return null
  }
}

function valueDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

function valueLongDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function valueAnalyticsDate(value) {
  if (!value) return 'Date unavailable'
  const normalized = typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function userIsAdmin(user) {
  return user?.isAdmin === true || ['admin', 'super_admin'].includes(String(user?.role || '').toLowerCase())
}

function userIsSuperAdmin(user) {
  return user?.isSuperAdmin === true || String(user?.role || '').toLowerCase() === 'super_admin'
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
  const normalizeImages = (images) => Array.isArray(images) ? images.filter((image) => typeof image === 'string' || (image && typeof image === 'object')).map((image) => typeof image === 'string' ? image : ({ url: String(image.url || image.path || ''), ...(image.name ? { name: String(image.name) } : {}), ...(image.caption ? { caption: String(image.caption) } : {}) })).filter((image) => typeof image === 'string' ? image : image.url) : []
  const normalizeSubquestion = (item, subIndex = 0) => ({
    id: String(item.id || `sq-${subIndex + 1}`),
    number: String(item.number ?? String.fromCharCode(97 + subIndex)),
    text: String(item.text || ''),
    marks: item.marks === '' || item.marks === undefined || item.marks === null ? null : Number(item.marks),
    content: Array.isArray(item.content) ? item.content.map(paperContentForFirestore) : [],
    images: normalizeImages(item.images),
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
    images: normalizeImages(question.images),
    subquestions: Array.isArray(question.subquestions) ? question.subquestions.map(normalizeSubquestion) : [],
    assets: Array.isArray(question.assets) ? question.assets.filter((asset) => typeof asset === 'string' || (asset && typeof asset === 'object' && (asset.path || asset.url))).map((asset) => typeof asset === 'string' ? asset : { ...(asset.name ? { name: String(asset.name) } : {}), ...(asset.type ? { type: String(asset.type) } : {}), ...(asset.path ? { path: String(asset.path) } : {}), ...(asset.url ? { url: String(asset.url) } : {}), ...(asset.caption ? { caption: String(asset.caption) } : {}) }) : [],
    source_location: { page_start: cleanPage(source.page_start ?? source.pageStart), page_end: cleanPage(source.page_end ?? source.pageEnd) },
  }
}

function Stat({ label, value, icon, tone = 'mint' }) {
  return <article className="admin-stat"><span className={`admin-stat-icon ${tone}`}><Icon name={icon} size={19} /></span><div><small>{label}</small><strong>{Number(value || 0).toLocaleString()}</strong></div></article>
}

function AccountHistoryAnalytics({ data, onRefresh }) {
  const [search, setSearch] = useState('')
  const [activityTab, setActivityTab] = useState('accounts')
  const users = (data?.users || []).filter((user) => `${user.username || ''} ${user.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const summary = data?.summary || {}
  if (data?.unavailable) return <><div className="admin-section-title"><div><span className="section-kicker">SYSTEM COINS · MYSQL ACCOUNTS</span><h2>Account history analytics</h2><p>This detailed account analytics view is available for accounts using the MySQL backend.</p></div></div></>
  return <>
    <div className="admin-section-title"><div><span className="section-kicker">SYSTEM COINS · ALL ACCOUNTS</span><h2>Account history analytics</h2><p>System wide unlock and top up totals, with lifetime activity for every account.</p></div><button className="notification-refresh" onClick={onRefresh}><Icon name="clock" size={15}/> Refresh</button></div>
    <div className="admin-stats-grid"><Stat label="Registered accounts" value={summary.users} icon="users"/><Stat label="Users unlocking papers" value={summary.usersUnlocking} icon="lock" tone="blue"/><Stat label="Paper unlock events" value={summary.unlocks} icon="file" tone="violet"/><Stat label="Currently active unlocks" value={summary.activeUnlocks} icon="clock" tone="mint"/><Stat label="Coins spent on unlocks" value={summary.totalCoinsSpent} icon="coins" tone="gold"/><Stat label="Free coins spent" value={summary.freeCoinsSpent} icon="coins" tone="blue"/><Stat label="Purchased coins spent" value={summary.purchasedCoinsSpent} icon="coins" tone="violet"/><Stat label="Successful top ups" value={summary.successfulTopUps} icon="check" tone="mint"/><Stat label="Top up value (MWK)" value={summary.topUpAmountMwk} icon="coins" tone="gold"/><Stat label="Coins added by top ups" value={summary.coinsAdded} icon="plus" tone="blue"/></div>
    <div className="account-analytics-tabs" role="tablist" aria-label="Account activity views"><button type="button" role="tab" aria-selected={activityTab === 'accounts'} className={activityTab === 'accounts' ? 'active' : ''} onClick={() => setActivityTab('accounts')}><Icon name="users" size={16}/><span>Activity by account</span><b>{users.length.toLocaleString()}</b></button><button type="button" role="tab" aria-selected={activityTab === 'latest'} className={activityTab === 'latest' ? 'active' : ''} onClick={() => setActivityTab('latest')}><Icon name="clock" size={16}/><span>Latest account activity</span><b>{(data?.events || []).length.toLocaleString()}</b></button></div>
    <section className="account-analytics-panel" role="tabpanel" hidden={activityTab !== 'accounts'}>
    <div className="admin-section-title sub"><div><h2>Activity by account <span className="admin-count">{users.length} users</span></h2><p>Totals include successful unlocks and paid, credited top ups.</p></div><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search account analytics" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)}/></label></div>
    <div className="admin-table-wrap"><table className="admin-table account-activity-table"><thead><tr><th>Account</th><th>Unlocks</th><th>Free spent</th><th>Purchased spent</th><th>Top ups</th><th>Paid value (MWK)</th><th>Last unlock</th><th>Balance</th></tr></thead><tbody>{users.map((user) => <tr key={user.userId}><td><div className="admin-user-cell"><span>{(user.username || user.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{user.username || 'Student'}</strong><small>{user.email || user.userId}</small></div></div></td><td>{Number(user.unlockCount || 0).toLocaleString()}</td><td>{Number(user.freeCoinsSpent || 0).toLocaleString()}</td><td>{Number(user.purchasedCoinsSpent || 0).toLocaleString()}</td><td>{Number(user.topUpCount || 0).toLocaleString()}</td><td>{Number(user.topUpAmountMwk || 0).toLocaleString()}</td><td>{valueAnalyticsDate(user.lastUnlockedAt)}</td><td>{(Number(user.coinBalance || 0) + Number(user.freeCoinBalance || 0)).toLocaleString()}</td></tr>)}</tbody></table>{!users.length && <div className="admin-empty">No accounts match that search.</div>}</div>
    </section><section className="account-analytics-panel" role="tabpanel" hidden={activityTab !== 'latest'}>
    <div className="admin-section-title sub"><div><h2>Latest account activity</h2><p>Recent paper unlocks and wallet top ups, including failed transactions.</p></div></div>
    <div className="admin-table-wrap"><table className="admin-table latest-activity-table"><thead><tr><th>Activity</th><th>Account</th><th>Details</th><th>Free coins used</th><th>Purchased coins used</th><th>Amount (MWK)</th><th>Status</th><th>Date</th></tr></thead><tbody>{(data?.events || []).map((event) => { const unlocked = event.action === 'paper_unlock'; const failed = event.status === 'failed'; const freeSpent = Number(event.freeCoinsSpent || 0); const purchasedSpent = Number(event.purchasedCoinsSpent || 0); return <tr key={event.id}><td><span className={`admin-badge ${unlocked ? 'violet' : 'success'}`}>{unlocked ? 'Paper unlock' : 'Coin top up'}</span></td><td><div className="admin-user-cell"><span>{(event.username || event.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{event.username || `User ${event.userId}`}</strong><small>{event.email || event.userId}</small></div></div></td><td>{unlocked ? (event.course || event.paperTitle || 'Paper unlock') : failed ? (event.failureReason || event.paperTitle || 'Payment was not completed') : 'Successful top up'}</td><td>{unlocked ? <span className={`coin-usage-label ${freeSpent ? 'used' : ''}`}>{freeSpent ? `Used · ${freeSpent.toLocaleString()}` : 'Not used'}</span> : '—'}</td><td>{unlocked ? <span className={`coin-usage-label ${purchasedSpent ? 'used' : ''}`}>{purchasedSpent ? `Used · ${purchasedSpent.toLocaleString()}` : 'Not used'}</span> : '—'}</td><td>{unlocked ? '—' : `${Number(event.amountMwk || 0).toLocaleString()} MWK`}</td><td><span className={`admin-badge ${failed ? 'danger' : 'success'}`}>{failed ? 'Failed' : 'Successful'}</span></td><td>{valueAnalyticsDate(event.createdAt)}</td></tr> })}</tbody></table>{!data?.events?.length && <div className="admin-empty">No account activity recorded yet.</div>}</div>
    </section>
  </>
}

function GroupMarkingAnalytics({ data }) {
  const [activeView, setActiveView] = useState('usage')
  const summary = data?.summary || {}
  const groups = data?.groups || []
  const events = data?.events || []
  return <section className="group-marking-analytics">
    <div className="admin-section-title sub"><div><span className="section-kicker">STUDY GROUPS · MYSQL MARKER</span><h2>Group marking analytics</h2><p>One usage record is stored for each member answer sent to the AI marker.</p></div></div>
    <div className="admin-stats-grid"><Stat label="Answer marking attempts" value={summary.attempts} icon="spark"/><Stat label="Groups using marking" value={summary.groupsUsed} icon="users" tone="blue"/><Stat label="Facilitators" value={summary.facilitators} icon="user" tone="violet"/><Stat label="Successfully marked" value={summary.marked} icon="check" tone="mint"/><Stat label="Failed attempts" value={summary.failed} icon="bell" tone="gold"/><Stat label="Coins spent" value={summary.coinsSpent} icon="coins" tone="gold"/><Stat label="Average awarded marks" value={summary.averageScore} icon="book" tone="blue"/></div>
    <div className="account-analytics-tabs discussion-analytics-tabs" role="tablist" aria-label="Group discussion analytics"><button type="button" role="tab" aria-selected={activeView === 'usage'} className={activeView === 'usage' ? 'active' : ''} onClick={() => setActiveView('usage')}><Icon name="users" size={16}/><span>Usage by group</span><b>{groups.length.toLocaleString()}</b></button><button type="button" role="tab" aria-selected={activeView === 'attempts'} className={activeView === 'attempts' ? 'active' : ''} onClick={() => setActiveView('attempts')}><Icon name="spark" size={16}/><span>Recent group marking</span><b>{events.length.toLocaleString()}</b></button></div>
    {activeView === 'usage' ? <section className="account-analytics-panel"><div className="admin-section-title sub"><h2>Usage by group</h2></div><div className="admin-table-wrap discussion-analytics-table-wrap"><table className="admin-table discussion-analytics-table"><thead><tr><th>Study group</th><th>Answer attempts</th><th>Discussions</th><th>Facilitators</th><th>Marked</th><th>Failed</th><th>Last used</th></tr></thead><tbody>{groups.map((item) => <tr key={item.groupId}><td>{item.groupName || `Group ${item.groupId}`}</td><td>{Number(item.attempts || 0).toLocaleString()}</td><td>{Number(item.discussions || 0).toLocaleString()}</td><td>{Number(item.facilitators || 0).toLocaleString()}</td><td>{Number(item.marked || 0).toLocaleString()}</td><td>{Number(item.failed || 0).toLocaleString()}</td><td>{valueAnalyticsDate(item.lastUsed)}</td></tr>)}</tbody></table>{!groups.length && <div className="admin-empty">No group marking activity recorded yet.</div>}</div></section> : <section className="account-analytics-panel"><div className="admin-section-title sub"><h2>Recent group marking attempts</h2></div><div className="admin-table-wrap discussion-analytics-table-wrap"><table className="admin-table discussion-analytics-table"><thead><tr><th>Group</th><th>Paper</th><th>Course</th><th>Facilitator</th><th>Question</th><th>Score</th><th>Coins charged</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{events.map((item) => <tr key={item.id}><td>{item.groupName || `Group ${item.groupId || ''}`}</td><td>{item.paperTitle || 'Paper discussion'}</td><td>{item.course || '—'}</td><td>{item.facilitator || 'Unknown'}</td><td>{item.questionNumber || '—'}</td><td>{item.score === null ? 'Not marked' : `${item.score} / ${item.maxMarks}`}</td><td>{Number(item.coinsCharged || 0).toLocaleString()}</td><td><span className={`admin-badge ${item.status === 'marked' ? 'success' : item.status === 'failed' ? 'danger' : ''}`}>{item.status || 'pending'}</span></td><td>{valueAnalyticsDate(item.createdAt)}</td></tr>)}</tbody></table>{!events.length && <div className="admin-empty">No recent group marking attempts.</div>}</div></section>}
  </section>
}

function PracticeMarkingAnalytics({ data }) {
  const summary = data?.summary || {}
  const events = data?.events || []
  return <>
    <div className="admin-section-title"><div><span className="section-kicker">INDIVIDUAL PRACTICE · MYSQL MARKER</span><h2>Practice analytics</h2><p>Single user practice marking activity and outcomes.</p></div></div>
    <div className="admin-stats-grid"><Stat label="Answer attempts" value={summary.attempts} icon="spark"/><Stat label="Students using marking" value={summary.users} icon="users" tone="blue"/><Stat label="Successfully marked" value={summary.marked} icon="check" tone="mint"/><Stat label="Failed attempts" value={summary.failed} icon="bell" tone="gold"/><Stat label="Coins spent" value={summary.coinsSpent} icon="coins" tone="gold"/><Stat label="Average score (%)" value={summary.averagePercentage} icon="book" tone="violet"/></div>
    <div className="admin-section-title sub"><h2>Recent individual marking attempts</h2></div>
    <div className="admin-table-wrap practice-analytics-table-wrap"><table className="admin-table practice-analytics-table"><thead><tr><th>Student</th><th>Paper</th><th>Course</th><th>Year</th><th>Question</th><th>Score</th><th>Coins charged</th><th>Status</th><th>Marker</th><th>Submitted</th></tr></thead><tbody>{events.map((item) => <tr key={item.id}><td>{item.username || `User ${item.userId}`}</td><td>{item.paperTitle || 'Practice marking'}</td><td>{item.course || '—'}</td><td>{item.year || '—'}</td><td>{item.questionNumber || '—'}</td><td>{item.score === null ? 'Not marked' : `${item.score} / ${item.maxMarks}`}</td><td>{Number(item.coinsCharged || 0).toLocaleString()}</td><td><span className={`admin-badge ${item.status === 'marked' ? 'success' : item.status === 'failed' ? 'danger' : ''}`}>{item.status || 'pending'}</span></td><td>{item.model || 'AI marker'}</td><td>{valueAnalyticsDate(item.createdAt)}</td></tr>)}</tbody></table>{!events.length && <div className="admin-empty">No individual practice marking activity recorded yet.</div>}</div>
  </>
}

export default function AdminScreen({ session, profile, onBack, onSessionExpired, showNotice }) {
  const [section, setSection] = useState(readAdminSection)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [userTablePage, setUserTablePage] = useState(0)
  const [nextPageToken, setNextPageToken] = useState('')
  const [totalUserCount, setTotalUserCount] = useState(null)
  const [totalTransactionCount, setTotalTransactionCount] = useState(null)
  const [transactionStatus, setTransactionStatus] = useState('all')
  const [loadingMore, setLoadingMore] = useState(false)
  const [paperEditor, setPaperEditor] = useState(null)
  const [paperEditorLoading, setPaperEditorLoading] = useState(false)
  const [paperSaving, setPaperSaving] = useState(false)
  const [paperToDelete, setPaperToDelete] = useState(null)
  const [paperDeleting, setPaperDeleting] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupDetails, setGroupDetails] = useState(null)
  const [groupDetailsLoading, setGroupDetailsLoading] = useState(false)
  const [groupDetailsError, setGroupDetailsError] = useState('')
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
  const groupDetailsRequestRef = useRef(0)
  const isAdmin = userIsAdmin(profile)
  const isSuperAdmin = userIsSuperAdmin(profile)

  useEffect(() => {
    try { localStorage.setItem(ADMIN_SECTION_KEY, section) } catch { /* Keep the screen usable without storage. */ }
  }, [section])

  useEffect(() => { setUserTablePage(0) }, [section, search, reload])

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

  useEffect(() => {
    if (!selectedGroup) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !groupDetailsLoading) setSelectedGroup(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedGroup, groupDetailsLoading])

  const openGroupDetails = async (group) => {
    const requestId = ++groupDetailsRequestRef.current
    setSelectedGroup(group)
    setGroupDetails(null)
    setGroupDetailsError('')
    setGroupDetailsLoading(true)
    try {
      if (session.authProvider === 'php-mysql') {
        const details = await getAdminGroupDetails(session.token, group.id)
        if (requestId === groupDetailsRequestRef.current) setGroupDetails(details)
      } else {
        const ids = Array.isArray(group.memberIds) ? group.memberIds.map(String) : []
        const results = await Promise.allSettled(ids.map((id) => getOptionalDocument(session.idToken, `users/${id}`)))
        const members = results.map((result, index) => result.status === 'fulfilled' && result.value
          ? { ...result.value, id: result.value.id || ids[index] }
          : { id: ids[index], username: 'Student profile unavailable' })
        if (requestId === groupDetailsRequestRef.current) setGroupDetails({ ...group, memberCount: ids.length, members })
      }
    } catch (detailsError) {
      if (requestId === groupDetailsRequestRef.current) setGroupDetailsError(detailsError.message || 'Could not load group details.')
    } finally { if (requestId === groupDetailsRequestRef.current) setGroupDetailsLoading(false) }
  }

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
        sectionCache.current.set(section, { data: resultData, nextPageToken: cursor, totalCount: result.totalCount })
        setData(resultData)
        setNextPageToken(cursor)
        if (section === 'users' && paged) setTotalUserCount(result.totalCount)
        if (section === 'transactions' && paged) setTotalTransactionCount(result.totalCount)
        setError('')
      }
    }).catch((loadError) => {
      if (!active) return
      if (loadError.status === 401 && session.authProvider === 'php-mysql') {
        onSessionExpired?.()
        return
      }
      setError(loadError.message || 'Could not load this admin section.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [section, session.authProvider, session.idToken, session.token, search, reload, isAdmin, onSessionExpired])

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return false
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
      return rows.length > 0
    } catch (loadError) { setError(loadError.message || 'Could not load more records.'); return false }
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
  const pageUsers = visibleUsers.slice(userTablePage * USERS_PAGE_SIZE, (userTablePage + 1) * USERS_PAGE_SIZE)
  const usersPageFrom = visibleUsers.length ? userTablePage * USERS_PAGE_SIZE + 1 : 0
  const usersPageTo = Math.min((userTablePage + 1) * USERS_PAGE_SIZE, visibleUsers.length)
  const hasNextUserPage = (userTablePage + 1) * USERS_PAGE_SIZE < visibleUsers.length || Boolean(nextPageToken)
  const nextUserPage = async () => {
    if ((userTablePage + 1) * USERS_PAGE_SIZE < visibleUsers.length) {
      setUserTablePage((page) => page + 1)
      return
    }
    if (nextPageToken && await loadMore()) setUserTablePage((page) => page + 1)
  }
  const visibleGroups = useMemo(() => (Array.isArray(data) ? data : []).filter((group) => `${group.name || ''} ${group.course || ''} ${group.ownerName || ''} ${group.ownerId || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search])
  const visiblePapers = useMemo(() => (Array.isArray(data) ? data : []).filter((paper) => `${paper.title || ''} ${paper.course || ''} ${paper.year || ''} ${paper.semester || ''} ${paper.departmentName || ''} ${(paper.programmeAssignments || []).map((item) => item.programmeName || '').join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search])
  const visibleTransactions = useMemo(() => (Array.isArray(data) ? data : []).filter((transaction) => (transactionStatus === 'all' || transaction.status === transactionStatus) && `${transaction.chargeId || ''} ${transaction.username || ''} ${transaction.email || ''} ${transaction.mobile || ''} ${transaction.operatorName || ''} ${transaction.txRef || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search, transactionStatus])
  const busy = loading

  useEffect(() => {
    if (!mobileSidebarOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileSidebarOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileSidebarOpen])

  if (!isAdmin) return <section className="admin-denied"><span><Icon name="lock" size={24} /></span><h1>Admin access required</h1><p>This area is available to accounts with administrator access.</p><button className="primary-button" onClick={onBack}>Back to profile</button></section>

  return <section className={`admin-screen${mobileSidebarOpen ? ' mobile-sidebar-open' : ''}`}>
    <ScreenHeader kicker="LAST MINUTE · ADMIN" title="Admin panel" description="Manage the study platform and review live activity." action={<div className="admin-header-actions"><button type="button" className="admin-mobile-menu" aria-label={mobileSidebarOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={mobileSidebarOpen} aria-controls="admin-sections-sidebar" onClick={() => setMobileSidebarOpen((open) => !open)}><Icon name={mobileSidebarOpen ? 'close' : 'menu'} size={17}/><span>{mobileSidebarOpen ? 'Close menu' : 'Menu'}</span></button><button className="admin-back" onClick={onBack}><Icon name="left" size={15} /> Back to app</button></div>} />
    <nav id="admin-sections-sidebar" className="admin-tabs" aria-label="Admin sections"><a className="admin-sidebar-brand" href="#admin" onClick={(event) => event.preventDefault()}><img src="/logo.png" alt=""/><span><strong>Last Minute</strong><small>ADMIN CONSOLE</small></span></a><div className="admin-sidebar-label">WORKSPACE</div>{sections.map(([id, title, icon]) => <button key={id} className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => { setMobileSidebarOpen(false); if (id === section) return; activeSectionRef.current = id; const cached = sectionCache.current.get(id); setData(cached?.data ?? null); setNextPageToken(cached?.nextPageToken || ''); setError(''); setLoading(!cached); setSection(id); setSearch('') }}><Icon name={icon} size={16} /><span>{title}</span>{section === id && <Icon name="right" size={13}/>}</button>)}<div className="admin-sidebar-spacer"/><div className="admin-sidebar-user"><span>{(profile?.username || session.name || session.email || 'A').trim().slice(0,1).toUpperCase()}</span><div><strong>{profile?.username || session.name || 'Administrator'}</strong><small>Admin account</small></div><Icon name="lock" size={14}/></div></nav>
    {mobileSidebarOpen && <button type="button" className="admin-mobile-sidebar-backdrop" aria-label="Close admin menu" onClick={() => setMobileSidebarOpen(false)}/>}
    <div className="admin-content">
      {error && <div className="admin-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
      {busy ? <div className="content-loader"><span className="notification-spinner"/> Loading {sections.find(([id]) => id === section)?.[1].toLowerCase()}…</div> : <>
        {section === 'dashboard' && <><div className="admin-section-title"><div><span className="section-kicker">OVERVIEW</span><h2>Platform at a glance</h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15} /> Refresh</button></div><div className="admin-stats-grid"><Stat label="Registered users" value={data?.users} icon="users"/><Stat label="Question papers" value={data?.papers} icon="file" tone="blue"/><Stat label="Study groups" value={data?.groups} icon="messages" tone="violet"/></div><div className="admin-welcome"><span className="admin-stat-icon mint"><Icon name="spark" size={18}/></span><div><strong>Welcome, {profile?.username || session.name || 'Administrator'}</strong><p>Dashboard totals use Firestore aggregate counts. Open a section to load only the records needed there.</p></div></div></>}
        {section === 'users' && <><div className="admin-section-title"><div><span className="section-kicker">ACCOUNT MANAGEMENT</span><h2>Users <span className="admin-count">{Number(totalUserCount ?? visibleUsers.length).toLocaleString()} total</span></h2><p>Browse accounts in small batches. Select a row to review account details and actions.</p></div><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search loaded users" placeholder="Search loaded users..." value={search} onChange={(event) => { setSearch(event.target.value); setUserTablePage(0) }}/></label></div><div className="admin-table-wrap admin-users-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>User</th><th className="admin-user-responsive-phone">Phone</th><th className="admin-user-responsive-role">Role</th><th className="admin-user-responsive-verified">Phone verified</th><th>Free coins</th><th>Purchased coins</th><th className="admin-user-responsive-created">Joined</th><th>Status</th></tr></thead><tbody>{pageUsers.map((user) => <tr key={user.id} tabIndex={0} aria-haspopup="dialog" aria-label={`View ${user.username || user.email || 'user'} details`} onClick={() => { setSelectedUser(user); setUserGiftAmount('50') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedUser(user); setUserGiftAmount('50') } }}><td><div className="admin-user-cell"><span>{(user.username || user.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{user.username || 'Student'}</strong><small>{user.email || user.id}</small></div></div></td><td className="admin-user-responsive-phone">{user.phoneNumber || '—'}</td><td className="admin-user-responsive-role"><span className={`admin-badge ${userIsAdmin(user) ? 'violet' : ''}`}>{userIsSuperAdmin(user) ? 'Super admin' : userIsAdmin(user) ? 'Admin' : 'Student'}</span></td><td className="admin-user-responsive-verified"><span className={`admin-badge ${user.phoneVerified ? 'success' : ''}`}>{user.phoneVerified ? 'Verified' : 'Not verified'}</span></td><td>{Number(user.freeCoinBalance || 0).toLocaleString()}</td><td>{Number(user.coinBalance || 0).toLocaleString()}</td><td className="admin-user-responsive-created">{valueLongDate(user.createdAt)}</td><td><span className={`admin-badge ${user.isSuspended ? 'danger' : 'success'}`}>{user.isSuspended ? 'Suspended' : 'Active'}</span></td></tr>)}</tbody></table>{!visibleUsers.length && <div className="admin-empty">No users match that search.</div>}</div><div className="admin-users-pagination"><span>Showing {usersPageFrom}–{usersPageTo} of {visibleUsers.length}{nextPageToken ? '+' : ''}</span><div><button type="button" onClick={() => setUserTablePage((page) => Math.max(0, page - 1))} disabled={userTablePage === 0 || loadingMore}>Previous</button><span>Page {userTablePage + 1}</span><button type="button" onClick={nextUserPage} disabled={!hasNextUserPage || loadingMore}>{loadingMore ? 'Loading…' : 'Next'}</button></div></div></>}
        {section === 'accountHistory' && <AccountHistoryAnalytics data={data} onRefresh={refresh}/>}
        {section === 'transactions' && (session.authProvider !== 'php-mysql' ? <div className="admin-empty">Transaction history is available for accounts using the MySQL backend.</div> : <>
          <div className="admin-section-title"><div><span className="section-kicker">WALLET MANAGEMENT</span><h2>Transactions <span className="admin-count">{Number(totalTransactionCount ?? data?.length ?? 0).toLocaleString()} total</span></h2><p>Review wallet top ups across all accounts, including pending, paid, and failed transactions.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div>
          <div className="transaction-toolbar"><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search transactions" placeholder="Search user, phone, operator, or reference" value={search} onChange={(event) => setSearch(event.target.value)}/></label><label className="transaction-status-filter">Status<select aria-label="Filter transactions by status" value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option></select></label></div>
          <div className="admin-table-wrap transactions-table-wrap"><table className="admin-table transactions-table"><thead><tr><th>Transaction</th><th>Account</th><th>Provider</th><th>Mobile</th><th>Coins</th><th>Amount</th><th>Status</th><th>Details</th><th>Created</th></tr></thead><tbody>{visibleTransactions.map((transaction) => <tr key={transaction.chargeId}><td><strong>{transaction.chargeId}</strong><small>{transaction.txRef ? `Ref: ${transaction.txRef}` : 'No provider reference'}</small></td><td><div className="admin-user-cell"><span>{(transaction.username || transaction.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{transaction.username || 'Student'}</strong><small>{transaction.email || `User ${transaction.userId}`}</small></div></div></td><td>{transaction.operatorName || transaction.operatorId || '—'}</td><td>{transaction.mobile || '—'}</td><td>{Number(transaction.coins || 0).toLocaleString()}</td><td>{Number(transaction.amountMwk || 0).toLocaleString()} MWK</td><td><span className={`admin-badge ${transaction.status === 'paid' ? 'success' : transaction.status === 'failed' ? 'danger' : ''}`}>{transaction.status || 'pending'}{transaction.credited ? ' · credited' : ''}</span></td><td className="transaction-failure-detail">{transaction.failureReason || (transaction.status === 'paid' && transaction.credited ? 'Coins credited' : '—')}</td><td>{valueAnalyticsDate(transaction.createdAt)}</td></tr>)}</tbody></table>{!visibleTransactions.length && <div className="admin-empty">{data?.length ? 'No transactions match these filters.' : 'No wallet transactions recorded yet.'}</div>}</div>
          {Array.isArray(data) && <div className="transaction-results-count">Showing {visibleTransactions.length.toLocaleString()} of {data.length.toLocaleString()} loaded transactions{totalTransactionCount !== null && totalTransactionCount > data.length ? ` · ${Number(totalTransactionCount).toLocaleString()} total` : ''}</div>}
        </>)}
        {section === 'papers' && <section className="admin-papers-workspace"><div className="admin-papers-heading"><div><span className="section-kicker">LIBRARY MANAGEMENT</span><h2>Paper library <span className="admin-count">{Array.isArray(data) ? data.length : 0}</span></h2><p>Review exam details, programmes, and questions from one place.</p></div><div className="admin-papers-heading-actions"><button className="admin-import-button" onClick={() => importInputRef.current?.click()}><Icon name="file" size={15}/> Import paper</button><button className="primary-button" onClick={addPaper}><Icon name="plus" size={15}/> Add paper</button></div><input ref={importInputRef} className="admin-hidden-file" type="file" accept=".docx,.pdf,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json" onChange={handlePaperImport}/></div><div className="admin-papers-toolbar"><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search papers" placeholder="Search title, course, department, or programme" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button type="button" className="admin-paper-search-clear" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13}/></button>}</label><span>{visiblePapers.length} {visiblePapers.length === 1 ? 'paper' : 'papers'} shown</span></div><div className="admin-paper-list">{visiblePapers.map((paper) => <article className="admin-paper-card" key={paper.id}><span className="admin-paper-card-icon"><Icon name="file" size={20}/></span><div className="admin-paper-card-main"><div className="admin-paper-card-title"><span className="admin-paper-type">{paper.course || 'Course not specified'}</span>{paper.year && <span className="admin-paper-year">{paper.year}</span>}</div><p><span className="admin-paper-exam-type">{paper.title || 'Untitled paper'}</span>{paper.departmentName ? ` ? ${paper.departmentName}` : ''}</p><div className="admin-paper-tags">{paper.semester && <span><Icon name="clock" size={12}/> Semester {String(paper.semester).replace(/^semester\s*/i, '')}</span>}<span><Icon name="book" size={12}/>{Number.isFinite(paper.questionCount) ? `${paper.questionCount} questions` : 'Questions not counted'}</span>{paper.programmeAssignments?.length > 0 && <span><Icon name="users" size={12}/>{paper.programmeAssignments.length} {paper.programmeAssignments.length === 1 ? 'programme' : 'programmes'}</span>}</div>{paper.programmeAssignments?.length > 0 && <div className="admin-paper-programme-list">{paper.programmeAssignments.slice(0, 3).map((assignment, index) => <span key={`${assignment.programmeId || assignment.programmeName}-${index}`}>{assignment.programmeName || 'Programme'}{assignment.studyYear ? ` ? Year ${assignment.studyYear}` : ''}</span>)}{paper.programmeAssignments.length > 3 && <span>+{paper.programmeAssignments.length - 3} more</span>}</div>}</div><div className="admin-paper-card-actions"><button className="admin-paper-review-button" onClick={() => openPaperReview(paper)}><Icon name="book" size={14}/> Review &amp; edit</button>{isSuperAdmin && <button className="admin-paper-delete-button" onClick={() => setPaperToDelete(paper)} aria-label={`Delete ${paper.title || 'untitled paper'}`} title="Delete paper"><Icon name="trash" size={15}/></button>}</div></article>)}{!data?.length && <div className="admin-papers-empty"><span><Icon name="file" size={22}/></span><strong>Your paper library is empty</strong><p>Add a paper or import an existing exam to start reviewing its details and questions.</p><div><button className="admin-import-button" onClick={() => importInputRef.current?.click()}><Icon name="file" size={14}/> Import paper</button><button className="primary-button" onClick={addPaper}><Icon name="plus" size={14}/> Add paper</button></div></div>}{data?.length > 0 && !visiblePapers.length && <div className="admin-papers-empty compact"><strong>No papers match this search</strong><p>Try another title, course, department, or programme.</p><button onClick={() => setSearch('')}>Clear search</button></div>}</div></section>}
        {section === 'academics' && <><div className="admin-section-title"><div><span className="section-kicker">ACADEMIC DIRECTORY</span><h2>Academic structure <span className="admin-count">{data?.length || 0}</span></h2><p>Browse institutions in a clear hierarchy. Expand rows to view schools, departments, and programmes.</p></div><button className="primary-button" onClick={() => openAcademicForm('colleges', '', 'Institution level', 'colleges')}><Icon name="plus" size={15}/> Add college</button></div><div className="admin-table-wrap academic-directory-wrap"><table className="admin-table academic-directory-table"><thead><tr><th>Institution / academic unit</th><th>Alias</th><th>Level</th><th>Actions</th></tr></thead><tbody>{(data || []).map((college) => { const schools = academicChildren[`schools:${college.id}`] || []; return <Fragment key={college.id}><tr className="academic-directory-college"><td><strong><Icon name="book" size={16}/>{college.name || 'College'}</strong></td><td>{college.alias || '—'}</td><td><span className="admin-badge violet">College</span></td><td><div className="academic-directory-actions"><button onClick={() => toggleAcademicNode('schools', college.id, `colleges/${college.id}/schools`, ['name'])}>{loadingNode === `schools:${college.id}` ? 'Loading…' : expandedCollege === college.id ? 'Hide schools' : 'View schools'}</button><button className="academic-add-button" onClick={() => openAcademicForm('schools', college.id, college.name, `colleges/${college.id}/schools`)}><Icon name="plus" size={13}/> Add school</button></div></td></tr>{expandedCollege === college.id && schools.map((school) => { const departments = academicChildren[`departments:${school.id}`] || []; return <Fragment key={school.id}><tr className="academic-directory-school"><td><strong>{school.name || 'School'}</strong></td><td>{school.alias || '—'}</td><td><span className="admin-badge">School</span></td><td><div className="academic-directory-actions"><button onClick={() => toggleAcademicNode('departments', school.id, `colleges/${college.id}/schools/${school.id}/departments`, ['name', 'code'])}>{loadingNode === `departments:${school.id}` ? 'Loading…' : expandedSchool === school.id ? 'Hide departments' : 'View departments'}</button><button className="academic-add-button" onClick={() => openAcademicForm('departments', school.id, school.name, `colleges/${college.id}/schools/${school.id}/departments`)}><Icon name="plus" size={13}/> Add department</button></div></td></tr>{expandedSchool === school.id && departments.map((department) => { const programmes = academicChildren[`programmes:${department.id}`] || []; return <Fragment key={department.id}><tr className="academic-directory-department"><td><strong>{department.name || 'Department'}</strong></td><td>{department.alias || department.code || '—'}</td><td><span className="admin-badge success">Department</span></td><td><div className="academic-directory-actions"><button onClick={() => toggleAcademicNode('programmes', department.id, `colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`, ['name', 'code'])}>{loadingNode === `programmes:${department.id}` ? 'Loading…' : expandedDepartment === department.id ? 'Hide programmes' : 'View programmes'}</button><button className="academic-add-button" onClick={() => openAcademicForm('programmes', department.id, department.name, `colleges/${college.id}/schools/${school.id}/departments/${department.id}/programmes`)}><Icon name="plus" size={13}/> Add programme</button></div></td></tr>{expandedDepartment === department.id && programmes.map((programme) => <tr className="academic-directory-programme" key={programme.id}><td><strong>{programme.name || 'Programme'}</strong></td><td>{programme.alias || programme.code || '—'}</td><td><span className="admin-badge">Programme</span></td><td>Under {department.name || 'department'}</td></tr>)}</Fragment>})}</Fragment>})}</Fragment>})}{!data?.length && <tr><td colSpan="4"><div className="admin-empty">No colleges found. Add an institution to get started.</div></td></tr>}</tbody></table></div></>}
        {section === 'practice' && (session.authProvider === 'php-mysql' ? <PracticeMarkingAnalytics data={data?.marking}/> : <>
          <div className="admin-section-title"><div><span className="section-kicker">LEARNING ACTIVITY · LATEST 25 PER STREAM</span><h2>Practice analytics</h2><p>Figures summarize the recent records shown here, not all historical activity.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div>
          <div className="admin-stats-grid"><Stat label="Recent marking attempts" value={data?.usage?.length} icon="spark"/><Stat label="Marked in this sample" value={data?.usage?.filter((item) => item.status === 'marked').length} icon="check" tone="blue"/><Stat label="Coins charged in sample" value={data?.usage?.reduce((sum, item) => sum + Number(item.coinsCharged || 0), 0)} icon="coins" tone="gold"/><Stat label="Unlocks in sample" value={data?.unlocks?.filter((item) => item.action === 'paper_unlock').length} icon="lock" tone="violet"/></div>
          <div className="admin-section-title sub"><h2>Recent marking activity</h2></div>
          <div className="admin-table-wrap practice-analytics-table-wrap"><table className="admin-table practice-analytics-table"><thead><tr><th>Paper</th><th>Answers</th><th>Coins charged</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{(data?.usage || []).map((item) => <tr key={item.id}><td>{item.paperTitle || 'Practice marking'}</td><td>{Number(item.answerCount || 0).toLocaleString()}</td><td>{Number(item.coinsCharged || 0).toLocaleString()}</td><td><span className={`admin-badge ${item.status === 'marked' ? 'success' : item.status === 'failed' ? 'danger' : ''}`}>{item.status || 'pending'}</span></td><td>{valueAnalyticsDate(item.submittedAt)}</td></tr>)}</tbody></table>{!data?.usage?.length && <div className="admin-empty">No recent marking activity.</div>}</div>
          <div className="admin-section-title sub"><h2>Recent coin unlocks</h2></div>
          <div className="admin-table-wrap practice-analytics-table-wrap"><table className="admin-table practice-analytics-table"><thead><tr><th>Activity</th><th>Free coins used</th><th>Purchased coins used</th><th>Unlocked</th></tr></thead><tbody>{(data?.unlocks || []).filter((item) => item.action === 'paper_unlock').map((item) => <tr key={item.id}><td>Paper unlock</td><td>{Number(item.freeCoinsSpent || 0).toLocaleString()}</td><td>{Number(item.purchasedCoinsSpent || 0).toLocaleString()}</td><td>{valueAnalyticsDate(item.createdAt)}</td></tr>)}</tbody></table>{!data?.unlocks?.some((item) => item.action === 'paper_unlock') && <div className="admin-empty">No paper unlocks in the recent sample.</div>}</div>
        </>)}
        {section === 'groups' && <><div className="admin-section-title"><div><span className="section-kicker">COMMUNITY MANAGEMENT</span><h2>Study groups <span className="admin-count">{visibleGroups.length} loaded</span></h2><p>Open a group to review its details and members.</p></div><label className="admin-search"><Icon name="search" size={16}/><input aria-label="Search study groups" placeholder="Search groups or owners" value={search} onChange={(event) => setSearch(event.target.value)}/></label></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Group</th><th>Owner</th><th>Members</th><th>Created</th><th>Description</th></tr></thead><tbody>{visibleGroups.map((group) => <tr key={group.id} className="admin-group-row" tabIndex={0} aria-haspopup="dialog" aria-label={`View ${group.name || 'study group'} details`} onClick={() => openGroupDetails(group)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGroupDetails(group) } }}><td><strong>{group.name || 'Untitled group'}</strong><small className="admin-group-course">{group.course || 'No subject specified'}</small></td><td>{group.ownerName || group.ownerId || 'Unknown'}</td><td>{Number(group.memberCount ?? group.memberIds?.length ?? 0)}</td><td>{valueDate(group.createdAt)}</td><td className="admin-group-description">{group.description || '—'}</td></tr>)}</tbody></table>{!visibleGroups.length && <div className="admin-empty">No groups match this search.</div>}</div></>}
        {section === 'discussions' && (session.authProvider === 'php-mysql' ? <GroupMarkingAnalytics data={data?.groupMarking}/> : <>
          <div className="admin-section-title"><div><span className="section-kicker">COMMUNITY ACTIVITY · LATEST 50</span><h2>Group discussions</h2><p>Recent scheduled paper discussions across study groups.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div>
          <div className="admin-stats-grid"><Stat label="Recent plans" value={data?.length} icon="messages" tone="violet"/><Stat label="Questions planned" value={(data || []).reduce((sum, plan) => sum + Number(plan.questionCount || 0), 0)} icon="file" tone="blue"/><Stat label="Questions published" value={(data || []).reduce((sum, plan) => sum + Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1), 0)} icon="check"/></div>
          <div className="admin-section-title sub"><h2>Scheduled paper discussions</h2></div>
          <div className="admin-table-wrap discussion-analytics-table-wrap"><table className="admin-table discussion-analytics-table"><thead><tr><th>Study group</th><th>Paper</th><th>Course</th><th>Scheduled</th><th>Questions published</th><th>Total questions</th><th>Status</th></tr></thead><tbody>{(data || []).map((plan) => { const published = Math.max(0, Number(plan.currentQuestionIndex ?? -1) + 1); return <tr key={plan.id}><td>{plan.groupName || `Group ${String(plan.groupId || '').slice(0, 8)}`}</td><td>{plan.paperTitle || 'Paper discussion'}</td><td>{plan.course || '—'}</td><td>{valueAnalyticsDate(plan.scheduledAt)}</td><td>{published}</td><td>{Number(plan.questionCount || 0)}</td><td><span className="admin-badge success">Scheduled</span></td></tr> })}</tbody></table>{!data?.length && <div className="admin-empty">No discussion plans found.</div>}</div>
        </>)}
        {section === 'reports' && <>
          <div className="admin-section-title"><div><span className="section-kicker">CONTENT QUALITY · LATEST 25</span><h2>Paper reports <span className="admin-count">{data?.length || 0} loaded</span></h2><p>Review learner reports and update their status.</p></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15}/> Refresh</button></div>
          <div className="admin-table-wrap reports-table-wrap"><table className="admin-table reports-table"><thead><tr><th>Paper</th><th>Course</th><th>Category</th><th>Report details</th><th>Reported by</th><th>Submitted</th><th>Status</th></tr></thead><tbody>{(data || []).map((report) => <tr key={report.id}><td><strong>{report.paperTitle || 'Untitled paper'}</strong></td><td>{report.course || '—'}</td><td>{report.category || 'Other'}</td><td className="report-details-cell">{report.details || 'No additional details.'}</td><td>{report.reporterName || report.reporterId || 'Unknown user'}</td><td>{valueAnalyticsDate(report.createdAt)}</td><td><select className={`report-status-select report-status-${report.status || 'open'}`} aria-label={`Status for report about ${report.paperTitle || 'untitled paper'}`} value={report.status || 'open'} onChange={(event) => { const status = event.target.value; const update = session.authProvider === 'php-mysql' ? updateAdminPaperReport(session.token, report.id, status) : patchDocument(session.idToken, `paperReports/${report.id}`, { status, updatedAt: new Date() }); act(() => update, 'Report status updated.', () => updateLoadedRow(report.id, { status })) }}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select></td></tr>)}</tbody></table>{!data?.length && <div className="admin-empty">There are no paper reports.</div>}</div>
        </>}
        {section === 'settings' && <SettingsPanel key={reload} value={data || {}} session={session} refresh={refresh} showNotice={showNotice}/>}
        {nextPageToken && ['groups', 'papers', 'academics', 'reports', 'transactions'].includes(section) && <div className="admin-load-more"><span>{section === 'transactions' ? `Showing ${Array.isArray(data) ? data.length : 0} of ${Number(totalTransactionCount || 0).toLocaleString()} transactions` : `Showing ${Array.isArray(data) ? data.length : 0} records`}</span><button onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
      </>}
    </div>
    {academicForm && <div className="academic-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !academicSaving) setAcademicForm(null) }}><form className="academic-form-modal" role="dialog" aria-modal="true" aria-labelledby="academic-form-title" onSubmit={saveAcademicRecord}><header className="academic-form-header"><div><span className="section-kicker">ACADEMIC DIRECTORY</span><h2 id="academic-form-title">Add {({ colleges: 'college', schools: 'school', departments: 'department', programmes: 'programme' })[academicForm.type]}</h2><p>{academicForm.type === 'colleges' ? 'Create a top-level institution in your academic directory.' : `Add this record under ${academicForm.parentName || 'its parent record'}.`}</p></div><button type="button" className="academic-form-close" aria-label="Close form" disabled={academicSaving} onClick={() => setAcademicForm(null)}>×</button></header><div className="academic-form-fields"><label>Full name<input autoFocus required maxLength={160} value={academicDraft.name} onChange={(event) => setAcademicDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Enter the official name" /></label><label>Alias / short name <span>Optional</span><input maxLength={80} value={academicDraft.alias} onChange={(event) => setAcademicDraft((current) => ({ ...current, alias: event.target.value }))} placeholder="e.g. COM, Poly, BSc CS" /><small>Use a familiar abbreviation or short label.</small></label>{academicFormError && <p className="academic-form-error" role="alert">{academicFormError}</p>}</div><footer className="academic-form-footer"><button type="button" className="academic-cancel-button" disabled={academicSaving} onClick={() => setAcademicForm(null)}>Cancel</button><button className="primary-button" disabled={academicSaving}>{academicSaving ? 'Saving…' : 'Add record'}</button></footer></form></div>}
    {selectedUser && <div className="user-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !userActionBusy) setSelectedUser(null) }}><section className="user-detail-modal" role="dialog" aria-modal="true" aria-labelledby="user-detail-title"><header className="user-detail-header"><div className="user-detail-avatar">{(selectedUser.username || selectedUser.email || 'U').slice(0,1).toUpperCase()}</div><div className="user-detail-heading"><span className="section-kicker">ACCOUNT DETAILS</span><h2 id="user-detail-title">{selectedUser.username || 'Student'}</h2><p>{selectedUser.email || 'No email address'}</p></div><button type="button" className="academic-form-close" aria-label="Close user details" disabled={userActionBusy} onClick={() => setSelectedUser(null)}>×</button></header><div className="user-detail-status"><span className={`admin-badge ${selectedUser.isSuspended ? 'danger' : userIsAdmin(selectedUser) ? 'violet' : 'success'}`}>{selectedUser.isSuspended ? 'Suspended' : userIsSuperAdmin(selectedUser) ? 'Super admin' : userIsAdmin(selectedUser) ? 'Admin' : 'Active account'}</span><span>{Number(selectedUser.coinBalance || 0)} purchased + {Number(selectedUser.freeCoinBalance || 0)} free coins</span></div><dl className="user-detail-fields"><div><dt>Phone</dt><dd>{selectedUser.phoneNumber || 'Not provided'}</dd></div><div><dt>Phone verification</dt><dd>{selectedUser.phoneVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt>User ID</dt><dd>{selectedUser.id}</dd></div><div><dt>Account role</dt><dd>{userIsSuperAdmin(selectedUser) ? 'Super administrator' : userIsAdmin(selectedUser) ? 'Administrator' : selectedUser.role || 'Student'}</dd></div><div><dt>College / school</dt><dd>{[selectedUser.college, selectedUser.school].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Department / programme</dt><dd>{[selectedUser.department, selectedUser.program].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Year / semester</dt><dd>{[selectedUser.yearOfStudy ? `Year ${selectedUser.yearOfStudy}` : '', selectedUser.semesterNumber ? `Semester ${selectedUser.semesterNumber}` : ''].filter(Boolean).join(' / ') || 'Not provided'}</dd></div><div><dt>Account created</dt><dd>{valueDate(selectedUser.createdAt)}</dd></div></dl><div className="user-detail-actions"><h3>Account actions</h3>{isSuperAdmin && <form className="user-gift-form" onSubmit={(event) => { event.preventDefault(); void giftCoins(selectedUser) }}><label>Gift free coins<input type="number" min="1" step="1" value={userGiftAmount} onChange={(event) => setUserGiftAmount(event.target.value)} disabled={userActionBusy}/></label><button type="submit" disabled={userActionBusy}>{userActionBusy ? 'Working...' : 'Gift coins'}</button></form>}{isSuperAdmin && !userIsSuperAdmin(selectedUser) && <button type="button" className="user-detail-action" disabled={userActionBusy || selectedUser.id === session.userId} onClick={() => toggleUserFlag(selectedUser, 'isAdmin', userIsAdmin(selectedUser) ? 'Admin access removed.' : 'Admin access granted.')}>{userIsAdmin(selectedUser) ? 'Remove admin access' : 'Grant admin access'}</button>}<button type="button" className={`user-detail-action ${selectedUser.isSuspended ? '' : 'suspend'}`} disabled={userActionBusy || selectedUser.id === session.userId} onClick={() => toggleUserFlag(selectedUser, 'isSuspended', selectedUser.isSuspended ? 'Account restored.' : 'Account suspended.')}>{selectedUser.isSuspended ? 'Restore account' : 'Suspend account'}</button>{selectedUser.id === session.userId && <small className="user-detail-self-note">You cannot change your own admin or suspension status.</small>}</div></section></div>}
    {paperToDelete && <div className="paper-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !paperDeleting) setPaperToDelete(null) }}><section className="paper-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="paper-delete-title" aria-describedby="paper-delete-description"><span className="paper-delete-icon"><Icon name="file" size={21}/></span><span className="section-kicker">PAPER LIBRARY</span><h2 id="paper-delete-title">Delete this paper?</h2><p id="paper-delete-description">“{paperToDelete.title || 'Untitled paper'}” will be permanently removed from the paper library.</p><div className="paper-delete-details">{[paperToDelete.course, paperToDelete.year, paperToDelete.semester, paperToDelete.departmentName].filter(Boolean).join(' · ') || 'Paper details unavailable'}</div><footer><button type="button" className="paper-delete-cancel" disabled={paperDeleting} onClick={() => setPaperToDelete(null)}>Keep paper</button><button type="button" className="paper-delete-confirm" disabled={paperDeleting} onClick={confirmPaperDelete}>{paperDeleting ? <><span className="paper-delete-spinner"/>Deleting…</> : 'Delete paper'}</button></footer></section></div>}
    {paperEditorLoading && <div className="paper-review-backdrop"><div className="paper-review-loading"><span className="notification-spinner"/> Loading full paper...</div></div>}
    {selectedGroup && <div className="admin-group-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !groupDetailsLoading) setSelectedGroup(null) }}><section className="admin-group-detail-modal" role="dialog" aria-modal="true" aria-labelledby="admin-group-detail-title"><header className="admin-group-detail-header"><span className="admin-group-detail-icon"><Icon name="users" size={21}/></span><div><span className="section-kicker">STUDY GROUP DETAILS</span><h2 id="admin-group-detail-title">{groupDetails?.name || selectedGroup.name || 'Study group'}</h2><p>{groupDetails?.course || selectedGroup.course || 'No subject specified'}</p></div><button type="button" className="academic-form-close" aria-label="Close group details" disabled={groupDetailsLoading} onClick={() => setSelectedGroup(null)}>×</button></header>{groupDetailsLoading ? <div className="admin-group-detail-state"><span className="notification-spinner"/>Loading group and member details…</div> : groupDetailsError ? <div className="admin-group-detail-error" role="alert">{groupDetailsError}</div> : groupDetails && <><p className="admin-group-detail-description">{groupDetails.description || 'No group description was provided.'}</p><dl className="admin-group-detail-fields"><div><dt>Created by</dt><dd>{groupDetails.ownerName || groupDetails.ownerId || 'Unknown'}</dd></div>{groupDetails.ownerEmail && <div><dt>Owner email</dt><dd>{groupDetails.ownerEmail}</dd></div>}<div><dt>Created</dt><dd>{valueDate(groupDetails.createdAt)}</dd></div><div><dt>Group ID</dt><dd>{groupDetails.id}</dd></div><div><dt>Members</dt><dd>{Number(groupDetails.memberCount ?? groupDetails.members?.length ?? 0)}</dd></div></dl><div className="admin-group-members-heading"><h3>Members</h3><span>{groupDetails.members?.length || 0}</span></div><div className="admin-group-members">{(groupDetails.members || []).map((member) => <article className="admin-group-member" key={member.id}><span className="admin-group-member-avatar">{(member.username || member.email || 'S').slice(0,1).toUpperCase()}</span><div><strong>{member.username || 'Student'}</strong><small>{member.email || `User ID: ${member.id}`}</small></div><small className="admin-group-member-date">Joined {valueDate(member.joinedAt)}</small></article>)}{!groupDetails.members?.length && <div className="admin-empty">No member details are available.</div>}</div></>}</section></div>}
    {paperEditor && <PaperReviewEditor key={paperEditor.id || 'new-paper'} paper={paperEditor} session={session} saving={paperSaving} onClose={() => { if (!paperSaving) setPaperEditor(null) }} onSave={savePaperReview}/>}
  </section>
}

function SettingsPanel({ value, session, refresh, showNotice }) {
  const [form, setForm] = useState({ paperUnlockDailyCost: 20, paperUnlockWeeklyCost: 100, practiceMarkingCostPerQuestion: 2, groupDiscussionMarkingCostPerResponse: 4, ...value })
  const [saving, setSaving] = useState(false)
  const save = async (event) => {
    event.preventDefault()
    const cost = Number(form.groupDiscussionMarkingCost ?? 4)
    if (!Number.isInteger(cost) || cost < 0) return showNotice('Enter a valid non-negative marking cost.')
    if (form.maintenanceEnabled && !form.maintenanceMessage?.trim()) return showNotice('Add a maintenance message before enabling maintenance mode.')
    if (form.updateEnabled && !form.updateMessage?.trim()) return showNotice('Add an update message before enabling the notice.')
    try {
      setSaving(true)
      const configuration = { ...form, groupDiscussionMarkingCost: cost, practiceMarkingCostPerQuestion: Number(form.practiceMarkingCostPerQuestion ?? 2), paperUnlockDailyCost: Number(form.paperUnlockDailyCost ?? 20), paperUnlockWeeklyCost: Number(form.paperUnlockWeeklyCost ?? 100), groupDiscussionMarkingCostPerResponse: Number(form.groupDiscussionMarkingCostPerResponse ?? form.groupDiscussionMarkingCost ?? 4) }
      if ([configuration.paperUnlockDailyCost, configuration.paperUnlockWeeklyCost, configuration.practiceMarkingCostPerQuestion, configuration.groupDiscussionMarkingCostPerResponse].some((amount) => !Number.isInteger(amount) || amount < 0 || amount > 100000)) return showNotice('Enter whole coin costs from 0 to 100,000.')
      if (session.authProvider === 'php-mysql') await saveAdminConfiguration(session.token, configuration)
      else await patchDocument(session.idToken, 'settings/appConfiguration', { ...configuration, updatedAt: new Date() })
      showNotice('App settings saved.')
      refresh()
    } catch (error) { showNotice(error.message || 'Could not save settings.') } finally { setSaving(false) }
  }
  const update = (key, val) => setForm((current) => ({ ...current, [key]: val }))
  return <div className="admin-settings-page">
    <header className="admin-settings-hero"><div className="admin-settings-hero-icon"><Icon name="settings" size={22}/></div><div><span className="section-kicker">APP CONTROLS</span><h2>App configuration</h2><p>Manage service availability, coin prices, marking costs, and messages shown to students.</p></div><span className="admin-settings-available">5 configurable areas</span></header>
    <section className="admin-settings-overview" aria-label="Available configuration features">
      <article><span className="admin-settings-overview-icon green"><Icon name="settings" size={17}/></span><div><strong>Service availability</strong><p>Maintenance mode and its user-facing message.</p><small>2 settings</small></div></article>
      <article><span className="admin-settings-overview-icon blue"><Icon name="coins" size={17}/></span><div><strong>Paper access</strong><p>Set the cost for one day or one week of access.</p><small>2 settings</small></div></article>
      <article><span className="admin-settings-overview-icon gold"><Icon name="spark" size={17}/></span><div><strong>Practice marking</strong><p>Coins charged for each question sent for marking.</p><small>1 setting</small></div></article>
      <article><span className="admin-settings-overview-icon blue"><Icon name="users" size={17}/></span><div><strong>Group discussions</strong><p>Coins charged per member response marked.</p><small>1 setting</small></div></article>
      <article><span className="admin-settings-overview-icon violet"><Icon name="bell" size={17}/></span><div><strong>App update notice</strong><p>Notice visibility, message, and urgency.</p><small>3 settings</small></div></article>
    </section>
    <form className="admin-settings" onSubmit={save}>
      <section className="admin-settings-card"><div className="admin-settings-card-heading"><span className="admin-settings-overview-icon green"><Icon name="settings" size={17}/></span><div><h3>Service availability</h3><p>Control the maintenance notice shown to users.</p></div><span className={`admin-badge ${form.maintenanceEnabled ? 'danger' : 'success'}`}>{form.maintenanceEnabled ? 'Maintenance on' : 'Service active'}</span></div>
        <label className="admin-setting-toggle"><span><strong>Maintenance mode</strong><small>Show a maintenance message to users.</small></span><input type="checkbox" checked={Boolean(form.maintenanceEnabled)} onChange={(event) => update('maintenanceEnabled', event.target.checked)}/></label>
        <label className="admin-setting-field">Maintenance message<textarea maxLength={240} rows="3" value={form.maintenanceMessage || ''} onChange={(event) => update('maintenanceMessage', event.target.value)} placeholder="Explain when the app will be available again"/><small>{(form.maintenanceMessage || '').length}/240 characters</small></label>
      </section>
      <section className="admin-settings-card"><div className="admin-settings-card-heading"><span className="admin-settings-overview-icon blue"><Icon name="coins" size={17}/></span><div><h3>Paper access</h3><p>Choose the coin price for temporary access to a paper.</p></div></div>
        <div className="admin-pricing-fields"><label className="admin-setting-field">One day access<input type="number" min="0" max="100000" step="1" value={form.paperUnlockDailyCost ?? 20} onChange={(event) => update('paperUnlockDailyCost', event.target.value)}/><small>Coins for 24 hours of access.</small></label><label className="admin-setting-field">One week access<input type="number" min="0" max="100000" step="1" value={form.paperUnlockWeeklyCost ?? 100} onChange={(event) => update('paperUnlockWeeklyCost', event.target.value)}/><small>Coins for 7 days of access.</small></label></div>
      </section>
      <section className="admin-settings-card"><div className="admin-settings-card-heading"><span className="admin-settings-overview-icon gold"><Icon name="spark" size={17}/></span><div><h3>Practice marking</h3><p>Set the coin cost for individual practice questions marked with AI.</p></div></div>
        <label className="admin-setting-field">Cost per question<input type="number" min="0" max="100000" step="1" value={form.practiceMarkingCostPerQuestion ?? 2} onChange={(event) => update('practiceMarkingCostPerQuestion', event.target.value)}/><small>Charged to the student for each successfully marked question.</small></label>
      </section>
      <section className="admin-settings-card"><div className="admin-settings-card-heading"><span className="admin-settings-overview-icon blue"><Icon name="users" size={17}/></span><div><h3>Group discussions</h3><p>Set the coin cost charged to the discussion creator when responses are marked.</p></div></div>
        <label className="admin-setting-field">Cost per member response<input type="number" min="0" max="100000" step="1" value={form.groupDiscussionMarkingCostPerResponse ?? form.groupDiscussionMarkingCost ?? 4} onChange={(event) => update('groupDiscussionMarkingCostPerResponse', event.target.value)}/><small>Charged once for each response successfully marked.</small></label>
      </section>
      <section className="admin-settings-card"><div className="admin-settings-card-heading"><span className="admin-settings-overview-icon violet"><Icon name="bell" size={17}/></span><div><h3>App update notice</h3><p>Publish an update message on the home screen and flag urgent updates.</p></div><span className={`admin-badge ${form.updateEnabled ? 'success' : ''}`}>{form.updateEnabled ? 'Visible' : 'Hidden'}</span></div>
        <label className="admin-setting-toggle"><span><strong>Show update notice</strong><small>Display the update message on the home screen.</small></span><input type="checkbox" checked={Boolean(form.updateEnabled)} onChange={(event) => update('updateEnabled', event.target.checked)}/></label>
        <label className="admin-setting-field">Update message<textarea maxLength={240} rows="3" value={form.updateMessage || ''} onChange={(event) => update('updateMessage', event.target.value)} placeholder="Describe what users should update or expect"/><small>{(form.updateMessage || '').length}/240 characters</small></label>
        <label className="admin-setting-toggle"><span><strong>Urgent update</strong><small>Emphasize the notice as requiring prompt attention.</small></span><input type="checkbox" checked={Boolean(form.updateUrgent)} onChange={(event) => update('updateUrgent', event.target.checked)}/></label>
      </section>
      <div className="admin-settings-actions"><span>Changes take effect after saving.</span><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</button></div>
    </form>
  </div>
}
