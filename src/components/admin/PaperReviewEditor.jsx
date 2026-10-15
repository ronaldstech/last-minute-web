import { useState } from 'react'
import Icon from '../Icon.jsx'
import './PaperReviewEditor.css'

const questionTypes = ['structured', 'calculation', 'essay', 'diagram', 'programming', 'database_design', 'queue_simulation']

function freshQuestion(index) {
  return { id: `q-${crypto.randomUUID()}`, number: String(index + 1), order: index + 1, type: 'structured', marks: null, content: [{ type: 'paragraph', text: '' }], subquestions: [], assets: [], source_location: { pageStart: 1, pageEnd: 1 } }
}

function SubquestionsEditor({ items = [], onChange, depth = 0 }) {
  const update = (index, changes) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  return <div className="paper-subquestions" style={{ '--depth': depth }}>
    {items.map((item, index) => <div className="paper-subquestion" key={item.id || `${depth}-${index}`}>
      <div className="paper-subquestion-fields">
        <input aria-label="Sub-question number" value={item.number || ''} placeholder="a" onChange={(event) => update(index, { number: event.target.value })}/>
        <textarea aria-label={`Sub-question ${item.number || index + 1} text`} rows={2} value={item.text || ''} placeholder="Enter sub-question prompt" onChange={(event) => update(index, { text: event.target.value })}/>
        <input aria-label="Sub-question marks" type="number" min="0" value={item.marks ?? ''} placeholder="Marks" onChange={(event) => update(index, { marks: event.target.value === '' ? null : Number(event.target.value) })}/>
        <button type="button" className="paper-icon-button" aria-label="Remove sub-question" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" size={15}/></button>
      </div>
      <SubquestionsEditor items={item.subquestions || []} depth={depth + 1} onChange={(subquestions) => update(index, { subquestions })}/>
    </div>)}
    <button type="button" className="paper-add-sub" onClick={() => onChange([...items, { id: `sq-${crypto.randomUUID()}`, number: String.fromCharCode(97 + items.length), text: '', marks: null, subquestions: [] }])}><Icon name="plus" size={14}/> Add {depth ? 'nested ' : ''}sub-question</button>
  </div>
}

function QuestionCard({ question, index, onChange, onRemove }) {
  const updateBlock = (blockIndex, changes) => onChange({ ...question, content: (question.content || []).map((block, current) => current === blockIndex ? { ...block, ...changes } : block) })
  const renderBlock = (block, blockIndex) => {
    if (block.type === 'paragraph') return <label className="paper-content-block" key={blockIndex}><span>Paragraph</span><textarea rows={3} value={block.text || ''} placeholder="Write question content" onChange={(event) => updateBlock(blockIndex, { text: event.target.value })}/><button type="button" className="paper-remove-block" onClick={() => onChange({ ...question, content: question.content.filter((_, current) => current !== blockIndex) })}>Remove block</button></label>
    if (block.type === 'code') return <label className="paper-content-block" key={blockIndex}><span>Code {block.language ? `· ${block.language}` : ''}</span><textarea rows={4} value={block.code || ''} placeholder="Enter code snippet" onChange={(event) => updateBlock(blockIndex, { code: event.target.value })}/></label>
    if (block.type === 'image') return <div className="paper-content-block" key={blockIndex}><span>Image reference</span><input value={block.path || ''} placeholder="Image URL or storage path" onChange={(event) => updateBlock(blockIndex, { path: event.target.value })}/><input value={block.caption || ''} placeholder="Caption (optional)" onChange={(event) => updateBlock(blockIndex, { caption: event.target.value })}/></div>
    if (block.type === 'bullet_list') return <label className="paper-content-block" key={blockIndex}><span>{block.ordered ? 'Numbered list' : 'Bullet list'} · one item per line</span><textarea rows={3} value={(block.items || []).join('\n')} onChange={(event) => updateBlock(blockIndex, { items: event.target.value.split('\n') })}/><label className="paper-inline-check"><input type="checkbox" checked={Boolean(block.ordered)} onChange={(event) => updateBlock(blockIndex, { ordered: event.target.checked })}/> Number this list</label></label>
    if (block.type === 'table') return <TableContentEditor key={blockIndex} block={block} onChange={(changes) => updateBlock(blockIndex, changes)}/>
    return <details className="paper-preserved-block" key={blockIndex}><summary>{`${block.type || 'Additional'} content`} · preserved</summary><pre>{JSON.stringify(block, null, 2)}</pre></details>
  }
  const addBlock = (type) => {
    const block = type === 'table' ? { type, title: '', columns: ['Column 1', 'Column 2'], rows: [['', '']] }
      : type === 'bullet_list' ? { type, ordered: false, items: [''] }
        : type === 'code' ? { type, language: '', code: '' }
          : type === 'image' ? { type, path: '', caption: '' }
            : { type: 'paragraph', text: '' }
    onChange({ ...question, content: [...(question.content || []), block] })
  }
  return <article className="paper-question-card">
    <header><span className="paper-question-number">Q{index + 1}</span><label>Question number<input value={question.number || ''} onChange={(event) => onChange({ ...question, number: event.target.value })}/></label><label>Question type<select value={question.type || 'structured'} onChange={(event) => onChange({ ...question, type: event.target.value })}>{questionTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label><label className="paper-mark-field">Marks<input type="number" min="0" value={question.marks ?? ''} placeholder="—" onChange={(event) => onChange({ ...question, marks: event.target.value === '' ? null : Number(event.target.value) })}/></label><button type="button" className="paper-icon-button" aria-label={`Remove question ${index + 1}`} onClick={onRemove}><Icon name="trash" size={16}/></button></header>
    <div className="paper-question-content"><div className="paper-editor-label">Question content</div>{(question.content || []).map(renderBlock)}<label className="paper-add-content"><Icon name="plus" size={14}/><span>Add content block</span><select value="" onChange={(event) => { if (event.target.value) addBlock(event.target.value) }}><option value="" disabled>Choose a block type…</option><option value="paragraph">Paragraph</option><option value="table">Table</option><option value="bullet_list">List</option><option value="code">Code</option><option value="image">Image reference</option></select></label></div>
    <div className="paper-question-content"><div className="paper-editor-label">Sub-questions</div><SubquestionsEditor items={question.subquestions || []} onChange={(subquestions) => onChange({ ...question, subquestions })}/></div>
  </article>
}

function TableContentEditor({ block, onChange }) {
  const [rowsText, setRowsText] = useState(() => JSON.stringify(block.rows || [['', '']], null, 2))
  const [rowsError, setRowsError] = useState('')
  const saveRows = () => {
    try {
      const parsed = JSON.parse(rowsText)
      if (!Array.isArray(parsed) || parsed.some((row) => !Array.isArray(row))) throw new Error('Rows must be a JSON array of arrays.')
      onChange({ rows: parsed })
      setRowsError('')
    } catch (error) { setRowsError(error.message || 'Check the table row format.') }
  }
  return <div className="paper-content-block"><span>Table</span><input value={block.title || ''} placeholder="Table title (optional)" onChange={(event) => onChange({ title: event.target.value })}/><label>Column names<input value={(block.columns || []).join(', ')} placeholder="Column 1, Column 2" onChange={(event) => onChange({ columns: event.target.value.split(',').map((column) => column.trim()) })}/></label><label>Rows (JSON array)<textarea rows={4} value={rowsText} onChange={(event) => setRowsText(event.target.value)} onBlur={saveRows}/></label>{rowsError && <small className="paper-field-error">{rowsError}</small>}</div>
}

export default function PaperReviewEditor({ paper, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...paper, questions: (paper.questions || []).map((question) => ({ ...question, content: question.content || [], subquestions: question.subquestions || [] })) }))
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const updateQuestion = (index, question) => update('questions', draft.questions.map((item, current) => current === index ? question : item))
  const removeQuestion = (index) => update('questions', draft.questions.filter((_, current) => current !== index).map((question, order) => ({ ...question, order: order + 1 })))
  return <div className="paper-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="paper-review-editor" role="dialog" aria-modal="true" aria-labelledby="paper-review-title">
      <header className="paper-review-header"><div><span className="section-kicker">PAPER LIBRARY · REVIEW</span><h2 id="paper-review-title">Review paper</h2><p>Check the details and add or correct its questions before saving.</p></div><button type="button" className="paper-icon-button" aria-label="Close review" disabled={saving} onClick={onClose}><Icon name="close" size={18}/></button></header>
      <div className="paper-review-body">
        <section className="paper-metadata-card"><h3>Paper details</h3><div className="paper-metadata-grid"><label>Exam type / title<input value={draft.title || ''} placeholder="e.g. End of semester examination" onChange={(event) => update('title', event.target.value)}/></label><label>Course<input value={draft.course || ''} placeholder="Course or subject" onChange={(event) => update('course', event.target.value)}/></label><label>Exam year<input value={draft.year || ''} placeholder="e.g. 2025" onChange={(event) => update('year', event.target.value)}/></label><label>Semester<input value={draft.semester || ''} placeholder="e.g. Semester 1" onChange={(event) => update('semester', event.target.value)}/></label></div></section>
        <div className="paper-questions-heading"><div><h3>Questions <span>{draft.questions.length}</span></h3><p>Each question can include prompt content and nested sub-questions.</p></div><strong>{draft.questions.reduce((sum, question) => sum + Number(question.marks || 0), 0)} marks</strong></div>
        {draft.questions.map((question, index) => <QuestionCard key={question.id || index} question={question} index={index} onChange={(updated) => updateQuestion(index, updated)} onRemove={() => removeQuestion(index)}/>)}
        {!draft.questions.length && <div className="paper-no-questions"><Icon name="file" size={22}/><strong>No questions yet</strong><span>Add a question to start entering the paper contents.</span></div>}
        <button type="button" className="paper-add-question" onClick={() => update('questions', [...draft.questions, freshQuestion(draft.questions.length)])}><Icon name="plus" size={16}/> Add question</button>
      </div>
      <footer className="paper-review-footer"><span>{draft.questions.length} questions in this paper</span><div><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="paper-save-button" onClick={() => onSave(draft)} disabled={saving}>{saving ? 'Saving…' : 'Save paper'}</button></div></footer>
    </section>
  </div>
}
