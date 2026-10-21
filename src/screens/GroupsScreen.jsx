import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { createStudyGroup, listMyGroups, listMyInvitations, respondToInvitation } from '../services/studyRepository.js'
import { createBackendGroup, createGroupInviteLink, inviteToBackendGroup, joinGroupByLink, loadGroupInvitations, loadGroups, respondToBackendInvitation, searchGroupUsers } from '../services/groupsApi.js'
import GroupDiscussionScreen from './GroupDiscussionScreen.jsx'
import { getProfileCompletion } from '../utils/profileCompletion.js'
import './GroupsScreen.css'

function readActiveGroup(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`last-minute-active-group:${userId}`) || 'null')
    return saved && typeof saved.id === 'string' ? saved : null
  } catch { return null }
}

export default function GroupsScreen({ session, profile, showNotice, onOpenProfile }) {
  const [groups, setGroups] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [respondingId, setRespondingId] = useState('')
  const [inviteGroupId, setInviteGroupId] = useState('')
  const [inviteUsername, setInviteUsername] = useState('')
  const [usernameResults, setUsernameResults] = useState([])
  const [inviteLinkBusy, setInviteLinkBusy] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [form, setForm] = useState({ name: '', course: '', description: '' })
  const [activeGroup, setActiveGroup] = useState(() => readActiveGroup(session.userId))
  const userId = session.userId
  const usesBackend = session?.authProvider === 'php-mysql'
  const profileCompletion = getProfileCompletion(profile, session.email)
  const canCreateGroup = profileCompletion === 100

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('groupInvite')
    if (!inviteToken || !usesBackend) return
    let active = true
    joinGroupByLink(session.token, inviteToken).then((group) => {
      if (!active) return
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      setActiveGroup(group)
      showNotice(`You joined ${group.name}.`)
    }).catch((joinError) => {
      if (!active) return
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      showNotice(joinError.message || 'Could not use this group invitation link.')
    })
    return () => { active = false }
  }, [session.token, showNotice, usesBackend])

  useEffect(() => {
    if (!inviteGroupId || inviteUsername.trim().length < 2) { setUsernameResults([]); return }
    let active = true
    const timeout = window.setTimeout(() => searchGroupUsers(session.token, inviteUsername.trim())
      .then((results) => { if (active) setUsernameResults(results) })
      .catch(() => { if (active) setUsernameResults([]) }), 220)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [inviteGroupId, inviteUsername, session.token])

  useEffect(() => {
    try {
      const key = `last-minute-active-group:${userId}`
      if (activeGroup) localStorage.setItem(key, JSON.stringify(activeGroup))
      else localStorage.removeItem(key)
    } catch { /* Keep group navigation usable without browser storage. */ }
  }, [activeGroup, userId])

  const refresh = useCallback(() => {
    setLoading(true)
    setError('')
    if (usesBackend) {
      return Promise.all([loadGroups(session.token), loadGroupInvitations(session.token)])
        .then(([myGroups, myInvitations]) => { setGroups(myGroups); setInvitations(myInvitations) })
        .catch((loadError) => setError(loadError.message || 'Could not load study groups.'))
        .finally(() => setLoading(false))
    }
    return Promise.all([listMyGroups(session.idToken, userId), listMyInvitations(session.idToken, userId)])
      .then(([myGroups, myInvitations]) => { setGroups(myGroups); setInvitations(myInvitations) })
      .catch((loadError) => setError(loadError.message || 'Could not load study groups.'))
      .finally(() => setLoading(false))
  }, [session.idToken, session.token, usesBackend, userId])

  useEffect(() => {
    let active = true
    const fetchGroups = usesBackend
      ? Promise.all([loadGroups(session.token), loadGroupInvitations(session.token)])
      : Promise.all([listMyGroups(session.idToken, userId), listMyInvitations(session.idToken, userId)])
    fetchGroups
      .then(([myGroups, myInvitations]) => { if (active) { setGroups(myGroups); setInvitations(myInvitations) } })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load study groups.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.idToken, session.token, usesBackend, userId])

  const createGroup = async (event) => {
    event.preventDefault()
    if (!canCreateGroup) {
      showNotice('Complete your profile to 100% before creating a study group.')
      return
    }
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (usesBackend) await createBackendGroup(session.token, form)
      else await createStudyGroup(session.idToken, userId, profile?.username || session.name || session.email, form)
      setForm({ name: '', course: '', description: '' })
      setCreating(false)
      showNotice('Your study group has been created.')
      await refresh()
    } catch (createError) {
      showNotice(createError.message || 'Could not create this group.')
    } finally {
      setSaving(false)
    }
  }

  const respond = async (invitation, accept) => {
    setRespondingId(invitation.id)
    try {
      if (usesBackend) await respondToBackendInvitation(session.token, invitation.id, accept)
      else await respondToInvitation(session.idToken, invitation, userId, accept)
      showNotice(accept ? `You joined ${invitation.groupName || 'the group'}.` : 'Invitation declined.')
      await refresh()
    } catch (respondError) {
      showNotice(respondError.message || 'Could not update the invitation.')
    } finally {
      setRespondingId('')
    }
  }

  const invite = async (event) => {
    event.preventDefault()
    if (!inviteGroupId || !inviteUsername.trim()) return
    setInviting(true)
    try {
      await inviteToBackendGroup(session.token, inviteGroupId, inviteUsername.trim())
      setInviteUsername('')
      setUsernameResults([])
      setInviteGroupId('')
      showNotice('Invitation sent.')
    } catch (inviteError) {
      showNotice(inviteError.message || 'Could not send this invitation.')
    } finally {
      setInviting(false)
    }
  }

  const shareInviteLink = async (group) => {
    setInviteLinkBusy(true)
    try {
      const token = await createGroupInviteLink(session.token, group.id)
      const url = new URL(window.location.href)
      url.search = ''
      url.hash = ''
      url.searchParams.set('groupInvite', token)
      if (navigator.share) await navigator.share({ title: `Join ${group.name}`, url: url.toString() })
      else {
        await navigator.clipboard.writeText(url.toString())
        showNotice('Group invitation link copied.')
      }
    } catch (linkError) {
      if (linkError.name !== 'AbortError') showNotice(linkError.message || 'Could not create the invitation link.')
    } finally { setInviteLinkBusy(false) }
  }

  if (activeGroup) return <GroupDiscussionScreen group={activeGroup} session={session} profile={profile} onBack={() => setActiveGroup(null)} showNotice={showNotice} />

  return <>
    <ScreenHeader kicker="LEARN TOGETHER" title="Study groups" description="Find your people, share ideas, and revise together." action={<button className="primary-button" onClick={() => { if (!canCreateGroup) { onOpenProfile?.(); return } setCreating((value) => !value) }}><Icon name={canCreateGroup ? 'plus' : 'users'} size={16} /> {canCreateGroup ? (creating ? 'Close' : 'Create a group') : `Complete profile · ${profileCompletion}%`}</button>} />
    <section className="groups-hero"><div className="group-art"><span><Icon name="users" size={31} /></span><i/><b/></div><div><span className="banner-label">BETTER TOGETHER</span><h2>Study with your community.</h2><p>Join a group to share resources and plan a discussion.</p></div></section>
    {!canCreateGroup && <div className="group-profile-gate"><span><Icon name="user" size={17}/></span><div><strong>Complete your profile to create a group</strong><small>Your profile is {profileCompletion}% complete. Fill in all profile and study details to reach 100%.</small></div><button type="button" onClick={onOpenProfile}>Complete profile</button></div>}

    {creating && canCreateGroup && <form className="group-create-form" onSubmit={createGroup}><h2>Create a study group</h2><div className="group-create-fields"><label>Group name<input required maxLength={70} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. MSCE Biology revision" /></label><label>Course or subject<input maxLength={60} value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} placeholder="e.g. Biology" /></label><label className="group-description-field">Description<textarea rows="3" maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What will your group study together?" /></label></div><button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create group'}</button></form>}

    {error && <div className="notification-error group-error"><span>{error}</span><button className="primary-button" onClick={refresh}>Retry</button></div>}
    {loading ? <div className="notification-state"><span className="notification-spinner"/><p>Loading your groups…</p></div> : <>
      {invitations.length > 0 && <section className="group-data-section"><div className="groups-subhead"><div><span className="section-kicker">WAITING FOR YOUR RESPONSE</span><h2>Invitations <span className="group-count">{invitations.length}</span></h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15} /> Refresh</button></div><div className="group-list">{invitations.map((invitation) => <article className="group-card invitation-card" key={invitation.id}><span className="group-subject-icon violet"><Icon name="users" size={20} /></span><div className="group-info"><span className="section-kicker">GROUP INVITATION</span><strong>{invitation.groupName || 'Study group'}</strong><small>Invited by {invitation.inviterName || 'a student'}</small></div><div className="invitation-actions"><button className="join-button" disabled={respondingId === invitation.id} onClick={() => respond(invitation, false)}>Decline</button><button className="join-button accept" disabled={respondingId === invitation.id} onClick={() => respond(invitation, true)}>Join group <Icon name="right" size={14} /></button></div></article>)}</div></section>}

      <section className="group-data-section"><div className="groups-subhead"><div><span className="section-kicker">YOUR COMMUNITY</span><h2>Your groups <span className="group-count">{groups.length}</span></h2></div><button className="notification-refresh" onClick={refresh}><Icon name="clock" size={15} /> Refresh</button></div>
      {groups.length ? <div className="group-list">{groups.map((group) => <article className="group-card" key={group.id}>
          <span className="group-subject-icon mint"><Icon name="users" size={20} /></span>
          <div className="group-info"><span className="section-kicker">{group.course || 'STUDY GROUP'}</span><strong>{group.name || 'Study group'}</strong><small>{group.memberIds?.length || 0} members · Created by {group.ownerName || 'a student'}</small>{group.description && <p className="group-description">{group.description}</p>}</div>
          <div className="group-card-actions"><button className="join-button" onClick={() => setActiveGroup(group)}>Open discussion <Icon name="right" size={14} /></button>{usesBackend && group.ownerId === userId && <button className="join-button group-invite-toggle" onClick={() => { setInviteGroupId((current) => current === group.id ? '' : group.id); setInviteUsername('') }}>{inviteGroupId === group.id ? 'Close invite' : 'Invite member'}</button>}</div>
          {inviteGroupId === group.id && <form className="group-invite-form" onSubmit={invite}><label>Find by username<input required minLength="2" maxLength="120" value={inviteUsername} onChange={(event) => setInviteUsername(event.target.value)} placeholder="Type a username" /></label>{usernameResults.length > 0 && <div className="group-user-results">{usernameResults.map((user) => <button type="button" key={user.id} onClick={() => setInviteUsername(user.username)}>{user.username}</button>)}</div>}<div className="group-invite-actions"><button className="primary-button" disabled={inviting || !usernameResults.some((user) => user.username.toLowerCase() === inviteUsername.trim().toLowerCase())}>{inviting ? 'Sending…' : 'Send invite'}</button><button type="button" className="join-button" disabled={inviteLinkBusy} onClick={() => shareInviteLink(group)}>{inviteLinkBusy ? 'Preparing link…' : 'Share invite link'}</button></div></form>}
        </article>)}</div> : <div className="empty-panel groups-empty"><span className="empty-icon"><Icon name="users" size={24} /></span><h3>You haven’t joined a group yet</h3><p>Create a group or accept an invitation to study together.</p><button className="primary-button" onClick={() => { if (!canCreateGroup) { onOpenProfile?.(); return } setCreating(true) }}><Icon name={canCreateGroup ? 'plus' : 'users'} size={15} /> {canCreateGroup ? 'Create a group' : 'Complete profile first'}</button></div>}
      </section>
    </>}
  </>
}
