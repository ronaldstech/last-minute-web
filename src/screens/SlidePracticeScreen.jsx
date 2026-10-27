import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { deleteGeneratedSlidePaper, generateSlideQuestions, listGeneratedSlidePapers } from '../services/slideQuestionGenerator.js'
import './SlidePracticeScreen.css'

const MAX_FILE_BYTES = 35 * 1024 * 1024
const MAX_TEXT_LENGTH = 45000

async function readPdf(file) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  try {
    const pdf = await task.promise
    const pages = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => item.str || '').join(' '))
      page.cleanup()
    }
    return pages.join('\n\n')
  } finally {
    await task.destroy()
  }
}

const questionSections = [
  ['multiple_choice', 'Multiple choice'], ['true_false', 'True / false'], ['fill_blank', 'Fill in the blanks'], ['matching', 'Matching'], ['structured', 'Structured questions'],
]

function normalizeAnswer(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

function questionAnswered(question, index, answers) {
  if (question.type === 'matching') return (question.pairs || []).every((_, pairIndex) => Boolean(answers[`${index}-${pairIndex}`]))
  return answers[index] !== undefined && String(answers[index]).trim() !== ''
}

function scorePaper(questions, answers, selfMarked) {
  return questions.reduce((score, question, index) => {
    const marks = Number(question.marks || 1)
    score.max += marks
    if (question.type === 'multiple_choice' && Number(answers[index]) === Number(question.answerIndex)) score.earned += marks
    else if (question.type === 'true_false' && String(answers[index]) === String(Boolean(question.answer))) score.earned += marks
    else if (question.type === 'fill_blank' && normalizeAnswer(answers[index]) === normalizeAnswer(question.answer)) score.earned += marks
    else if (question.type === 'matching') {
      const pairs = question.pairs || []
      const correct = pairs.filter((pair, pairIndex) => answers[`${index}-${pairIndex}`] === pair.right).length
      score.earned += pairs.length ? marks * correct / pairs.length : 0
    } else if (question.type === 'structured' && selfMarked[index]) score.earned += marks
    return score
  }, { earned: 0, max: 0 })
}

export default function SlidePracticeScreen({ session, onProfileChange }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [questionType, setQuestionType] = useState('both')
  const [questionCount, setQuestionCount] = useState(10)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [selfMarked, setSelfMarked] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedPapers, setSavedPapers] = useState([])
  const [generationCost, setGenerationCost] = useState(5)
  const [showSavedPapers, setShowSavedPapers] = useState(false)

  const displayQuestionNumbers = new Map(questionSections.flatMap(([type]) => questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.type === type))
    .map(({ index }, order) => [index, order + 1]))

  useEffect(() => {
    let active = true
    listGeneratedSlidePapers(session?.token).then((result) => {
      if (!active) return
      setSavedPapers(result.papers || [])
      setGenerationCost(Number(result.generationCost || 0))
    }).catch((reason) => { if (active) setError(reason.message || 'Could not load saved papers.') })
    return () => { active = false }
  }, [session?.token])

  const chooseFile = async (chosen) => {
    if (!chosen) return
    setError('')
    setQuestions([])
    if (chosen.size > MAX_FILE_BYTES) { setError('Choose a file smaller than 35 MB.'); return }
    const extension = chosen.name.toLowerCase().split('.').pop()
    if (!['pdf', 'txt', 'md'].includes(extension)) { setError('Upload a searchable PDF, TXT, or Markdown file.'); return }
    setFile(chosen)
    setTitle(chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    try {
      const content = extension === 'pdf' ? await readPdf(chosen) : await chosen.text()
      if (!content.trim()) throw new Error('No readable text was found. If this is a scanned PDF, use OCR to make it searchable first.')
      setNotes(content.slice(0, MAX_TEXT_LENGTH))
    } catch (reason) {
      setFile(null)
      setNotes('')
      setError(reason.message || 'Could not read this file.')
    }
  }

  const generate = async (event) => {
    event.preventDefault()
    if (notes.trim().length < 100) { setError('Add at least 100 characters of readable slide notes.'); return }
    setLoading(true)
    setError('')
    setQuestions([])
    try {
      const result = await generateSlideQuestions({ token: session?.token, text: notes, title, questionType, questionCount })
      if (!Array.isArray(result?.questions) || result.questions.length !== Number(questionCount)) {
        throw new Error(`The AI could not create exactly ${questionCount} questions. Try again with clearer notes.`)
      }
      setQuestions(result.questions)
      setSavedPapers((current) => [{ id: result.paperId, title: title || 'Generated practice paper', questionType, questionCount: result.questions.length, questions: result.questions, coinsCharged: result.coinsCharged, createdAt: new Date().toISOString() }, ...current.filter((paper) => String(paper.id) !== String(result.paperId))])
      if (onProfileChange && result.coinBalance !== undefined) onProfileChange((current) => ({ ...current, coinBalance: result.coinBalance, freeCoinBalance: result.freeCoinBalance }))
      setAnswers({})
      setSelfMarked({})
      setSubmitted(false)
    } catch (reason) {
      setError(reason.message || 'Could not generate questions.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="slide-practice-screen">
    <ScreenHeader kicker="AI STUDY TOOL" title="Practise from your notes" description="Upload lecture slides and sit a complete practice paper generated from the material." />
    <div className="slide-library-tabs"><button className={!showSavedPapers ? 'active' : ''} onClick={() => { setShowSavedPapers(false); setQuestions([]); setSubmitted(false) }}>Generate a paper</button><button className={showSavedPapers ? 'active' : ''} onClick={() => { setShowSavedPapers(true); setQuestions([]); setSubmitted(false) }}>My generated papers <span>{savedPapers.length}</span></button></div>
    {showSavedPapers ? <section className="slide-saved-papers"><h2>My generated papers</h2><p>Your AI practice sets are saved here for later.</p>{savedPapers.map((paper) => <article className="slide-saved-paper" key={paper.id}><div><strong>{paper.title}</strong><small>{paper.questionCount} questions · {new Date(paper.createdAt).toLocaleDateString()}</small></div><button onClick={() => { setTitle(paper.title); setQuestions(paper.questions || []); setShowSavedPapers(false); setAnswers({}); setSelfMarked({}); setSubmitted(false) }}>Open</button><button aria-label={`Delete ${paper.title}`} onClick={async () => { try { await deleteGeneratedSlidePaper(session.token, paper.id); setSavedPapers((current) => current.filter((item) => String(item.id) !== String(paper.id))) } catch (reason) { setError(reason.message || 'Could not delete this paper.') } }}>Delete</button></article>)}{!savedPapers.length && <div className="slide-empty-saved">Generated papers you save will appear here.</div>}</section>
      : !questions.length ? <form className="slide-generator-card" onSubmit={generate}>
      <button className={`slide-upload-zone${file ? ' has-file' : ''}`} type="button" onClick={() => inputRef.current?.click()}>
        <span className="slide-upload-icon"><Icon name={file ? 'check' : 'file'} size={22}/></span>
        <strong>{file ? file.name : 'Choose your slide notes'}</strong>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${notes.length.toLocaleString()} characters extracted` : 'Searchable PDF, TXT, or Markdown · up to 35 MB'}</small>
        <span className="slide-upload-action">{file ? 'Choose a different file' : 'Browse files'}</span>
      </button>
      <input ref={inputRef} hidden type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
      <label className="slide-field"><span>Resource title</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cell biology lecture 3" /></label>
      <fieldset className="slide-type-field"><legend>Question type</legend><div className="slide-type-options">
        {[['multiple_choice', 'Multiple choice', 'Pick the correct answer'], ['true_false', 'True / false', 'Judge each statement'], ['fill_blank', 'Fill in the blanks', 'Complete key terms'], ['structured', 'Structured', 'Write a short answer'], ['matching', 'Matching', 'Pair related ideas'], ['both', 'Mixed types', 'A mix of question types']].map(([value, label, detail]) => <label className={`slide-type-option${questionType === value ? ' active' : ''}`} key={value}><input type="radio" name="questionType" value={value} checked={questionType === value} onChange={() => setQuestionType(value)}/><span><strong>{label}</strong><small>{detail}</small></span></label>)}
      </div></fieldset>
      <label className="slide-field slide-count-field"><span>Number of questions</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count} questions</option>)}</select></label>
      {error && <p className="slide-error" role="alert">{error}</p>}
      <button className="slide-generate-button" type="submit" disabled={loading}>{loading ? <><span className="notification-spinner"/> Analysing notes and writing questions…</> : <><Icon name="spark" size={17}/> Generate questions · {generationCost} coins</>}</button>
      <p className="slide-privacy-note">Your notes are analysed to create this practice set and are not added to the public paper library.</p>
    </form> : <section className="slide-question-set">
      <div className="slide-set-heading"><button type="button" className="slide-back" onClick={() => { setQuestions([]); setSubmitted(false) }}><Icon name="left" size={15}/> New set</button><span className="slide-set-count">{questions.length} questions · saved</span></div>
      <h2>{title || 'Your practice set'}</h2><p>Answer every question, then submit the paper to see your score and suggested answers.</p>
      {error && <p className="slide-error" role="alert">{error}</p>}
      {submitted && <div className="slide-score-summary"><Icon name="check" size={18}/><span><strong>Paper submitted · {scorePaper(questions, answers, selfMarked).earned.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {scorePaper(questions, answers, selfMarked).max} marks</strong><small>Review the suggested answers below. You can self-assess structured responses.</small></span></div>}
      {questionSections.map(([type, heading]) => {
        const typedQuestions = questions.map((question, index) => ({ question, index })).filter(({ question }) => question.type === type)
        if (!typedQuestions.length) return null
        return <section className="slide-question-type-section" key={type}><h3>{heading}<span>{typedQuestions.length}</span></h3>{typedQuestions.map(({ question, index }) => <article className="slide-question-card" key={question.id || index}>
        <div className="slide-question-label"><span>QUESTION {displayQuestionNumbers.get(index) || index + 1}</span><small>{heading.toUpperCase()} · {question.marks || 1} {(question.marks || 1) === 1 ? 'MARK' : 'MARKS'}</small></div>
        <h3>{question.prompt}</h3>
        {question.type === 'multiple_choice' && <div className="slide-choices">{(question.options || []).map((option, optionIndex) => <label key={optionIndex} className={answers[index] === optionIndex ? 'chosen' : ''}><input type="radio" name={`answer-${index}`} checked={answers[index] === optionIndex} disabled={submitted} onChange={() => setAnswers((current) => ({ ...current, [index]: optionIndex }))}/><span>{String.fromCharCode(65 + optionIndex)}.</span>{option}</label>)}</div>}
        {(question.type === 'structured' || question.type === 'fill_blank') && <textarea className="slide-answer-input" aria-label={`Answer question ${question.number || index + 1}`} placeholder="Write your answer here…" value={answers[index] || ''} disabled={submitted} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}/>}
        {question.type === 'true_false' && <div className="slide-choices">{['True', 'False'].map((option) => <label key={option} className={answers[index] === option ? 'chosen' : ''}><input type="radio" name={`answer-${index}`} checked={answers[index] === option} disabled={submitted} onChange={() => setAnswers((current) => ({ ...current, [index]: option }))}/>{option}</label>)}</div>}
        {question.type === 'matching' && <div className="slide-matching-pairs">{(question.pairs || []).map((pair, pairIndex) => <label key={pairIndex}><span>{pair.left}</span><select aria-label={`Match ${pair.left}`} value={answers[`${index}-${pairIndex}`] || ''} disabled={submitted} onChange={(event) => setAnswers((current) => ({ ...current, [`${index}-${pairIndex}`]: event.target.value }))}><option value="">Choose a match</option>{(question.pairs || []).map((option) => option.right).sort((left, right) => left.localeCompare(right)).map((right) => <option key={right} value={right}>{right}</option>)}</select></label>)}</div>}
        {submitted && <div className="slide-model-answer"><strong>{question.type === 'multiple_choice' ? `Correct answer: ${String.fromCharCode(65 + Number(question.answerIndex || 0))}` : question.type === 'true_false' ? `Correct answer: ${question.answer ? 'True' : 'False'}` : question.type === 'matching' ? 'Suggested matches' : 'Suggested answer'}</strong><p>{question.type === 'multiple_choice' ? question.options?.[Number(question.answerIndex || 0)] : question.type === 'matching' ? (question.pairs || []).map((pair) => `${pair.left} — ${pair.right}`).join('; ') : question.type === 'true_false' ? question.explanation : question.answer}</p>{question.explanation && question.type !== 'true_false' && <small>{question.explanation}</small>}{question.type === 'structured' && <label className="slide-self-mark"><input type="checkbox" checked={Boolean(selfMarked[index])} onChange={(event) => setSelfMarked((current) => ({ ...current, [index]: event.target.checked }))}/> I earned these marks</label>}</div>}
      </article>)}</section>
      })}
      {!submitted ? <button className="slide-generate-button" onClick={() => { const unanswered = questions.filter((question, index) => !questionAnswered(question, index, answers)).length; if (unanswered) { setError(`Answer all questions before submitting. ${unanswered} remaining.`); return } setError(''); setSubmitted(true) }}>Submit paper</button> : <button className="slide-generate-button" onClick={() => { setQuestions([]); setAnswers({}); setSelfMarked({}); setSubmitted(false) }}>Generate another set</button>}
    </section>}
  </div>
}
