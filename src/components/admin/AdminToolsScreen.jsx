import { useEffect, useMemo, useState } from 'react'
import Icon from '../Icon.jsx'
import { giftAdminUserCoins, listAdminUsers } from '../../services/adminUsers.js'
import { commitWrites, documentName, listCollectionPage } from '../../services/firestore.js'
import { createAdminNotification } from '../../services/notifications.js'
import './AdminToolsScreen.css'

const blankNotification = { title: '', body: '', kind: 'info', audience: 'all', userId: '' }

export default function AdminToolsScreen({ session, isSuperAdmin, showNotice, onNavigate }) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false)
  const [nextUsersPage, setNextUsersPage] = useState('')
  const [notification, setNotification] = useState(blankNotification)
  const [sending, setSending] = useState(false)
  const [giftRecipients, setGiftRecipients] = useState([])
  const [giftAmount, setGiftAmount] = useState('50')
  const [gifting, setGifting] = useState(false)
  const [error, setError] = useState('')
  const isPhp = session.authProvider === 'php-mysql'
  const remoteSearch = isPhp ? search : ''

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoadingUsers(true)
      setUsers([])
      setNextUsersPage('')
      try {
        const result = isPhp
          ? await listAdminUsers(session.token, { search: remoteSearch })
          : await listCollectionPage(session.idToken, 'users', { pageSize: 100, fields: ['username', 'email', 'freeCoinBalance', 'coinBalance', 'role'] })
        if (active) {
          setUsers(result.documents || [])
          setNextUsersPage(result.nextPageToken || '')
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load users.')
      } finally { if (active) setLoadingUsers(false) }
    }, isPhp ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [isPhp, remoteSearch, session.idToken, session.token])

  const loadMoreUsers = async () => {
    if (!nextUsersPage || loadingMoreUsers) return
    setLoadingMoreUsers(true); setError('')
    try {
      const result = isPhp
        ? await listAdminUsers(session.token, { search: remoteSearch, cursor: nextUsersPage })
        : await listCollectionPage(session.idToken, 'users', { pageSize: 100, pageToken: nextUsersPage, fields: ['username', 'email', 'freeCoinBalance', 'coinBalance', 'role'] })
      setUsers((current) => {
        const byId = new Map(current.map((user) => [String(user.id), user]))
        for (const user of result.documents || []) byId.set(String(user.id), user)
        return [...byId.values()]
      })
      setNextUsersPage(result.nextPageToken || '')
    } catch (loadError) { setError(loadError.message || 'Could not load more users.') }
    finally { setLoadingMoreUsers(false) }
  }

  const visibleUsers = useMemo(() => {
    if (isPhp || !search.trim()) return users
    const query = search.trim().toLowerCase()
    return users.filter((user) => `${user.username || ''} ${user.email || ''} ${user.id || ''}`.toLowerCase().includes(query))
  }, [isPhp, search, users])
  const toggleGiftRecipient = (user) => setGiftRecipients((current) => current.some((item) => String(item.id) === String(user.id))
    ? current.filter((item) => String(item.id) !== String(user.id))
    : [...current, user])

  const sendNotification = async (event) => {
    event.preventDefault()
    if (notification.audience === 'user' && !notification.userId) return setError('Choose a user for this notification.')
    setSending(true); setError('')
    try {
      await createAdminNotification(session, { ...notification, title: notification.title.trim(), body: notification.body.trim() })
      setNotification(blankNotification)
      showNotice(notification.audience === 'all' ? 'Announcement sent to all users.' : 'Notification sent.')
    } catch (sendError) { setError(sendError.message || 'Could not send this notification.') }
    finally { setSending(false) }
  }

  const giftCoins = async (event) => {
    event.preventDefault()
    if (!isSuperAdmin) return setError('Only super administrators can gift coins.')
    const amount = Number(giftAmount)
    if (!giftRecipients.length) return setError('Choose at least one user to receive the coins.')
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return setError('Enter a whole number from 1 to 100,000 coins.')
    setGifting(true); setError('')
    try {
      if (isPhp) {
        const updatedUsers = []
        let failedRecipient = null
        for (const recipient of giftRecipients) {
          try { updatedUsers.push(await giftAdminUserCoins(session.token, recipient.id, amount)) }
          catch (giftError) { failedRecipient = { recipient, error: giftError }; break }
        }
        if (updatedUsers.length) {
          const updatedById = new Map(updatedUsers.map((user) => [String(user.id), user]))
          setUsers((current) => current.map((user) => updatedById.has(String(user.id)) ? { ...user, ...updatedById.get(String(user.id)) } : user))
          showNotice(`${amount.toLocaleString()} free coins gifted to ${updatedUsers.length} user${updatedUsers.length === 1 ? '' : 's'}.`)
        }
        if (failedRecipient) {
          const completedIds = new Set(updatedUsers.map((user) => String(user.id)))
          setGiftRecipients((current) => current.filter((user) => !completedIds.has(String(user.id))))
          throw new Error(`Gifted coins to ${updatedUsers.length} of ${giftRecipients.length} selected users. ${failedRecipient.recipient.username || failedRecipient.recipient.email || 'A user'} failed: ${failedRecipient.error.message}`)
        }
      } else {
        await commitWrites(session.idToken, giftRecipients.map((user) => ({ transform: { document: documentName(`users/${user.id}`), fieldTransforms: [{ fieldPath: 'freeCoinBalance', increment: { integerValue: amount } }] } })))
        const recipientIds = new Set(giftRecipients.map((user) => String(user.id)))
        setUsers((current) => current.map((user) => recipientIds.has(String(user.id)) ? { ...user, freeCoinBalance: Number(user.freeCoinBalance || 0) + amount } : user))
        showNotice(`${amount.toLocaleString()} free coins gifted to ${giftRecipients.length} user${giftRecipients.length === 1 ? '' : 's'}.`)
      }
      setGiftRecipients([])
    } catch (giftError) { setError(giftError.message || 'Could not gift coins.') }
    finally { setGifting(false) }
  }

  return <section className="admin-tools-screen">
    <header className="admin-tools-hero"><div><span className="section-kicker">ADMIN WORKSPACE</span><h2>Admin tools</h2><p>Send announcements, support users with coins, and jump into common management tasks.</p></div><span className="admin-tools-hero-icon"><Icon name="spark" size={24}/></span></header>
    <div className="admin-tools-summary"><span><Icon name="users" size={16}/>{users.length ? `${users.length} users loaded` : 'User actions'}</span><span><Icon name="bell" size={16}/>Communications</span><span><Icon name="coins" size={16}/>Wallet support</span></div>
    {error && <div className="admin-tools-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    <div className="admin-tools-grid">
      <form className="admin-tool-card admin-notification-composer" onSubmit={sendNotification}>
        <div className="admin-tool-heading"><span className="admin-tool-icon violet"><Icon name="bell" size={18}/></span><div><span className="section-kicker">COMMUNICATIONS</span><h3>Write a notification</h3><p>Send an announcement to everyone or a message to one user.</p></div></div>
        <label>Send to<select value={notification.audience} onChange={(event) => setNotification((current) => ({ ...current, audience: event.target.value }))}><option value="all">All users</option><option value="user">One user</option></select></label>
        {notification.audience === 'user' && <label>Choose user<div className="admin-tool-user-picker"><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)}/><select required value={notification.userId} onChange={(event) => setNotification((current) => ({ ...current, userId: event.target.value }))}><option value="">{loadingUsers ? 'Loading users…' : 'Select a user'}</option>{visibleUsers.map((user) => <option key={user.id} value={user.id}>{user.username || 'Student'} · {user.email || user.id}</option>)}</select>{nextUsersPage && <button className="admin-tool-load-more" type="button" onClick={() => void loadMoreUsers()} disabled={loadingUsers || loadingMoreUsers}>{loadingMoreUsers ? 'Loading more users…' : 'Load more users'}</button>}</div></label>}
        <label>Notification type<select value={notification.kind} onChange={(event) => setNotification((current) => ({ ...current, kind: event.target.value }))}><option value="info">Information</option><option value="success">Good news</option><option value="warning">Important alert</option></select></label>
        <label>Title<input required maxLength={120} value={notification.title} onChange={(event) => setNotification((current) => ({ ...current, title: event.target.value }))} placeholder="A clear, short title"/></label>
        <label>Message<textarea required rows={4} maxLength={1200} value={notification.body} onChange={(event) => setNotification((current) => ({ ...current, body: event.target.value }))} placeholder="Write the message users will see"/><small>{notification.body.length}/1200</small></label>
        <button className="admin-tool-primary" disabled={sending}><Icon name="right" size={15}/>{sending ? 'Sending…' : notification.audience === 'all' ? 'Send announcement' : 'Send notification'}</button>
      </form>

      <form className="admin-tool-card admin-coin-gift" onSubmit={giftCoins}>
        <div className="admin-tool-heading"><span className="admin-tool-icon gold"><Icon name="coins" size={18}/></span><div><span className="section-kicker">USER SUPPORT</span><h3>Gift free coins</h3><p>Add free coins directly to a user’s wallet.</p></div></div>
        <label>Search users<input placeholder="Name, email, or ID" value={search} onChange={(event) => setSearch(event.target.value)}/>{!isPhp && <small>Searches users already loaded. Load more to browse further.</small>}</label>
        <fieldset className="admin-tool-recipient-picker"><legend>Choose recipients <span>{giftRecipients.length} selected</span></legend><div>{visibleUsers.map((user) => <label key={user.id}><input type="checkbox" checked={giftRecipients.some((item) => String(item.id) === String(user.id))} onChange={() => toggleGiftRecipient(user)}/><span><strong>{user.username || 'Student'}</strong><small>{user.email || `User ${user.id}`}</small></span><small>{Number(user.freeCoinBalance || 0).toLocaleString()} free</small></label>)}{loadingUsers && <small>Loading users…</small>}{!loadingUsers && !visibleUsers.length && <small>No matching users.</small>}</div>{nextUsersPage && <button className="admin-tool-load-more" type="button" onClick={() => void loadMoreUsers()} disabled={loadingUsers || loadingMoreUsers}>{loadingMoreUsers ? 'Loading more users…' : 'Load more users'}</button>}</fieldset>
        {giftRecipients.length > 0 && <div className="admin-tool-recipient-summary"><strong>{giftRecipients.length} recipient{giftRecipients.length === 1 ? '' : 's'}</strong><span>{giftRecipients.map((user) => user.username || user.email || user.id).join(', ')}</span><button type="button" onClick={() => setGiftRecipients([])}>Clear selection</button></div>}
        <label>Coin amount<input required type="number" min="1" max="100000" step="1" value={giftAmount} onChange={(event) => setGiftAmount(event.target.value)}/></label>
        <button className="admin-tool-primary gold-button" disabled={gifting || !giftRecipients.length || !isSuperAdmin}><Icon name="plus" size={15}/>{gifting ? `Adding coins to ${giftRecipients.length} users…` : `Gift coins to ${giftRecipients.length || 'selected'} users`}</button>
        <small className="admin-tool-note">Gifted coins are added to the user’s free coin balance.</small>
        {!isSuperAdmin && <small className="admin-tool-note">Only super administrators can gift coins.</small>}
      </form>
    </div>
    <section className="admin-tool-shortcuts"><div><span className="section-kicker">MORE ADMIN ACTIONS</span><h3>Continue managing</h3><p>Open the tools already available across the admin panel.</p></div><div className="admin-tool-shortcut-grid">{[['users', 'Manage users', 'Review account status and roles', 'users'], ['papers', 'Manage papers', 'Review and update the library', 'file'], ['reports', 'Review paper reports', 'Track student feedback', 'bell'], ['settings', 'App configuration', 'Update pricing and notices', 'sliders']].map(([section, title, detail, icon]) => <button type="button" key={section} onClick={() => onNavigate(section)}><span><Icon name={icon} size={17}/></span><div><strong>{title}</strong><small>{detail}</small></div><Icon name="right" size={14}/></button>)}</div></section>
  </section>
}
