import { useEffect, useState } from 'react'
import Icon from '../Icon.jsx'
import { listAcademicRecords, listFirestoreDepartments } from '../../services/adminAcademics.js'
import { listCollection } from '../../services/firestore.js'
import { uploadPaperQuestionImage } from '../../services/paperQuestionImages.js'
import './PaperReviewEditor.css'

const questionTypes = ['structured', 'calculation', 'essay', 'diagram', 'programming', 'database_design', 'queue_simulation']
const examTypes = ['quiz1', 'midsemester', 'quiz2', 'quiz3', 'endsemester', 'project', 'presentation', 'sample']

function freshQuestion(index) {
  return { id: `q-${crypto.randomUUID()}`, number: String(index + 1), order: index + 1, type: 'structured', marks: null, content: [{ type: 'paragraph', text: '' }], subquestions: [], assets: [], source_location: { pageStart: 1, pageEnd: 1 } }
}

function ImageAttachments({ images = [], session, onChange, compact = false }) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [showImages, setShowImages] = useState(false)
  const upload = async (file) => {
    if (!file) return
    setUploading(true); setError('')
    try { const url = await uploadPaperQuestionImage(session, file, setUploadProgress); onChange([...images, { url, name: file.name }]) }
    catch (uploadError) { setError(uploadError.message || 'Could not upload this image.') }
    finally { setUploading(false); setUploadProgress(0) }
  }
  return <div className={`paper-image-attachments${compact ? ' is-compact' : ''}`}><label className="paper-image-upload"><Icon name="image" size={14}/>{uploading ? `Uploading ${uploadProgress}%` : 'Add image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }}/></label>{images.length > 0 && <button type="button" className="paper-image-count" aria-expanded={showImages} onClick={() => setShowImages((shown) => !shown)}>{images.length} attached</button>}{images.length > 0 && showImages && <div className="paper-image-preview-list">{images.map((image, index) => { const url = typeof image === 'string' ? image : image.url || image.path; return <figure key={`${url}-${index}`}><img src={url} alt={image.name || image.caption || 'Question attachment'}/><button type="button" onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove attached image">Remove</button></figure> })}</div>}{error && <small role="alert">{error}</small>}</div>
}

function ContentBlocksEditor({ content = [], onChange }) {
  const updateBlock = (index, changes) => onChange(content.map((block, current) => current === index ? { ...block, ...changes } : block))
  const addBlock = (type) => {
    const block = type === 'table' ? { type, title: '', columns: ['Column 1', 'Column 2'], rows: [['', '']] }
      : type === 'bullet_list' ? { type, ordered: false, items: [''] }
        : type === 'code' ? { type, language: '', code: '' }
          : type === 'image' ? { type, path: '', caption: '' }
            : { type: 'paragraph', text: '' }
    onChange([...content, block])
  }
  return <div className="paper-question-content"><div className="paper-editor-label">Content blocks</div>{content.map((block, index) => {
    const remove = () => onChange(content.filter((_, current) => current !== index))
    if (block.type === 'table') return <TableContentEditor key={index} block={block} onChange={(changes) => updateBlock(index, changes)}/>
    if (block.type === 'paragraph') return <label className="paper-content-block" key={index}><span>Paragraph</span><textarea rows={3} value={block.text || ''} onChange={(event) => updateBlock(index, { text: event.target.value })}/><button type="button" className="paper-remove-block" onClick={remove}>Remove block</button></label>
    if (block.type === 'code') return <label className="paper-content-block" key={index}><span>Code {block.language ? `· ${block.language}` : ''}</span><textarea rows={4} value={block.code || ''} onChange={(event) => updateBlock(index, { code: event.target.value })}/></label>
    if (block.type === 'image') return <div className="paper-content-block" key={index}><span>Image reference</span><input value={block.path || ''} placeholder="Image URL or storage path" onChange={(event) => updateBlock(index, { path: event.target.value })}/><input value={block.caption || ''} placeholder="Caption (optional)" onChange={(event) => updateBlock(index, { caption: event.target.value })}/></div>
    if (block.type === 'bullet_list') return <label className="paper-content-block" key={index}><span>{block.ordered ? 'Numbered list' : 'Bullet list'} · one item per line</span><textarea rows={3} value={(block.items || []).join('\n')} onChange={(event) => updateBlock(index, { items: event.target.value.split('\n') })}/><label className="paper-inline-check"><input type="checkbox" checked={Boolean(block.ordered)} onChange={(event) => updateBlock(index, { ordered: event.target.checked })}/> Number this list</label></label>
    return <details className="paper-preserved-block" key={index}><summary>{block.type || 'Additional'} content · preserved</summary><pre>{JSON.stringify(block, null, 2)}</pre></details>
  })}<label className="paper-add-content"><Icon name="plus" size={14}/><span>Add content block</span><select value="" onChange={(event) => event.target.value && addBlock(event.target.value)}><option value="" disabled>Choose a block type…</option><option value="paragraph">Paragraph</option><option value="table">Table</option><option value="bullet_list">List</option><option value="code">Code</option><option value="image">Image reference</option></select></label></div>
}

function SubquestionsEditor({ items = [], onChange, depth = 0, session }) {
  const update = (index, changes) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  return <div className="paper-subquestions" style={{ '--depth': depth }}>
    {items.map((item, index) => <div className="paper-subquestion" key={item.id || `${depth}-${index}`}>
      <div className="paper-subquestion-fields">
        <input aria-label="Sub-question number" value={item.number || ''} placeholder="a" onChange={(event) => update(index, { number: event.target.value })}/>
        <textarea aria-label={`Sub-question ${item.number || index + 1} text`} rows={2} value={item.text || ''} placeholder="Enter sub-question prompt" onChange={(event) => update(index, { text: event.target.value })}/>
        <input aria-label="Sub-question marks" type="number" min="0" value={item.marks ?? ''} placeholder="Marks" onChange={(event) => update(index, { marks: event.target.value === '' ? null : Number(event.target.value) })}/>
        <button type="button" className="paper-icon-button" aria-label="Remove sub-question" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" size={15}/></button>
      </div>
      <ContentBlocksEditor content={item.content || []} onChange={(content) => update(index, { content })}/>
      <div className="paper-subquestion-attachment-row"><ImageAttachments images={item.images || []} session={session} compact onChange={(images) => update(index, { images })}/></div>
      <SubquestionsEditor items={item.subquestions || []} depth={depth + 1} session={session} onChange={(subquestions) => update(index, { subquestions })}/>
    </div>)}
    <button type="button" className="paper-add-sub" onClick={() => onChange([...items, { id: `sq-${crypto.randomUUID()}`, number: String.fromCharCode(97 + items.length), text: '', marks: null, content: [], subquestions: [] }])}><Icon name="plus" size={14}/> Add {depth ? 'nested ' : ''}sub-question</button>
  </div>
}

function QuestionCard({ question, index, session, onChange, onRemove }) {
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
    <div className="paper-question-attachment-row"><span>Attachments</span><ImageAttachments images={question.images || []} session={session} compact onChange={(images) => onChange({ ...question, images })}/></div>
    <div className="paper-question-content"><div className="paper-editor-label">Question content</div>{(question.content || []).map(renderBlock)}<label className="paper-add-content"><Icon name="plus" size={14}/><span>Add content block</span><select value="" onChange={(event) => { if (event.target.value) addBlock(event.target.value) }}><option value="" disabled>Choose a block type…</option><option value="paragraph">Paragraph</option><option value="table">Table</option><option value="bullet_list">List</option><option value="code">Code</option><option value="image">Image reference</option></select></label></div>
    <div className="paper-question-content"><div className="paper-editor-label">Sub-questions</div><SubquestionsEditor items={question.subquestions || []} session={session} onChange={(subquestions) => onChange({ ...question, subquestions })}/></div>
  </article>
}

function TableContentEditor({ block, onChange }) {
  const columns = block.columns || []
  const rows = block.rows || []
  const updateColumn = (columnIndex, value) => onChange({ columns: columns.map((column, index) => index === columnIndex ? value : column) })
  const updateCell = (rowIndex, columnIndex, value) => onChange({ rows: rows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === columnIndex ? value : cell) : row) })
  const addColumn = () => onChange({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, '']) })
  const addRow = () => onChange({ rows: [...rows, columns.map(() => '')] })
  return <div className="paper-content-block"><span>Table data</span><input aria-label="Table title" value={block.title || ''} placeholder="Table title (optional)" onChange={(event) => onChange({ title: event.target.value })}/><div className="paper-table-preview" role="region" aria-label="Question table editor" tabIndex={0}>{block.title && <strong>{block.title}</strong>}<table><thead><tr>{columns.map((column, index) => <th key={`${index}-${column}`}><input aria-label={`Table column ${index + 1}`} value={column} placeholder={`Column ${index + 1}`} onChange={(event) => updateColumn(index, event.target.value)}/><button type="button" className="paper-table-remove" aria-label={`Remove column ${index + 1}`} onClick={() => onChange({ columns: columns.filter((_, columnIndex) => columnIndex !== index), rows: rows.map((row) => row.filter((_, columnIndex) => columnIndex !== index)) })}>Remove</button></th>)}<th><button type="button" className="paper-table-add" onClick={addColumn}>Add column</button></th></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((_, columnIndex) => <td key={columnIndex}><input aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} value={row[columnIndex] ?? ''} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}/></td>)}<td><button type="button" className="paper-table-remove" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => onChange({ rows: rows.filter((_, index) => index !== rowIndex) })}>Remove row</button></td></tr>)}</tbody></table>{!rows.length && <small>Add rows and enter the table values.</small>}</div><button type="button" className="paper-table-add-row" onClick={addRow}>Add row</button></div>
}

function ProgrammeAssignmentRow({ assignment, index, departmentId, departments, selectedProgrammeIds, session, onChange, onRemove }) {
  const [programmes, setProgrammes] = useState([])
  const [programmesLoading, setProgrammesLoading] = useState(false)
  const department = departments.find((item) => String(item.id) === String(departmentId))
  useEffect(() => {
    let active = true
    const loadProgrammes = async () => {
      if (!department) return
      setProgrammesLoading(true)
      try {
        const records = session.authProvider === 'php-mysql'
          ? await listAcademicRecords(session.token, 'programmes', department.id)
          : await listCollection(session.idToken, `${department.firestorePath}/programmes`, { pageSize: 250 })
        if (active) setProgrammes(records)
      } catch {
        if (active) setProgrammes([])
      } finally { if (active) setProgrammesLoading(false) }
    }
    void loadProgrammes()
    return () => { active = false }
  }, [department, session])
  const update = (changes) => onChange({ ...assignment, ...changes })
  const legacyProgramme = assignment.programmeId && !programmes.some((item) => String(item.id) === String(assignment.programmeId))
  return <article className="paper-programme-row">
    <header><strong>Programme {index + 1}</strong><button type="button" className="paper-programme-remove" onClick={onRemove}>Remove</button></header>
    <div className="paper-programme-fields">
      <label>Programme<select required disabled={!department || programmesLoading} value={assignment.programmeId || ''} onChange={(event) => {
        const selected = programmes.find((item) => String(item.id) === event.target.value)
        update({ programmeId: selected?.id || '', programmeName: selected?.name || '', studyYear: '' })
      }}><option value="">{programmesLoading ? 'Loading programmes…' : 'Select programme'}</option>{legacyProgramme && <option value={assignment.programmeId}>{assignment.programmeName} (saved)</option>}{programmes.filter((item) => !selectedProgrammeIds.includes(String(item.id)) || String(item.id) === String(assignment.programmeId)).map((item) => <option key={item.id} value={item.id}>{item.name}{item.alias ? ` (${item.alias})` : ''}</option>)}</select></label>
      <label>Study year<select required value={assignment.studyYear || ''} onChange={(event) => update({ studyYear: event.target.value ? Number(event.target.value) : '' })}><option value="">Select year</option>{[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}</select></label>
    </div>
  </article>
}

export default function PaperReviewEditor({ paper, session, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => {
    const oldAssignments = paper.programmeAssignments || []
    return {
      ...paper,
      departmentId: paper.departmentId || oldAssignments[0]?.departmentId || '',
      departmentName: paper.departmentName || oldAssignments[0]?.departmentName || '',
      programmeAssignments: oldAssignments.map((assignment) => ({ programmeId: assignment.programmeId || '', programmeName: assignment.programmeName || '', studyYear: assignment.studyYear || assignment.studyYears?.[0] || '' })),
      questions: (paper.questions || []).map((question) => ({ ...question, content: question.content || [], subquestions: question.subquestions || [] })),
    }
  })
  const [departments, setDepartments] = useState([])
  const [departmentsLoading, setDepartmentsLoading] = useState(true)
  const [departmentError, setDepartmentError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [currentYear] = useState(() => new Date().getFullYear())
  const normalizedSemester = String(draft.semester || '').match(/^\s*(?:semester\s*)?([12])\s*$/i)?.[1] || ''
  useEffect(() => {
    let active = true
    const loadDepartments = async () => {
      setDepartmentsLoading(true)
      setDepartmentError('')
      try {
        const records = session.authProvider === 'php-mysql'
          ? await listAcademicRecords(session.token, 'departments')
          : await listFirestoreDepartments(session.idToken)
        if (active) setDepartments(records)
      } catch (error) {
        if (active) setDepartmentError(error.message || 'Could not load departments.')
      } finally { if (active) setDepartmentsLoading(false) }
    }
    void loadDepartments()
    return () => { active = false }
  }, [session])
  const update = (key, value) => {
    setMetadataError('')
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const updateQuestion = (index, question) => update('questions', draft.questions.map((item, current) => current === index ? question : item))
  const removeQuestion = (index) => update('questions', draft.questions.filter((_, current) => current !== index).map((question, order) => ({ ...question, order: order + 1 })))
  const save = () => {
    if (!examTypes.includes(draft.title)) {
      setMetadataError('Choose an exam type from the list.')
      return
    }
    if (!normalizedSemester) {
      setMetadataError('Choose Semester 1 or Semester 2.')
      return
    }
    if (!draft.departmentId) {
      setMetadataError('Choose a department for this paper.')
      return
    }
    const year = Number(draft.year)
    if (!Number.isInteger(year) || year < 2015 || year > currentYear) {
      setMetadataError(`Choose an exam year from 2015 through ${currentYear}.`)
      return
    }
    const hasIncompleteAssignment = (draft.programmeAssignments || []).some((assignment) => !assignment.programmeId || !assignment.studyYear)
    if (hasIncompleteAssignment) {
      setMetadataError('Complete each programme assignment and choose its study year.')
      return
    }
    onSave({ ...draft, semester: normalizedSemester })
  }
  return <div className="paper-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="paper-review-editor" role="dialog" aria-modal="true" aria-labelledby="paper-review-title">
      <header className="paper-review-header"><div><span className="section-kicker">PAPER LIBRARY · REVIEW</span><h2 id="paper-review-title">Review paper</h2><p>Check the details and add or correct its questions before saving.</p></div><button type="button" className="paper-icon-button" aria-label="Close review" disabled={saving} onClick={onClose}><Icon name="close" size={18}/></button></header>
      <div className="paper-review-body">
        <section className="paper-metadata-card"><h3>Paper details</h3><div className="paper-metadata-grid"><label>Exam type<select required value={draft.title || ''} onChange={(event) => update('title', event.target.value)}><option value="">Select exam type</option>{examTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Course<input value={draft.course || ''} placeholder="Course or subject" onChange={(event) => update('course', event.target.value)}/></label><label>Exam year<select required value={draft.year || ''} onChange={(event) => update('year', event.target.value)}><option value="">Select exam year</option>{Array.from({ length: Math.max(0, currentYear - 2014) }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Semester<select required value={normalizedSemester} onChange={(event) => update('semester', event.target.value)}><option value="">Select semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label></div><label className="paper-department-field">Department<select required disabled={departmentsLoading} value={draft.departmentId || ''} onChange={(event) => {
          const department = departments.find((item) => String(item.id) === event.target.value)
          setMetadataError('')
          setDraft((current) => ({ ...current, departmentId: department?.id || '', departmentName: department?.name || '', programmeAssignments: [] }))
        }}><option value="">{departmentsLoading ? 'Loading departments…' : 'Select department'}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.schoolName ? ` — ${department.schoolName}` : ''}{department.collegeName ? `, ${department.collegeName}` : ''}</option>)}</select></label>{metadataError && <small className="paper-field-error" role="alert">{metadataError}</small>}{departmentError && <small className="paper-field-error" role="alert">{departmentError}</small>}{!departmentsLoading && !departmentError && !departments.length && <small className="paper-directory-status">No departments found. Add departments in Academic structure first.</small>}<div className="paper-programmes-heading"><div><h3>Programmes</h3><p>Choose multiple programmes; set one study year for each.</p></div><button type="button" className="paper-programme-add" onClick={() => update('programmeAssignments', [...(draft.programmeAssignments || []), { programmeId: '', programmeName: '', studyYear: '' }])} disabled={!draft.departmentId}>Add programme</button></div>{!draft.departmentId && <small className="paper-directory-status">Select a department before adding programmes.</small>}{(draft.programmeAssignments || []).map((assignment, index) => <ProgrammeAssignmentRow key={`${assignment.programmeId || 'new'}-${index}`} assignment={assignment} index={index} departmentId={draft.departmentId} departments={departments} selectedProgrammeIds={draft.programmeAssignments.filter((_, itemIndex) => itemIndex !== index).map((item) => String(item.programmeId || ''))} session={session} onChange={(updated) => update('programmeAssignments', draft.programmeAssignments.map((item, itemIndex) => itemIndex === index ? updated : item))} onRemove={() => update('programmeAssignments', draft.programmeAssignments.filter((_, itemIndex) => itemIndex !== index))}/>)}</section>
        <div className="paper-questions-heading"><div><h3>Questions <span>{draft.questions.length}</span></h3><p>Each question can include prompt content and nested sub-questions.</p></div><strong>{draft.questions.reduce((sum, question) => sum + Number(question.marks || 0), 0)} marks</strong></div>
        {draft.questions.map((question, index) => <QuestionCard key={question.id || index} question={question} index={index} session={session} onChange={(updated) => updateQuestion(index, updated)} onRemove={() => removeQuestion(index)}/>)}
        {!draft.questions.length && <div className="paper-no-questions"><Icon name="file" size={22}/><strong>No questions yet</strong><span>Add a question to start entering the paper contents.</span></div>}
        <button type="button" className="paper-add-question" onClick={() => update('questions', [...draft.questions, freshQuestion(draft.questions.length)])}><Icon name="plus" size={16}/> Add question</button>
      </div>
      <footer className="paper-review-footer"><span>{draft.questions.length} questions in this paper</span><div><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="paper-save-button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save paper'}</button></div></footer>
    </section>
  </div>
}
