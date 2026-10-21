import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { listMyTransactions } from '../services/studyRepository.js'
import { loadWallet } from '../services/walletApi.js'
import { API_BASE_URL } from '../services/apiConfig.js'
import './HistoryScreen.css'

function dateTime(value) {
  if (!value) return 'Date unavailable'
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const successful = (status) => ['paid', 'success', 'successful', 'completed'].includes(String(status || '').toLowerCase())
const historyFilters = { 'Paper unlocks': 'unlock', 'Practice marking': 'marking', 'Coin top ups': 'topup' }

export default function HistoryScreen({ session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All activity')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const accountRequest = session.authProvider === 'php-mysql'
      ? fetch(`${API_BASE_URL}/history`, { headers: { Authorization: `Bearer ${session.token}` } }).then(async (response) => {
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(result.message || 'Could not load account history.')
          return { unlocks: result.unlocks || [], marking: result.marking || [] }
        })
      : Promise.resolve({ unlocks: [], marking: [] })
    const walletRequest = session.authProvider === 'php-mysql'
      ? loadWallet(session.token).then((wallet) => wallet.transactions || [])
      : listMyTransactions(session.idToken, session.userId)
    Promise.all([accountRequest, walletRequest]).then(([history, transactions]) => {
      if (!active) return
      setEntries([
        ...history.unlocks.map((entry) => ({ ...entry, type: 'unlock', date: entry.createdAt })),
        ...history.marking.map((entry) => ({ ...entry, type: 'marking', date: entry.createdAt })),
        ...transactions.map((entry) => ({ ...entry, type: 'topup', date: entry.createdAt || entry.updatedAt })),
      ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    }).catch((loadError) => { if (active) setError(loadError.message || 'Could not load account history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  const filtered = useMemo(() => filter === 'All activity' ? entries : entries.filter((entry) => entry.type === historyFilters[filter]), [entries, filter])
  const totalUnlocks = entries.filter((entry) => entry.type === 'unlock').length
  const markingEntries = entries.filter((entry) => entry.type === 'marking')
  const coinsUsed = entries.reduce((sum, entry) => sum + (entry.type === 'unlock'
    ? Number(entry.freeCoinsSpent || 0) + Number(entry.purchasedCoinsSpent || 0)
    : entry.type === 'marking' ? Number(entry.coinsCharged || 0) : 0), 0)
  const totalTopups = entries.filter((entry) => entry.type === 'topup' && successful(entry.status)).length

  return <div className="history-screen">
    <ScreenHeader kicker="YOUR ACCOUNT" title="Account history" description="Review your paper unlocks, practice marking, coin use, and top ups." />
    <div className="history-stats">
      <article><span className="history-stat-icon violet"><Icon name="lock" size={16}/></span><div><small>Paper unlocks</small><strong>{totalUnlocks}</strong></div></article>
      <article><span className="history-stat-icon gold"><Icon name="spark" size={16}/></span><div><small>Practice marks</small><strong>{markingEntries.length}</strong></div></article>
      <article><span className="history-stat-icon gold"><Icon name="coins" size={16}/></span><div><small>Coins used</small><strong>{coinsUsed}</strong></div></article>
      <article><span className="history-stat-icon mint"><Icon name="coins" size={16}/></span><div><small>Successful top ups</small><strong>{totalTopups}</strong></div></article>
    </div>
    <section className="history-panel"><div className="history-toolbar"><div><h2>Recent activity</h2><p>Practice entries include the question, result, and coins charged.</p></div><div className="history-filters" aria-label="Filter account history">{['All activity', 'Paper unlocks', 'Practice marking', 'Coin top ups'].map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      {loading ? <div className="history-empty">Loading your account history…</div> : error ? <div className="history-error" role="alert">{error}</div> : filtered.length ? <div className="history-list">{filtered.map((entry, index) => {
        const unlock = entry.type === 'unlock'
        const marking = entry.type === 'marking'
        const paid = successful(entry.status)
        const spent = Number(entry.freeCoinsSpent || 0) + Number(entry.purchasedCoinsSpent || 0)
        const markingStatus = String(entry.status || 'pending').replaceAll('_', ' ')
        const details = unlock
          ? [entry.paperTitle && entry.paperTitle !== entry.course ? entry.paperTitle : '', entry.year && `Year ${entry.year}`].filter(Boolean).join(' · ') || 'Paper access'
          : marking
            ? [entry.paperTitle || entry.course || 'Practice paper', entry.questionNumber ? `Question ${entry.questionNumber}` : '', entry.score !== null && entry.score !== undefined ? `${entry.score} / ${entry.maxMarks} marks` : markingStatus].filter(Boolean).join(' · ')
            : [entry.operatorName || 'Mobile money', `${Number(entry.coins || 0)} coins`, entry.status || 'pending'].join(' · ')
        return <article className="history-entry" key={`${entry.type}-${entry.id || entry.chargeId || index}`}><span className={`history-entry-icon ${unlock ? 'violet' : 'gold'}`}><Icon name={unlock ? 'lock' : marking ? 'spark' : 'coins'} size={17}/></span><div className="history-entry-copy"><strong>{unlock ? (entry.course || entry.paperTitle || 'Paper unlocked') : marking ? 'Practice marking' : 'Coin top up'}</strong><small>{details}</small><time dateTime={entry.date || undefined}>{dateTime(entry.date)}</time>{unlock && <small className="history-breakdown">{Number(entry.freeCoinsSpent || 0)} free + {Number(entry.purchasedCoinsSpent || 0)} purchased coins · access until {dateTime(entry.expiresAt)}</small>}</div><strong className={`history-amount ${unlock || marking ? 'spent' : paid ? 'received' : ''}`}>{unlock ? `−${spent} coins` : marking ? `−${Number(entry.coinsCharged || 0)} coins` : `${Number(entry.amountMwk || entry.amount || 0).toLocaleString()} MWK`}</strong></article>
      })}</div> : <div className="history-empty"><span className="history-empty-icon"><Icon name="clock" size={20}/></span><strong>No activity to show</strong><p>Your paper unlocks, practice marking, and coin top ups will appear here.</p></div>}
    </section>
  </div>
}
