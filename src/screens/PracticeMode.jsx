import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { PaperQuestion } from './PaperDetailScreen.jsx'
import { hasAnswerablePrompt } from '../utils/paperQuestions.js'
import { markPracticeAnswer, submitPracticeAnswer } from '../services/studentPapers.js'
import './PracticeMode.css'

function readProgress(key, count) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return { answers: value.answers || {}, submissions: value.submissions || {}, index: Math.min(Number(value.index) || 0, Math.max(0, count - 1)), startedAt: value.startedAt || Date.now() }
  } catch { return { answers: {}, index: 0, startedAt: Date.now() } }
}

function answerFieldCount(question) {
  const countSubquestions = (items = []) => items.reduce((total, item) => total + (item.subquestions?.length ? 0 : 1) + countSubquestions(item.subquestions || []), 0)
  return Number(hasAnswerablePrompt(question)) + countSubquestions(question.subquestions || [])
}

function hasAnsweredQuestion(question, index, answers) {
  const rootKey = String(question.id || index)
  if (hasAnswerablePrompt(question) && answers[rootKey]?.trim()) return true
  const hasAnsweredSubquestion = (items = [], parentKey = rootKey) => items.some((item, itemIndex) => {
    const key = `${parentKey}.${item.id || itemIndex}`
    return (!item.subquestions?.length && Boolean(answers[key]?.trim())) || hasAnsweredSubquestion(item.subquestions || [], key)
  })
  return hasAnsweredSubquestion(question.subquestions || [])
}

export default function PracticeMode({ paper, sessionToken, onExit }) {
  const questions = paper.questions || []
  const storageKey = `last-minute-practice-${paper.id}`
  const initial = useMemo(() => readProgress(storageKey, questions.length), [storageKey, questions.length])
  const [answers, setAnswers] = useState(initial.answers)
  const [submissions, setSubmissions] = useState(initial.submissions)
  const [submitting, setSubmitting] = useState({})
  const [submitErrors, setSubmitErrors] = useState({})
  const [index, setIndex] = useState(initial.index)
  const [startedAt] = useState(initial.startedAt)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ answers, submissions, index, startedAt })) } catch { /* Continue practice if storage is unavailable. */ }
  }, [answers, submissions, index, startedAt, storageKey])

  const answered = Object.values(answers).filter((answer) => answer.trim()).length
  const totalAnswerFields = questions.reduce((total, question) => total + answerFieldCount(question), 0)
  const updateAnswer = (key, value) => {
    setAnswers((current) => ({ ...current, [key]: value }))
    setSubmissions((current) => { const next = { ...current }; delete next[key]; return next })
    setSubmitErrors((current) => { const next = { ...current }; delete next[key]; return next })
  }
  const submitAnswer = async (key) => {
    if (submitting[key]) return
    setSubmitting((current) => ({ ...current, [key]: true }))
    setSubmitErrors((current) => ({ ...current, [key]: '' }))
    try {
      const submission = await submitPracticeAnswer(sessionToken, paper.id, key, answers[key] || '')
      const marking = await markPracticeAnswer({ token: sessionToken, paper, questionKey: key, answer: answers[key] || '' })
      setSubmissions((current) => ({ ...current, [key]: { ...submission, status: 'marked', marking } }))
    } catch (error) {
      setSubmitErrors((current) => ({ ...current, [key]: error.message || 'Could not submit this answer. Try again.' }))
    } finally {
      setSubmitting((current) => ({ ...current, [key]: false }))
    }
  }
  const formatTime = (seconds) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  if (!questions.length) return <section className="practice-shell"><button className="practice-back" onClick={onExit}><Icon name="left" size={15}/> Paper details</button><div className="practice-empty">There are no questions to practise yet.</div></section>

  return <section className="practice-shell">
    <div className="practice-heading"><button className="practice-back" onClick={onExit}><Icon name="left" size={15}/> Paper details</button><span className="practice-live"><i/> PRACTICE SESSION</span></div>
    <div className="practice-title"><div><span>{paper.course || paper.subject}</span><h1>{finished ? 'Session complete' : 'Practice mode'}</h1><p>{paper.title} · {questions.length} questions</p></div><div className="practice-clock"><Icon name="clock" size={16}/><span>{formatTime(elapsed)}</span><small>TIME ELAPSED</small></div></div>
    {finished ? <div className="practice-complete"><span className="practice-complete-icon"><Icon name="check" size={23}/></span><h2>Good work. Session complete.</h2><p>You answered {answered} of {totalAnswerFields} question and subquestion prompts in {formatTime(elapsed)}. Your answers are saved on this device.</p><div className="practice-complete-actions"><button className="practice-secondary" onClick={() => setFinished(false)}>Review answers</button><button className="practice-primary" onClick={() => { setAnswers({}); setIndex(0); setFinished(false); try { localStorage.removeItem(storageKey) } catch { /* Ignore storage errors. */ } }}>Start again</button></div></div> : <>
      <div className="practice-progress"><div><span>Question {index + 1} of {questions.length}</span><span>{answered} answered</span></div><div className="practice-progress-track"><i style={{ width: `${((index + 1) / questions.length) * 100}%` }}/></div></div>
      <div className="practice-question-card"><PaperQuestion question={questions[index]} index={index} answers={answers} submissions={submissions} submitting={submitting} errors={submitErrors} onPracticeAnswer={updateAnswer} onPracticeSubmit={submitAnswer}/></div>
      <nav className="practice-navigation"><button className="practice-secondary" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}><Icon name="left" size={15}/> Previous</button><div className="practice-dots">{questions.map((question, questionIndex) => <button aria-label={`Go to question ${questionIndex + 1}`} aria-current={questionIndex === index ? 'step' : undefined} className={`${questionIndex === index ? 'is-current' : ''} ${hasAnsweredQuestion(question, questionIndex, answers) ? 'is-answered' : ''}`} key={question.id || questionIndex} onClick={() => setIndex(questionIndex)}>{questionIndex + 1}</button>)}</div>{index < questions.length - 1 ? <button className="practice-primary" onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}>Next question <Icon name="right" size={15}/></button> : <button className="practice-primary" onClick={() => setFinished(true)}><Icon name="check" size={15}/> Finish session</button>}</nav>
    </>}
  </section>
}
