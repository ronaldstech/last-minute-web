import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { listPapers } from '../services/studyRepository.js'
import { answerDiscussionQuestion, joinGroupDiscussion, listGroupMessages, listGroupPlans, postGroupMessage, publishDueDiscussionQuestions, publishNextDiscussionQuestion, scheduleGroupDiscussion } from '../services/groupDiscussions.js'
import './GroupDiscussionScreen.css'

function localInputDate(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

export default function GroupDiscussionScreen({ group, session, profile, onBack, showNotice }) {
  const [messages, setMessages] = useState([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [plans, setPlans] = useState([])
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [paperId, setPaperId] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => localInputDate(new Date(Date.now() + 60 * 60_000)))
  const [minScheduleAt, setMinScheduleAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState({})
  const [respondingId, setRespondingId] = useState('')
  const [now, setNow] = useState(0)
  const messageListRef = useRef(null)
  const olderCursor = useRef('')
  const olderCursorInitialized = useRef(false)
  const olderRequestActive = useRef(false)
  const scrollSnapshot = useRef(null)
  const initialScrollPending = useRef(true)
  const userId = session.userId
  const name = profile?.username || session.name || session.email || 'Student'

  const refresh = useCallback(async (active = () => true) => {
    try {
      const [nextPage, nextPlans] = await Promise.all([
        listGroupMessages(session.idToken, group.id), listGroupPlans(session.idToken, group.id),
      ])
      if (!active()) return
      const published = await publishDueDiscussionQuestions(session.idToken, group, userId, nextPlans)
      const [freshMessages, freshPlans] = published
        ? await Promise.all([listGroupMessages(session.idToken, group.id), listGroupPlans(session.idToken, group.id)])
        : [nextPage, nextPlans]
      if (!olderCursorInitialized.current) {
        olderCursorInitialized.current = true
        olderCursor.current = freshMessages.nextPageToken
        setHasOlderMessages(Boolean(freshMessages.nextPageToken))
      }
      const latestMessages = freshMessages.messages
      if (active()) {
        setMessages((current) => {
          const byId = new Map(current.map((message) => [message.id, message]))
          latestMessages.forEach((message) => byId.set(message.id, message))
          return [...byId.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
        })
        setPlans(freshPlans)
        setError('')
      }
    } catch (loadError) {
      if (active()) setError(loadError.message || 'Could not load this group discussion.')
    } finally {
      if (active()) setLoading(false)
    }
  }, [session.idToken, group, userId])

  useLayoutEffect(() => {
    const list = messageListRef.current
    if (!list) return
    if (scrollSnapshot.current) {
      list.scrollTop = scrollSnapshot.current.top + (list.scrollHeight - scrollSnapshot.current.height)
      scrollSnapshot.current = null
    } else if (initialScrollPending.current && messages.length) {
      list.scrollTop = list.scrollHeight
      initialScrollPending.current = false
    }
  }, [messages])

  const loadOlderMessages = async () => {
    if (!olderCursor.current || olderRequestActive.current) return
    olderRequestActive.current = true
    setLoadingOlder(true)
    const list = messageListRef.current
    if (list) scrollSnapshot.current = { height: list.scrollHeight, top: list.scrollTop }
    try {
      const page = await listGroupMessages(session.idToken, group.id, olderCursor.current)
      olderCursor.current = page.nextPageToken
      setHasOlderMessages(Boolean(page.nextPageToken))
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]))
        page.messages.forEach((message) => byId.set(message.id, message))
        return [...byId.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      })
    } catch (loadError) {
      scrollSnapshot.current = null
      setError(loadError.message || 'Could not load older messages.')
    } finally {
      olderRequestActive.current = false
      setLoadingOlder(false)
    }
  }

  useEffect(() => {
    let mounted = true
    const active = () => mounted
    const initialTimer = window.setTimeout(() => { setNow(Date.now()); refresh(active) }, 0)
    const timer = window.setInterval(() => { setNow(Date.now()); refresh(active) }, 6000)
    return () => { mounted = false; window.clearTimeout(initialTimer); window.clearInterval(timer) }
  }, [refresh])

  useEffect(() => {
    if (!scheduleOpen) return undefined
    let mounted = true
    listPapers(session.idToken).then((items) => {
      if (mounted) { setPapers(items); setPaperId((current) => current || items[0]?.id || '') }
    }).catch((paperError) => { if (mounted) setError(paperError.message || 'Could not load papers.') })
    return () => { mounted = false }
  }, [scheduleOpen, session.idToken])

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans])

  const send = async (event) => {
    event.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await postGroupMessage(session.idToken, group, userId, name, text)
      setText('')
      await refresh()
    } catch (sendError) { showNotice(sendError.message || 'Could not send your message.') }
    finally { setSending(false) }
  }

  const schedule = async (event) => {
    event.preventDefault()
    const paper = papers.find((item) => item.id === paperId)
    if (!paper) return setError('Choose a paper to plan a discussion.')
    if (new Date(scheduledAt).getTime() <= Date.now()) return setError('Choose a future discussion time.')
    setScheduling(true)
    try {
      await scheduleGroupDiscussion(session.idToken, group, userId, paper, scheduledAt)
      setScheduleOpen(false)
      showNotice('Your group discussion has been scheduled.')
      await refresh()
    } catch (scheduleError) { setError(scheduleError.message || 'Could not schedule this discussion.') }
    finally { setScheduling(false) }
  }

  const join = async (plan) => {
    setRespondingId(plan.id)
    try { await joinGroupDiscussion(session.idToken, group, userId, plan); await refresh(); showNotice('You joined the discussion.') }
    catch (joinError) { showNotice(joinError.message || 'Could not join this discussion.') }
    finally { setRespondingId('') }
  }

  const nextQuestion = async (plan) => {
    setRespondingId(plan.id)
    try { await publishNextDiscussionQuestion(session.idToken, group, userId, plan); await refresh() }
    catch (questionError) { showNotice(questionError.message || 'Could not post the next question.') }
    finally { setRespondingId('') }
  }

  const submitAnswer = async (message) => {
    setRespondingId(message.id)
    try {
      await answerDiscussionQuestion(session.idToken, group, userId, name, message, answerDrafts[message.id] || '')
      setAnswerDrafts((current) => ({ ...current, [message.id]: '' }))
      await refresh()
      showNotice('Your response was posted.')
    } catch (answerError) { showNotice(answerError.message || 'Could not post your response.') }
    finally { setRespondingId('') }
  }

  return <section className="group-discussion-screen">
    <ScreenHeader kicker={group.course || 'STUDY GROUP'} title={group.name || 'Group discussion'} description={group.description || 'Chat and work through exam questions together.'} action={<button className="discussion-back" onClick={onBack}><Icon name="left" size={15} /> All groups</button>} />
    <div className="discussion-toolbar"><span><Icon name="users" size={16} /> {group.memberIds?.length || 0} members</span>{group.ownerId === userId && <button className="primary-button" onClick={() => { setMinScheduleAt(localInputDate(new Date(Date.now() + 60_000))); setScheduleOpen((open) => !open) }}><Icon name="clock" size={15} /> {scheduleOpen ? 'Close planner' : 'Plan a discussion'}</button>}</div>
    {scheduleOpen && <form className="discussion-plan-form" onSubmit={schedule}><div><span className="section-kicker">PAPER DISCUSSION</span><h2>Plan a discussion</h2></div><label>Exam paper<select required value={paperId} onChange={(event) => setPaperId(event.target.value)}><option value="">Choose a paper</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title || paper.name} · {paper.course || paper.subject}</option>)}</select></label><label>Start time<input type="datetime-local" required min={minScheduleAt} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><button className="primary-button" disabled={scheduling || !papers.length}>{scheduling ? 'Scheduling…' : 'Schedule discussion'}</button></form>}
    {error && <div className="notification-error discussion-error">{error}<button onClick={() => refresh()}>Retry</button></div>}
    <div className="discussion-layout"><section className="discussion-chat"><div className="discussion-chat-head"><div><span className="section-kicker">GROUP SPACE</span><h2>Discussion</h2></div><span className="discussion-live"><i /> Updates every few seconds</span></div>
      {loading ? <div className="content-loader"><span className="notification-spinner"/> Loading discussion…</div> : messages.length ? <div className="discussion-messages" ref={messageListRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 48 && hasOlderMessages && !loadingOlder) loadOlderMessages() }}>{hasOlderMessages && <div className="older-messages-indicator" aria-live="polite">{loadingOlder ? 'Loading older messages…' : 'Scroll up to load older messages'}</div>}{messages.map((message) => {
        const plan = planById.get(message.discussionPlanId || message.planId)
        const isOwn = message.senderId === userId
        if (message.paperDetails) return <article className="discussion-announcement" key={message.id}><span className="announcement-icon"><Icon name="file" size={18} /></span><div className="announcement-body"><span className="section-kicker">PAPER DISCUSSION</span><strong>{message.paperDetails.examType || message.paperDetails.title || 'Group discussion'}</strong><p>{message.paperDetails.course || group.course}{message.discussionAt ? ` · ${new Date(message.discussionAt).toLocaleString()}` : ''}</p><small>{message.joinedMemberIds?.length || 0} joined</small>{plan && !message.joinedMemberIds?.includes(userId) && <button className="join-button accept" disabled={respondingId === plan.id || new Date(plan.scheduledAt).getTime() > now} onClick={() => join(plan)}>{new Date(plan.scheduledAt).getTime() > now ? 'Starts later' : 'Join discussion'} <Icon name="right" size={14} /></button>}{plan?.createdBy === userId && Number(plan.currentQuestionIndex ?? -1) >= 0 && <button className="join-button" disabled={respondingId === plan.id || Number(plan.currentQuestionIndex) >= plan.questions?.length - 1} onClick={() => nextQuestion(plan)}>Next question <Icon name="right" size={14} /></button>}</div></article>
        const answerTo = message.relatedQuestionId
        const alreadyAnswered = answerTo && messages.some((item) => item.relatedQuestionId === answerTo && item.senderId === userId)
        const activePlan = message.messageType === 'discussion_question' ? planById.get(message.planId) : null
        const canAnswer = message.messageType === 'discussion_question' && activePlan?.joinedMemberIds?.includes(userId) && Number(activePlan.currentQuestionIndex) === Number(message.questionIndex) && !alreadyAnswered
        return <article className={`discussion-message ${isOwn ? 'mine' : ''} ${message.messageType ? 'typed-message' : ''}`} key={message.id}><span className="message-avatar">{(message.senderName || 'S').slice(0, 1).toUpperCase()}</span><div className="message-body"><div className="message-meta"><strong>{isOwn ? 'You' : message.senderName || 'Member'}</strong><time>{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Just now'}</time></div><p>{message.text}</p>{canAnswer && <div className="discussion-answer"><textarea rows="3" placeholder="Write your answer…" value={answerDrafts[message.id] || ''} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [message.id]: event.target.value }))} /><button className="join-button accept" disabled={respondingId === message.id} onClick={() => submitAnswer(message)}>Post response</button></div>}</div></article>
      })}</div> : <div className="discussion-empty"><span><Icon name="messages" size={24} /></span><h3>Start the discussion</h3><p>Send a message or plan a paper discussion for your group.</p></div>}
      <form className="discussion-compose" onSubmit={send}><textarea rows="1" value={text} onChange={(event) => setText(event.target.value)} placeholder="Message your group…" aria-label="Message your group" /><button className="primary-button" aria-label="Send message" disabled={sending || !text.trim()}><Icon name="right" size={17} /> <span>{sending ? 'Sending…' : 'Send'}</span></button></form>
    </section><aside className="discussion-aside"><span className="section-kicker">UPCOMING SESSIONS</span><h2>Planned discussions</h2>{plans.length ? <div className="planned-list">{plans.map((plan) => <article className="planned-item" key={plan.id}><span className="planned-date">{new Date(plan.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><div><strong>{plan.paperTitle || 'Paper discussion'}</strong><small>{new Date(plan.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {plan.joinedMemberIds?.length || 0} joined</small></div>{group.ownerId === userId && new Date(plan.scheduledAt).getTime() <= now && Number(plan.currentQuestionIndex ?? -1) < 0 && <button title="Start questions" onClick={() => nextQuestion(plan)}><Icon name="right" size={15} /></button>}</article>)}</div> : <p className="planned-empty">No sessions planned yet.</p>}{group.ownerId !== userId && <p className="planned-hint">The group creator can schedule paper discussions.</p>}</aside></div>
  </section>
}
