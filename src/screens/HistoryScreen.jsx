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

export default function HistoryScreen({ session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All activity')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const unlockRequest = session.authProvider === 'php-mysql'
      ? fetch(`${API_BASE_URL}/history`, { headers: { Authorization: `Bearer ${session.token}` } }).then(async (response) => {
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(result.message || 'Could not load paper unlock history.')
          return result.unlocks || []
        })
      : Promise.resolve([])
    const walletRequest = session.authProvider === 'php-mysql'
      ? loadWallet(session.token).then((wallet) => wallet.transactions || [])
      : listMyTransactions(session.idToken, session.userId)
    Promise.all([unlockRequest, walletRequest]).then(([unlocks, transactions]) => {
      if (!active) return
      const history = [
        ...unlocks.map((entry) => ({ ...entry, type: 'unlock', date: entry.createdAt })),
        ...transactions.map((entry) => ({ ...entry, type: 'topup', date: entry.createdAt || entry.updatedAt })),
      ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      setEntries(history)
    }).catch((loadError) => { if (active) setError(loadError.message || 'Could not load account history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  const filtered = useMemo(() => filter === 'All activity' ? entries : entries.filter((entry) => filter === 'Paper unlocks' ? entry.type === 'unlock' : entry.type === 'topup'), [entries, filter])
  const totalUnlocks = entries.filter((entry) => entry.type === 'unlock').length
  const coinsUsed = entries.filter((entry) => entry.type === 'unlock').reduce((sum, entry) => sum + Number(entry.freeCoinsSpent || 0) + Number(entry.purchasedCoinsSpent || 0), 0)
  const totalTopups = entries.filter((entry) => entry.type === 'topup' && ['paid', 'success', 'successful', 'completed'].includes(String(entry.status || '').toLowerCase())).length

  return <div className="history-screen">
    <ScreenHeader kicker="YOUR ACCOUNT" title="Account history" description="Review your paper unlocks, coin use, and top ups." />
    <div className="history-stats"><article><span className="history-stat-icon violet"><Icon name="lock" size={16}/></span><div><small>Paper unlocks</small><strong>{totalUnlocks}</strong></div></article><article><span className="history-stat-icon gold"><Icon name="coins" size={16}/></span><div><small>Coins used</small><strong>{coinsUsed}</strong></div></article><article><span className="history-stat-icon mint"><Icon name="coins" size={16}/></span><div><small>Successful top ups</small><strong>{totalTopups}</strong></div></article></div>
    <section className="history-panel"><div className="history-toolbar"><div><h2>Recent activity</h2><p>Unlocks include the time, paper, and coin balance used.</p></div><div className="history-filters" aria-label="Filter account history">{['All activity', 'Paper unlocks', 'Coin top ups'].map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      {loading ? <div className="history-empty">Loading your account history…</div> : error ? <div className="history-error" role="alert">{error}</div> : filtered.length ? <div className="history-list">{filtered.map((entry, index) => {
        const unlock = entry.type === 'unlock'
        const paid = ['paid', 'success', 'successful', 'completed'].includes(String(entry.status || '').toLowerCase())
        const spent = Number(entry.freeCoinsSpent || 0) + Number(entry.purchasedCoinsSpent || 0)
        return <article className="history-entry" key={`${entry.type}-${entry.id || entry.chargeId || index}`}><span className={`history-entry-icon ${unlock ? 'violet' : 'gold'}`}><Icon name={unlock ? 'lock' : 'coins'} size={17}/></span><div className="history-entry-copy"><strong>{unlock ? (entry.course || entry.paperTitle || 'Paper unlocked') : 'Coin top up'}</strong><small>{unlock ? [entry.paperTitle && entry.paperTitle !== entry.course ? entry.paperTitle : '', entry.year && `Year ${entry.year}` ].filter(Boolean).join(' · ') || 'Paper access' : [entry.operatorName || 'Mobile money', `${Number(entry.coins || 0)} coins`, entry.status || 'pending'].join(' · ')}</small><time dateTime={entry.date || undefined}>{dateTime(entry.date)}</time>{unlock && <small className="history-breakdown">{Number(entry.freeCoinsSpent || 0)} free + {Number(entry.purchasedCoinsSpent || 0)} purchased coins · access until {dateTime(entry.expiresAt)}</small>}</div><strong className={`history-amount ${unlock ? 'spent' : paid ? 'received' : ''}`}>{unlock ? `−${spent} coins` : `${Number(entry.amountMwk || entry.amount || 0).toLocaleString()} MWK`}</strong></article>
      })}</div> : <div className="history-empty"><span className="history-empty-icon"><Icon name="clock" size={20}/></span><strong>No activity to show</strong><p>Your paper unlocks and coin top ups will appear here.</p></div>}
    </section>
  </div>
}
