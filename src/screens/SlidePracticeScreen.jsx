import { useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { generateSlideQuestions } from '../services/slideQuestionGenerator.js'
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

export default function SlidePracticeScreen({ session }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [questionType, setQuestionType] = useState('both')
  const [questionCount, setQuestionCount] = useState(10)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      if (!Array.isArray(result?.questions) || result.questions.length === 0) {
        throw new Error('The AI response did not include any questions. Try again with clearer notes.')
      }
      setQuestions(result.questions)
      setAnswers({})
      setRevealed({})
    } catch (reason) {
      setError(reason.message || 'Could not generate questions.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="slide-practice-screen">
    <ScreenHeader kicker="AI STUDY TOOL" title="Practise from your notes" description="Upload lecture slides and let AI turn the key ideas into questions." />
    {!questions.length ? <form className="slide-generator-card" onSubmit={generate}>
      <button className={`slide-upload-zone${file ? ' has-file' : ''}`} type="button" onClick={() => inputRef.current?.click()}>
        <span className="slide-upload-icon"><Icon name={file ? 'check' : 'file'} size={22}/></span>
        <strong>{file ? file.name : 'Choose your slide notes'}</strong>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${notes.length.toLocaleString()} characters extracted` : 'Searchable PDF, TXT, or Markdown · up to 35 MB'}</small>
        <span className="slide-upload-action">{file ? 'Choose a different file' : 'Browse files'}</span>
      </button>
      <input ref={inputRef} hidden type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
      <label className="slide-field"><span>Resource title</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cell biology lecture 3" /></label>
      <fieldset className="slide-type-field"><legend>Question type</legend><div className="slide-type-options">
        {[['multiple_choice', 'Multiple choice', 'Pick the correct answer'], ['structured', 'Structured', 'Write a short answer'], ['both', 'Both types', 'A mix of each']].map(([value, label, detail]) => <label className={`slide-type-option${questionType === value ? ' active' : ''}`} key={value}><input type="radio" name="questionType" value={value} checked={questionType === value} onChange={() => setQuestionType(value)}/><span><strong>{label}</strong><small>{detail}</small></span></label>)}
      </div></fieldset>
      <label className="slide-field slide-count-field"><span>Number of questions</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count} questions</option>)}</select></label>
      {error && <p className="slide-error" role="alert">{error}</p>}
      <button className="slide-generate-button" type="submit" disabled={loading}>{loading ? <><span className="notification-spinner"/> Analysing notes and writing questions…</> : <><Icon name="spark" size={17}/> Generate questions</>}</button>
      <p className="slide-privacy-note">Your notes are analysed to create this practice set and are not added to the public paper library.</p>
    </form> : <section className="slide-question-set">
      <div className="slide-set-heading"><button type="button" className="slide-back" onClick={() => setQuestions([])}><Icon name="left" size={15}/> New set</button><span className="slide-set-count">{questions.length} questions</span></div>
      <h2>{title || 'Your practice set'}</h2><p>Questions generated from your notes. Try each one, then check the answer.</p>
      {questions.map((question, index) => <article className="slide-question-card" key={question.id || index}>
        <div className="slide-question-label"><span>QUESTION {index + 1}</span><small>{question.type === 'multiple_choice' ? 'MULTIPLE CHOICE' : 'STRUCTURED'}</small></div>
        <h3>{question.prompt}</h3>
        {question.type === 'multiple_choice' && <div className="slide-choices">{(question.options || []).map((option, optionIndex) => <label key={optionIndex} className={answers[index] === optionIndex ? 'chosen' : ''}><input type="radio" name={`answer-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [index]: optionIndex }))}/><span>{String.fromCharCode(65 + optionIndex)}.</span>{option}</label>)}</div>}
        {question.type === 'structured' && <textarea className="slide-answer-input" aria-label={`Answer question ${index + 1}`} placeholder="Write your answer here…" value={answers[index] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}/>}
        {revealed[index] ? <div className="slide-model-answer"><strong>{question.type === 'multiple_choice' ? `Correct answer: ${String.fromCharCode(65 + Number(question.answerIndex || 0))}` : 'Suggested answer'}</strong><p>{question.type === 'multiple_choice' ? question.options?.[Number(question.answerIndex || 0)] : question.answer}</p>{question.explanation && <small>{question.explanation}</small>}</div> : <button className="slide-reveal-button" onClick={() => setRevealed((current) => ({ ...current, [index]: true }))}>Check answer <Icon name="right" size={14}/></button>}
      </article>)}
      <button className="slide-generate-button" onClick={() => { setQuestions([]); setAnswers({}); setRevealed({}) }}>Generate another set</button>
    </section>}
  </div>
}
