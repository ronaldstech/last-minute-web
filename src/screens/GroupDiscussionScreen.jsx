import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { PaperQuestion } from './PaperDetailScreen.jsx'
import { listPapers } from '../services/studyRepository.js'
import { listStudentPapers, markGroupDiscussionAnswers } from '../services/studentPapers.js'
import { answerDiscussionQuestion, endGroupDiscussion, joinGroupDiscussion, listGroupMessages, listGroupPlans, postGroupMessage, publishDueDiscussionQuestions, publishNextDiscussionQuestion, saveGroupDiscussionMarks, scheduleGroupDiscussion } from '../services/groupDiscussions.js'
import { answerBackendDiscussionQuestion, endBackendGroupDiscussion, joinBackendGroupDiscussion, loadBackendGroupMessages, loadBackendGroupPlans, publishBackendDueQuestions, publishBackendNextQuestion, saveBackendDiscussionMarks, scheduleBackendGroupDiscussion, sendBackendGroupMessage } from '../services/groupsApi.js'
import './GroupDiscussionScreen.css'

function localInputDate(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}

function formatCountdown(target, currentTime) {
  const remaining = Math.max(0, new Date(target).getTime() - currentTime)
  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return days ? `${days}d ${clock}` : clock
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
  const [markingId, setMarkingId] = useState('')
  const [now, setNow] = useState(0)
  const messageListRef = useRef(null)
  const olderCursor = useRef('')
  const olderCursorInitialized = useRef(false)
  const olderRequestActive = useRef(false)
  const scrollSnapshot = useRef(null)
  const initialScrollPending = useRef(true)
  const userId = session.userId
  const usesBackend = session?.authProvider === 'php-mysql'
  const name = profile?.username || session.name || session.email || 'Student'

  const refresh = useCallback(async (active = () => true) => {
    try {
      const [nextPage, nextPlans] = await Promise.all([
        usesBackend ? loadBackendGroupMessages(session.token, group.id) : listGroupMessages(session.idToken, group.id),
        usesBackend ? loadBackendGroupPlans(session.token, group.id) : listGroupPlans(session.idToken, group.id),
      ])
      if (!active()) return
      const published = group.ownerId === userId
        ? usesBackend
          ? await publishBackendDueQuestions(session.token, group.id)
          : await publishDueDiscussionQuestions(session.idToken, group, userId, nextPlans)
        : false
      const [freshMessages, freshPlans] = published
        ? await Promise.all([
          usesBackend ? loadBackendGroupMessages(session.token, group.id) : listGroupMessages(session.idToken, group.id),
          usesBackend ? loadBackendGroupPlans(session.token, group.id) : listGroupPlans(session.idToken, group.id),
        ])
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
  }, [session.idToken, session.token, usesBackend, group, userId])

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
      const page = usesBackend
        ? await loadBackendGroupMessages(session.token, group.id, olderCursor.current)
        : await listGroupMessages(session.idToken, group.id, olderCursor.current)
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
    const paperRequest = usesBackend ? listStudentPapers(session.token) : listPapers(session.idToken)
    paperRequest.then((items) => {
      if (mounted) { setPapers(items); setPaperId((current) => current || items[0]?.id || '') }
    }).catch((paperError) => { if (mounted) setError(paperError.message || 'Could not load papers.') })
    return () => { mounted = false }
  }, [scheduleOpen, session.idToken, session.token, usesBackend])

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans])

  const send = async (event) => {
    event.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      if (usesBackend) await sendBackendGroupMessage(session.token, group.id, text)
      else await postGroupMessage(session.idToken, group, userId, name, text)
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
      if (usesBackend) await scheduleBackendGroupDiscussion(session.token, group.id, paper.id, scheduledAt)
      else await scheduleGroupDiscussion(session.idToken, group, userId, paper, scheduledAt)
      setScheduleOpen(false)
      showNotice('Your group discussion has been scheduled.')
      await refresh()
    } catch (scheduleError) { setError(scheduleError.message || 'Could not schedule this discussion.') }
    finally { setScheduling(false) }
  }

  const join = async (plan) => {
    setRespondingId(plan.id)
    try {
      if (usesBackend) await joinBackendGroupDiscussion(session.token, group.id, plan.id)
      else await joinGroupDiscussion(session.idToken, group, userId, plan)
      await refresh(); showNotice('You joined the discussion.')
    }
    catch (joinError) { showNotice(joinError.message || 'Could not join this discussion.') }
    finally { setRespondingId('') }
  }

  const nextQuestion = async (plan) => {
    setRespondingId(plan.id)
    try {
      if (usesBackend) await publishBackendNextQuestion(session.token, group.id, plan.id)
      else await publishNextDiscussionQuestion(session.idToken, group, userId, plan)
      await refresh()
    }
    catch (questionError) { showNotice(questionError.message || 'Could not post the next question.') }
    finally { setRespondingId('') }
  }

  const endDiscussion = async (plan) => {
    setRespondingId(plan.id)
    try {
      if (usesBackend) await endBackendGroupDiscussion(session.token, group.id, plan.id)
      else await endGroupDiscussion(session.idToken, group, userId, plan)
      await refresh()
      showNotice('The discussion has ended.')
    } catch (endError) { showNotice(endError.message || 'Could not end this discussion.') }
    finally { setRespondingId('') }
  }

  const submitAnswer = async (message, answerOverride) => {
    const answer = typeof answerOverride === 'string' ? answerOverride : answerDrafts[message.id] || ''
    setRespondingId(message.id)
    try {
      if (usesBackend) await answerBackendDiscussionQuestion(session.token, group.id, message.id, answer)
      else await answerDiscussionQuestion(session.idToken, group, userId, name, message, answer)
      setAnswerDrafts((current) => ({ ...current, [message.id]: '' }))
      await refresh()
      showNotice(answer.trim() ? 'Your response was posted.' : 'You passed on this question.')
    } catch (answerError) { showNotice(answerError.message || 'Could not post your response.') }
    finally { setRespondingId('') }
  }

  const markAnswers = async (plan, questionMessage, prompt, responses) => {
    if (!usesBackend || markingId) return
    setMarkingId(questionMessage.id)
    try {
      const results = await markGroupDiscussionAnswers({ token: session.token, plan, question: prompt, responses, group })
      await saveBackendDiscussionMarks(session.token, group.id, questionMessage.id, results)
      await refresh()
      showNotice('Marks and feedback have been shared with the group.')
    } catch (markError) { showNotice(markError.message || 'Could not mark the group answers.') }
    finally { setMarkingId('') }
  }

  return <section className="group-discussion-screen">
    <ScreenHeader kicker={group.course || 'STUDY GROUP'} title={group.name || 'Group discussion'} description={group.description || 'Chat and work through exam questions together.'} action={<button className="discussion-back" onClick={onBack}><Icon name="left" size={15} /> All groups</button>} />
    <div className="discussion-toolbar"><span><Icon name="users" size={16} /> {group.memberIds?.length || 0} members</span>{group.ownerId === userId && <button className="primary-button" onClick={() => { setMinScheduleAt(localInputDate(new Date(Date.now() + 60_000))); setScheduleOpen((open) => !open) }}><Icon name="clock" size={15} /> {scheduleOpen ? 'Close planner' : 'Plan a discussion'}</button>}</div>
    {scheduleOpen && <form className="discussion-plan-form" onSubmit={schedule}><div><span className="section-kicker">PAPER DISCUSSION</span><h2>Plan a discussion</h2></div><label>Exam paper<select required value={paperId} onChange={(event) => setPaperId(event.target.value)}><option value="">Choose a paper</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title || paper.name} | {paper.course || paper.subject}</option>)}</select></label><label>Start time<input type="datetime-local" required min={minScheduleAt} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><button className="primary-button" disabled={scheduling || !papers.length}>{scheduling ? 'Scheduling...' : 'Schedule discussion'}</button></form>}
    {error && <div className="notification-error discussion-error">{error}<button onClick={() => refresh()}>Retry</button></div>}
    <div className="discussion-layout"><section className="discussion-chat"><div className="discussion-chat-head"><div><span className="section-kicker">GROUP SPACE</span><h2>Discussion</h2></div><span className="discussion-live"><i /> Updates every few seconds</span></div>
      {loading ? <div className="content-loader"><span className="notification-spinner"/> Loading discussion...</div> : messages.length ? <div className="discussion-messages" ref={messageListRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 48 && hasOlderMessages && !loadingOlder) loadOlderMessages() }}>{hasOlderMessages && <div className="older-messages-indicator" aria-live="polite">{loadingOlder ? 'Loading older messages...' : 'Scroll up to load older messages'}</div>}{messages.map((message) => {
        const plan = planById.get(message.discussionPlanId || message.planId)
        const isOwn = message.senderId === userId
        if (message.paperDetails) return <article className="discussion-announcement" key={message.id}><span className="announcement-icon"><Icon name="file" size={18} /></span><div className="announcement-body"><span className="section-kicker">PAPER DISCUSSION</span><strong>{message.paperDetails.examType || message.paperDetails.title || 'Group discussion'}</strong><p>{message.paperDetails.course || group.course}{message.discussionAt ? ` | ${new Date(message.discussionAt).toLocaleString()}` : ''}</p><small>{plan?.endedAt ? 'Discussion ended' : `${message.joinedMemberIds?.length || 0} joined`}</small>{plan && !plan.endedAt && !message.joinedMemberIds?.includes(userId) && <button className="join-button accept" disabled={respondingId === plan.id || new Date(plan.scheduledAt).getTime() > now} onClick={() => join(plan)}>{new Date(plan.scheduledAt).getTime() > now ? 'Starts later' : 'Join discussion'} <Icon name="right" size={14} /></button>}</div></article>
        const answerTo = message.relatedQuestionId
        const alreadyAnswered = answerTo && messages.some((item) => item.relatedQuestionId === answerTo && item.senderId === userId)
        const activePlan = message.messageType === 'discussion_question' ? planById.get(message.planId) : null
        if (message.messageType === 'discussion_question' && activePlan && Number(activePlan.currentQuestionIndex) !== Number(message.questionIndex)) return null
        if (['discussion_answer', 'discussion_pass'].includes(message.messageType)) return null
        const prompt = activePlan?.questions?.[Number(message.questionIndex)]
        const responses = message.messageType === 'discussion_question'
          ? messages.filter((item) => item.relatedQuestionId === message.id)
          : []
        const joinedIds = activePlan?.joinedMemberIds || []
        const allJoinedResponded = joinedIds.length > 0 && joinedIds.every((joinedId) => responses.some((response) => String(response.senderId) === String(joinedId)))
        const allResponsesMarked = responses.length > 0 && responses.every((response) => Boolean(response.markingResult))
        const canAnswer = message.messageType === 'discussion_question' && activePlan?.joinedMemberIds?.includes(userId) && !activePlan?.endedAt && Number(activePlan.currentQuestionIndex) === Number(message.questionIndex) && !alreadyAnswered
        const isQuestion = message.messageType === 'discussion_question'
        return <article className={`discussion-message ${isOwn ? 'mine' : ''} ${message.messageType ? 'typed-message' : ''} ${isQuestion ? 'discussion-question-message' : ''}`} key={message.id}>{!isQuestion && <span className="message-avatar">{(message.senderName || 'S').slice(0, 1).toUpperCase()}</span>}<div className="message-body"><div className="message-meta"><strong>{isOwn ? 'You' : message.senderName || 'Member'}</strong><time>{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Just now'}</time></div>{isQuestion && prompt ? <><div className="practice-progress discussion-progress"><div><span>Question {Number(message.questionIndex) + 1} of {activePlan.questions.length}</span><span>{activePlan.endedAt ? 'Discussion ended' : prompt.marks !== null && prompt.marks !== undefined ? `${prompt.marks} marks` : ''}</span></div><div className="practice-progress-track"><i style={{ width: `${((Number(message.questionIndex) + 1) / activePlan.questions.length) * 100}%` }} /></div></div><div className="practice-question-card discussion-practice-card"><div className="discussion-prompt">{(prompt.context || []).map((context, contextIndex) => <div className="discussion-question-context" key={`${context.number}-${contextIndex}`}><span>Additional information</span><PaperQuestion question={{ ...context, subquestions: [] }} index={contextIndex} /></div>)}<div className={prompt.context?.length ? 'discussion-active-subquestion' : ''}><PaperQuestion question={prompt} index={Number(message.questionIndex)} />{canAnswer && <div className="discussion-answer practice-subanswer"><label className="practice-answer-label" htmlFor={`group-answer-${message.id}`}>Your response</label><textarea id={`group-answer-${message.id}`} rows="4" placeholder="Write your answer here..." value={answerDrafts[message.id] || ''} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [message.id]: event.target.value }))} /><div className="discussion-answer-actions"><button className="practice-submit" disabled={respondingId === message.id || !answerDrafts[message.id]?.trim()} onClick={() => submitAnswer(message)}>{respondingId === message.id ? 'Posting...' : 'Post response'} <Icon name="right" size={14} /></button><button className="discussion-pass-button" disabled={respondingId === message.id} onClick={() => submitAnswer(message, '')}>Pass</button></div></div>}{responses.length > 0 && <div className="discussion-response-list"><div className="discussion-response-heading">Responses <span>{responses.length}</span></div>{responses.map((response) => <article className="discussion-response" key={response.id}><div><strong>{response.senderName || 'Member'}</strong><time>{response.createdAt ? new Date(response.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Just now'}</time></div><div className="discussion-response-content"><div className="discussion-response-answer"><span>Member answer</span><p>{response.text}</p></div>{response.markingResult && <div className="practice-mark-feedback discussion-mark-result"><strong>{response.markingResult.score} / {response.markingResult.maxMarks} marks</strong>{response.markingResult.feedback && <p>{response.markingResult.feedback}</p>}{response.markingResult.strengths?.length > 0 && <p><b>Strengths:</b> {response.markingResult.strengths.join(' · ')}</p>}{response.markingResult.improvements?.length > 0 && <p><b>Next steps:</b> {response.markingResult.improvements.join(' · ')}</p>}{response.markingResult.betterAnswer && <div className="practice-suggested-answer"><strong>Suggested best answer</strong><p>{response.markingResult.betterAnswer}</p></div>}</div>}</div></article>)}</div>}{usesBackend && activePlan?.createdBy === userId && responses.length > 0 && !allResponsesMarked && <div className="discussion-mark-controls">{allJoinedResponded ? <button className="discussion-mark-button" disabled={markingId === message.id} onClick={() => markAnswers(activePlan, message, prompt, responses)}>{markingId === message.id ? 'Marking answers...' : 'Mark all answers with AI'}</button> : <span>Waiting for {Math.max(0, joinedIds.length - responses.length)} joined member{joinedIds.length - responses.length === 1 ? '' : 's'} to respond.</span>}</div>}</div></div></div>{message.messageType === 'discussion_question' && activePlan?.createdBy === userId && <div className="discussion-owner-controls">{activePlan.endedAt ? <span className="discussion-ended-label">Discussion ended</span> : <span className="discussion-owner-actions">{Number(message.questionIndex) < activePlan.questions.length - 1 ? <button className="join-button accept" disabled={respondingId === activePlan.id} onClick={() => nextQuestion(activePlan)}>Next question <Icon name="right" size={14} /></button> : <span className="discussion-complete-label">Final question</span>}<button className="discussion-end-button" disabled={respondingId === activePlan.id} onClick={() => endDiscussion(activePlan)}>{respondingId === activePlan.id ? 'Ending…' : 'End discussion'}</button></span>}</div>}</> : <p>{message.text}</p>}{!isQuestion && canAnswer && <div className="discussion-answer"><textarea rows="3" placeholder="Write your answer..." value={answerDrafts[message.id] || ''} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [message.id]: event.target.value }))} /><button className="join-button accept" disabled={respondingId === message.id} onClick={() => submitAnswer(message)}>Post response</button></div>}</div></article>
      })}</div> : <div className="discussion-empty"><span><Icon name="messages" size={24} /></span><h3>Start the discussion</h3><p>Send a message or plan a paper discussion for your group.</p></div>}
      <form className="discussion-compose" onSubmit={send}><textarea rows="1" value={text} onChange={(event) => setText(event.target.value)} placeholder="Message your group..." aria-label="Message your group" /><button className="primary-button" aria-label="Send message" disabled={sending || !text.trim()}><Icon name="right" size={17} /> <span>{sending ? 'Sending...' : 'Send'}</span></button></form>
    </section><aside className="discussion-aside"><span className="section-kicker">UPCOMING SESSIONS</span><h2>Planned discussions</h2>{plans.length ? <div className="planned-list">{plans.map((plan) => { const startsAt = new Date(plan.scheduledAt).getTime(); const waiting = now > 0 && startsAt > now; return <article className="planned-item" key={plan.id}><span className="planned-date">{new Date(plan.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><div><strong>{plan.paperTitle || 'Paper discussion'}</strong><small>{new Date(plan.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} | {plan.joinedMemberIds?.length || 0} joined</small>{waiting && <span className="planned-countdown" aria-live="off">Starts in {formatCountdown(plan.scheduledAt, now)}</span>}</div>{group.ownerId === userId && startsAt <= now && Number(plan.currentQuestionIndex ?? -1) < 0 && <button title="Start questions" onClick={() => nextQuestion(plan)}><Icon name="right" size={15} /></button>}</article> })}</div> : <p className="planned-empty">No sessions planned yet.</p>}{group.ownerId !== userId && <p className="planned-hint">The group creator can schedule paper discussions.</p>}</aside></div>
  </section>
}
