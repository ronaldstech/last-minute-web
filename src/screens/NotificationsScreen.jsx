import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { fetchNotifications, markNotificationsRead } from '../services/notifications.js'
import './NotificationsScreen.css'

function isRead(notification, userId) {
  return notification.readBy.includes(userId)
}

function relativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Recently'
  const elapsed = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function kindIcon(kind) {
  if (kind === 'success') return 'check'
  if (kind === 'warning') return 'spark'
  return 'bell'
}

function NotificationCard({ notification, read, onClick }) {
  return (
    <button className={`notification-card ${read ? 'read' : 'unread'} ${notification.kind}`} onClick={onClick}>
      <span className={`notification-kind-icon ${notification.kind}`}><Icon name={kindIcon(notification.kind)} size={19} /></span>
      <span className="notification-copy">
        <span className="notification-title-row"><strong>{notification.title}</strong><span className={`read-label ${read ? 'is-read' : ''}`}>{read ? 'READ' : 'UNREAD'}</span></span>
        {notification.body && <span className="notification-body">{notification.body}</span>}
        <span className="notification-time">{relativeTime(notification.createdAt)}</span>
      </span>
      <Icon name="right" size={16} className="notification-arrow" />
    </button>
  )
}

function NotificationDetails({ notification, userId, onClose, onRead }) {
  const detailEntries = Object.entries(notification.details || {}).filter(([, value]) => value !== '' && value != null)
  const isInvite = notification.id.startsWith('group-invite-') && (!notification.actionStatus || notification.actionStatus === 'pending')

  return (
    <div className="notification-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="notification-detail" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
        <button className="notification-close" aria-label="Close details" onClick={onClose}>×</button>
        <span className={`notification-kind-icon large ${notification.kind}`}><Icon name={kindIcon(notification.kind)} size={24} /></span>
        <span className="detail-date">{notification.createdAt?.toLocaleString() || 'Recently'}</span>
        <h2 id="notification-detail-title">{notification.title}</h2>
        {notification.body && <p>{notification.body}</p>}
        {detailEntries.length > 0 && <dl className="notification-details">{detailEntries.map(([label, value]) => <div key={label}><dt>{label.replaceAll(/([A-Z])/g, ' $1')}</dt><dd>{String(value)}</dd></div>)}</dl>}
        {isInvite && <div className="invite-note"><Icon name="users" size={17} /><span>This group invitation is pending. Invitation response actions are available in the mobile app.</span></div>}
        <button className="primary-button detail-done" onClick={() => { onRead(notification); onClose() }}>{isRead(notification, userId) ? 'Close' : 'Mark as read'}</button>
      </section>
    </div>
  )
}

export default function NotificationsScreen({ session, onUnreadCount, showNotice }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const userId = session.userId

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotifications(await fetchNotifications(session, userId))
    } catch (loadError) {
      setError(loadError.message || 'Could not load notifications.')
    } finally {
      setLoading(false)
    }
  }, [session.authProvider, session.idToken, session.token, userId])

  useEffect(() => {
    let active = true
    fetchNotifications(session, userId)
      .then((result) => { if (active) setNotifications(result) })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load notifications.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.authProvider, session.idToken, session.token, userId])

  const unread = useMemo(() => notifications.filter((notification) => !isRead(notification, userId)), [notifications, userId])
  const visibleNotifications = filter === 'unread' ? unread : notifications

  useEffect(() => { onUnreadCount(unread.length) }, [unread.length, onUnreadCount])

  const markRead = async (notification) => {
    if (isRead(notification, userId)) return
    await markNotificationsRead(session, userId, [notification])
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readBy: [...new Set([...item.readBy, userId])] } : item))
  }

  const openNotification = async (notification) => {
    if (isRead(notification, userId)) {
      setSelected(notification)
      return
    }
    try {
      await markRead(notification)
      setSelected({ ...notification, readBy: [...new Set([...notification.readBy, userId])] })
    } catch (markError) {
      setSelected(notification)
      showNotice(markError.message || 'Could not mark as read.')
    }
  }

  const markAllRead = async () => {
    if (!unread.length || busy) return
    setBusy(true)
    try {
      await markNotificationsRead(session, userId, unread)
      setNotifications((current) => current.map((notification) => ({ ...notification, readBy: [...new Set([...notification.readBy, userId])] })))
      showNotice('All notifications marked as read.')
    } catch (markError) {
      showNotice(markError.message || 'Could not mark notifications as read.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <ScreenHeader
      kicker="YOUR UPDATES"
      title="Notifications"
      description="Announcements and updates about your study space."
      action={<button className="notification-mark-all" onClick={markAllRead} disabled={!unread.length || busy}><Icon name="check" size={16} /> {busy ? 'Saving…' : 'Mark all as read'}</button>}
    />
    <div className="notification-controls">
      <div className="notification-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{notifications.length}</span></button><button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread <span>{unread.length}</span></button></div>
      <button className="notification-refresh" onClick={load} disabled={loading}><Icon name="clock" size={15} /> Refresh</button>
    </div>

    {loading ? <div className="notification-state"><span className="notification-spinner"/><p>Loading your notifications…</p></div> : error ? (
      <div className="notification-state notification-error"><span className="empty-icon"><Icon name="bell" size={23} /></span><h2>Couldn’t load notifications</h2><p>{error}</p><button className="primary-button" onClick={load}>Try again</button></div>
    ) : visibleNotifications.length === 0 ? (
      <div className="notification-state notification-empty"><span className="empty-icon"><Icon name="bell" size={23} /></span><h2>{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</h2><p>{filter === 'unread' ? 'You’ve read all your updates.' : 'New announcements and account updates will appear here.'}</p>{filter === 'unread' && <button className="notification-text-button" onClick={() => setFilter('all')}>View all notifications</button>}</div>
    ) : (
      <div className="notification-list">{visibleNotifications.map((notification) => <NotificationCard key={notification.id} notification={notification} read={isRead(notification, userId)} onClick={() => openNotification(notification)} />)}</div>
    )}
    {selected && <NotificationDetails notification={selected} userId={userId} onClose={() => setSelected(null)} onRead={markRead} />}
  </>
}
