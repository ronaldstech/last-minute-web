import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import PaperUnlockCountdown from '../components/PaperUnlockCountdown.jsx'
import { listPaperReports } from '../services/paperReports.js'
import PracticeMode from './PracticeMode.jsx'
import { hasAnswerablePrompt } from '../utils/paperQuestions.js'
import { decodeTableAnswer, encodeTableAnswer, hasPracticeAnswerContent, practiceAnswerText } from '../utils/practiceAnswers.js'
import './PaperDetailScreen.css'

function ContentBlock({ block }) {
  if (!block || typeof block !== 'object') return null
  if (block.type === 'code') return <pre className="paper-content-code"><code>{block.code || ''}</code></pre>
  if (block.type === 'image') return <figure className="paper-content-image">{/^https?:\/\//i.test(block.path || '') ? <img src={block.path} alt={block.caption || 'Paper reference'} /> : <span><Icon name="file" size={16}/> Image reference: {block.path || 'not available'}</span>}{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
  if (block.type === 'bullet_list') {
    const List = block.ordered ? 'ol' : 'ul'
    return <List className="paper-content-list">{(block.items || []).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</List>
  }
  if (block.type === 'table') return <div className="paper-content-table-wrap">{block.title && <strong>{block.title}</strong>}<table className="paper-content-table"><thead><tr>{(block.columns || []).map((column, index) => <th key={`${index}-${column}`}>{column}</th>)}</tr></thead><tbody>{(block.rows || []).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
  return block.text ? <p>{block.text}</p> : null
}

function PracticeAnswerField({ answerKey, answer, submission, submitting, error, onChange, onSubmit }) {
  const inputId = `practice-answer-${answerKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const table = decodeTableAnswer(answer)
  const updateTable = (changes) => onChange(answerKey, encodeTableAnswer({ ...table, ...changes }))
  const selectTable = () => { if (table) return; onChange(answerKey, encodeTableAnswer(answer?.trim()
    ? { columns: ['Answer'], rows: [[answer]] }
    : { columns: ['Column 1', 'Column 2'], rows: [['', '']]})) }
  const selectText = () => onChange(answerKey, practiceAnswerText(answer))
  const updateColumn = (columnIndex, value) => updateTable({ columns: table.columns.map((column, index) => index === columnIndex ? value : column) })
  const updateCell = (rowIndex, columnIndex, value) => updateTable({ rows: table.rows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === columnIndex ? value : cell) : row) })
  const addColumn = () => updateTable({ columns: [...table.columns, `Column ${table.columns.length + 1}`], rows: table.rows.map((row) => [...row, '']) })
  const addRow = () => updateTable({ rows: [...table.rows, table.columns.map(() => '')] })
  return <div className="practice-answer-field">
    <div className="practice-answer-toolbar"><strong>Your answer</strong><div className="practice-answer-modes" role="group" aria-label="Answer format"><button type="button" className={!table ? 'is-active' : ''} aria-pressed={!table} disabled={submitting} onClick={selectText}>Text</button><button type="button" className={table ? 'is-active' : ''} aria-pressed={Boolean(table)} disabled={submitting} onClick={selectTable}>Table</button></div></div>
    {table ? <div className="practice-table-editor"><div className="practice-table-scroll"><table><thead><tr>{table.columns.map((column, columnIndex) => <th key={columnIndex}><input aria-label={`Table column ${columnIndex + 1}`} value={column} disabled={submitting} onChange={(event) => updateColumn(columnIndex, event.target.value)} placeholder={`Column ${columnIndex + 1}`}/></th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{table.columns.map((_, columnIndex) => <td key={columnIndex}><input aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} value={row[columnIndex] || ''} disabled={submitting} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} placeholder="Enter detail"/></td>)}</tr>)}</tbody></table></div><div className="practice-table-actions"><button type="button" disabled={submitting} onClick={addRow}>+ Add row</button><button type="button" disabled={submitting} onClick={addColumn}>+ Add column</button></div></div> : <textarea id={inputId} value={answer || ''} disabled={submitting} onChange={(event) => onChange(answerKey, event.target.value)} placeholder="Write your answer here…" rows={4}/>}
    <div className="practice-submit-row">
      <button className="practice-submit" type="button" disabled={submitting || !hasPracticeAnswerContent(answer)} onClick={() => onSubmit(answerKey)}><Icon name={submitting ? 'clock' : 'spark'} size={14}/>{submitting ? 'Submitting…' : submission ? 'Submit again' : 'Submit for marking'}</button>
      {submission && <span className="practice-submit-status"><Icon name="check" size={13}/>{submission.marking ? `Marked ${submission.marking.score} / ${submission.marking.maxMarks}` : `Submitted · ${submission.status === 'pending' ? 'awaiting marking' : submission.status}`}</span>}
      {error && <span className="practice-submit-error" role="alert">{error}</span>}
    </div>
    {submission?.marking && <div className="practice-mark-feedback">{submission.marking.feedback && <><strong>Feedback</strong><p>{submission.marking.feedback}</p></>}{submission.marking.strengths?.length > 0 && <p><b>Strengths:</b> {submission.marking.strengths.join(' · ')}</p>}{submission.marking.improvements?.length > 0 && <p><b>Next steps:</b> {submission.marking.improvements.join(' · ')}</p>}{submission.marking.betterAnswer && <div className="practice-suggested-answer"><strong>Suggested answer</strong><p>{submission.marking.betterAnswer}</p></div>}</div>}
  </div>
}

function Subquestions({ items = [], depth = 0, parentKey = '', answers = {}, submissions = {}, submitting = {}, errors = {}, onPracticeAnswer, onPracticeSubmit }) {
  if (!items.length) return null
  return <div className="paper-detail-subquestions" style={{ '--question-depth': depth }}>
    {items.map((item, index) => {
      const answerKey = `${parentKey}.${item.id || index}`
      return <article className="paper-detail-subquestion" key={item.id || `${depth}-${index}`}><div className="paper-detail-subquestion-heading"><strong>{item.number || String.fromCharCode(97 + index)}.</strong><span>{item.text}</span>{item.marks !== null && item.marks !== undefined && <small>[{item.marks} marks]</small>}</div>
        {onPracticeAnswer && !item.subquestions?.length && <div className="practice-subanswer"><PracticeAnswerField answerKey={answerKey} answer={answers[answerKey]} submission={submissions[answerKey]} submitting={submitting[answerKey]} error={errors[answerKey]} onChange={onPracticeAnswer} onSubmit={onPracticeSubmit}/></div>}
        <Subquestions items={item.subquestions || []} depth={depth + 1} parentKey={answerKey} answers={answers} submissions={submissions} submitting={submitting} errors={errors} onPracticeAnswer={onPracticeAnswer} onPracticeSubmit={onPracticeSubmit}/></article>
    })}
  </div>
}

export function PaperQuestion({ question, index, answers, submissions, submitting, errors, onPracticeAnswer, onPracticeSubmit }) {
  const content = Array.isArray(question.content) ? question.content : []
  const questionNumber = question.number ?? index + 1
  const answerKey = String(question.id || index)
  const hasPrompt = hasAnswerablePrompt(question)
  return <article className="paper-detail-question"><header><strong>{questionNumber}.</strong>{question.type && question.type !== 'structured' && <span>{question.type}</span>}{question.marks !== null && question.marks !== undefined && <small>[{question.marks} marks]</small>}</header>
    {content.length ? <div className="paper-detail-question-content">{content.map((block, blockIndex) => <ContentBlock key={`${question.id || index}-${blockIndex}`} block={block}/>)}</div> : question.text ? <p className="paper-detail-question-text">{question.text}</p> : null}
    {question.assets?.length > 0 && <ul className="paper-detail-assets">{question.assets.map((asset, assetIndex) => { const path = typeof asset === 'string' ? asset : asset.path || asset.url || asset.name || 'Attached file'; return <li key={`${path}-${assetIndex}`}>{asset.caption || asset.name || path}</li> })}</ul>}
    {onPracticeAnswer && hasPrompt && <PracticeAnswerField answerKey={answerKey} answer={answers[answerKey]} submission={submissions[answerKey]} submitting={submitting[answerKey]} error={errors[answerKey]} onChange={onPracticeAnswer} onSubmit={onPracticeSubmit}/>}
    <Subquestions items={question.subquestions || []} parentKey={answerKey} answers={answers} submissions={submissions} submitting={submitting} errors={errors} onPracticeAnswer={onPracticeAnswer} onPracticeSubmit={onPracticeSubmit}/>
  </article>
}

export default function PaperDetailScreen({ paper, activeTab, balance, session, sessionToken, onBack, saved = false, onToggleSaved, onUnlock, onReport, onGetCoins, onRetry, loading = false }) {
  const [unlocking, setUnlocking] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState('Incorrect content')
  const [reportDetails, setReportDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [paperReports, setPaperReports] = useState([])
  const [loadingPaperReports, setLoadingPaperReports] = useState(true)
  const [paperReportsError, setPaperReportsError] = useState('')
  const [reportReload, setReportReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoadingPaperReports(true)
    listPaperReports(session, paper.id).then((reports) => {
      if (active) { setPaperReports(reports); setPaperReportsError('') }
    }).catch((error) => {
      if (active) setPaperReportsError(error.message || 'Could not load reported issues.')
    }).finally(() => { if (active) setLoadingPaperReports(false) })
    return () => { active = false }
  }, [paper.id, reportReload, session])
  useEffect(() => {
    if (!paper.isUnlocked) setPracticing(false)
  }, [paper.id, paper.isUnlocked])
  const unlock = async () => {
    if (unlocking || paper.isUnlocked) return
    setUnlocking(true)
    setActionError('')
    try { await onUnlock() }
    catch (error) { setActionError(error.message || 'Could not unlock this paper.') }
    finally { setUnlocking(false) }
  }
  const submitReport = async (event) => {
    event.preventDefault()
    if (reporting) return
    setReporting(true)
    setReportError('')
    try {
      await onReport(reportCategory, reportDetails)
      setReportOpen(false)
      setReportDetails('')
      setReportCategory('Incorrect content')
      setReportReload((current) => current + 1)
    } catch (error) { setReportError(error.message || 'Could not submit this report.') }
    finally { setReporting(false) }
  }

  if (practicing && paper.isUnlocked) return <PracticeMode paper={paper} sessionToken={sessionToken} onExit={() => setPracticing(false)} />

  return <section className="paper-detail-screen">
    <button className="back-link" onClick={onBack}>← Back to {activeTab.toLowerCase()}</button>
    <div className="paper-detail-topline"><span className={`paper-subject ${paper.tone}-text`}>{paper.subject}</span><div className="paper-detail-actions">{onReport && <button className="paper-detail-save" onClick={() => { setReportError(''); setReportOpen(true) }}><Icon name="bell" size={15}/>Report issue</button>}{onToggleSaved && <button className={`paper-detail-save ${saved ? 'is-saved' : ''}`} onClick={onToggleSaved}><Icon name="bookmark" size={15}/>{saved ? 'Saved' : 'Save paper'}</button>}</div></div>
    <h1>{paper.course || paper.title || 'Question paper'}</h1>
    <p>{[paper.title, paper.year, paper.semester ? `Semester ${paper.semester}` : '', paper.departmentName, `${Number(paper.questionCount || paper.questions?.length || 0)} questions`].filter(Boolean).join(' | ')}</p>
    <section className="paper-reported-issues"><div className="paper-reported-issues-heading"><div><span>COMMUNITY REPORTS</span><h2>Reported issues <b>{paperReports.length}</b></h2></div></div>{loadingPaperReports ? <p className="paper-reported-issues-state">Loading reported issues...</p> : paperReportsError ? <p className="paper-reported-issues-state error" role="alert">{paperReportsError}</p> : paperReports.length ? <div className="paper-reported-issues-list">{paperReports.map((report) => <article key={report.id}><header><strong>{report.category || 'Other issue'}</strong><span className={`paper-report-status ${report.status || 'open'}`}>{(report.status || 'open').replace(/^./, (letter) => letter.toUpperCase())}</span></header><p>{report.details || 'No additional details.'}</p><small>{report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'Date unavailable'}</small></article>)}</div> : <p className="paper-reported-issues-state">No issues have been reported for this paper.</p>}</section>
    {loading || paper.detailLoading ? <div className="paper-detail-state"><span className="notification-spinner"/>Loading paper details...</div> : paper.detailError ? <div className="paper-detail-state paper-detail-error" role="alert">{paper.detailError}<button onClick={onRetry}>Try again</button></div> : paper.isUnlocked ? <><div className="paper-unlock-summary"><PaperUnlockCountdown expiresAt={paper.unlockExpiresAt}/></div><button className="practice-launch" onClick={() => setPracticing(true)}><span><Icon name="spark" size={18}/></span><div><strong>Start practice mode</strong><small>Answer at your own pace. Your work saves automatically.</small></div><Icon name="right" size={17}/></button><div className="detail-document paper-detail-document">
      <div className="paper-detail-document-heading"><span><Icon name="file" size={18}/> EXAM PAPER</span><h2>{paper.course || paper.title}</h2><p>{[paper.title, paper.year, paper.semester ? `Semester ${paper.semester}` : ''].filter(Boolean).join(' | ')}</p></div>
      {paper.questions?.length ? <div className="paper-detail-questions">{paper.questions.map((question, index) => <PaperQuestion key={question.id || index} question={question} index={index}/>)}</div> : <div className="paper-detail-state">This paper has no questions yet.</div>}
    </div></> : <div className="paper-detail-locked"><span className="paper-detail-lock-icon"><Icon name="lock" size={21}/></span><div><strong>Unlock the complete paper</strong><p>This paper contains {Number(paper.questionCount || 0)} questions. Unlock it for 24 hours; you can unlock it again after it expires.</p></div><div className="paper-detail-balance"><small>Your balance</small><strong>{balance} coins</strong></div></div>}
    {!paper.isUnlocked && !loading && !paper.detailLoading && !paper.detailError && <><button className="primary-button unlock-button" onClick={unlock} disabled={unlocking}><Icon name={unlocking ? 'clock' : 'lock'} size={16}/>{unlocking ? 'Unlocking...' : 'Unlock paper · 20 coins'}</button>{actionError && <p className="paper-detail-error" role="alert">{actionError} {balance < 20 && onGetCoins && <button onClick={onGetCoins}>Get coins</button>}</p>}</>}
    {reportOpen && <div className="paper-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !reporting) setReportOpen(false) }}><form className="paper-report-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-report-title" onSubmit={submitReport}><header><div><span>HELP IMPROVE THE LIBRARY</span><h2 id="paper-report-title">Report a paper issue</h2><p>{paper.course || paper.title || 'This paper'}</p></div><button type="button" aria-label="Close report form" disabled={reporting} onClick={() => setReportOpen(false)}>×</button></header><label>Issue type<select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} disabled={reporting}><option>Incorrect content</option><option>Missing content</option><option>Wrong paper details</option><option>Formatting issue</option><option>Other</option></select></label><label>What should we review?<textarea required maxLength={2000} rows={5} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Describe the issue so our team can find it." disabled={reporting}/><small>{reportDetails.length}/2000 characters</small></label>{reportError && <p className="paper-report-error" role="alert">{reportError}</p>}<footer><button type="button" disabled={reporting} onClick={() => setReportOpen(false)}>Cancel</button><button type="submit" disabled={reporting || !reportDetails.trim()}>{reporting ? 'Sending…' : 'Send report'}</button></footer></form></div>}
  </section>
}
