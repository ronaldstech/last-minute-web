import Icon from './Icon.jsx'
import './PaperList.css'

export default function PaperList({ papers, savedIds = [], onOpen, onToggleSaved, showSave = false, loading = false, recommendationReasons = {}, layout = 'cards' }) {
  if (loading) return <div className="content-loader"><span className="notification-spinner" /> Loading papers…</div>
  if (papers.length === 0) {
    return <div className="empty-panel"><span className="empty-icon"><Icon name="file" size={24} /></span><h3>No papers found</h3><p>Try another search or choose a different module.</p></div>
  }

  if (layout === 'table') return <div className="paper-table-wrap"><table className="paper-table"><thead><tr><th>Paper</th><th className="paper-table-col-department">Department</th><th className="paper-table-col-programmes">Programmes</th><th>Year</th><th className="paper-table-col-semester">Semester</th><th className="paper-table-col-questions">Questions</th><th className="paper-table-col-access">Access</th><th>Actions</th></tr></thead><tbody>
    {papers.map((paper) => {
      const isSaved = savedIds.includes(paper.id)
      const dailyUnlockCost = Number.isFinite(Number(paper.unlockPricing?.daily)) ? Number(paper.unlockPricing.daily) : 20
      const questionCount = Number(paper.questionCount || paper.questions?.length || 0)
      const programmes = paper.programmeAssignments || []
      const mobileProgrammeAliases = programmes.map((assignment) => `${assignment.alias || assignment.programmeAlias || assignment.programmeName || 'Programme'}${assignment.studyYear ? ` Y${assignment.studyYear}` : ''}`)
      return <tr key={paper.id}>
        <td><button className="paper-table-open" type="button" onClick={() => onOpen(paper)}><span className={`paper-subject-icon ${paper.tone}`}><Icon name={paper.icon} size={17}/></span><span><strong>{paper.course || paper.subject || paper.title || 'Question paper'}</strong><small>{paper.title && paper.title !== paper.course ? paper.title : 'Question paper'}</small><small className="paper-table-mobile-meta">{[paper.semester ? `Semester ${paper.semester}` : '', questionCount ? `${questionCount} questions` : '', ...mobileProgrammeAliases].filter(Boolean).join(' · ')}</small>{recommendationReasons[paper.id] && <em><Icon name="spark" size={12}/>{recommendationReasons[paper.id]}</em>}</span></button></td>
        <td className="paper-table-col-department"><div className="paper-table-department"><strong>{paper.departmentName || 'Department not specified'}</strong></div></td>
        <td className="paper-table-col-programmes"><div className="paper-table-department">{programmes.length > 0 ? <small>{programmes.map((assignment) => `${assignment.alias || assignment.programmeAlias || assignment.programmeName || 'Programme'}${assignment.studyYear ? ` · Year ${assignment.studyYear}` : ''}`).join(', ')}</small> : <small>No programme assignments</small>}</div></td>
        <td><span className="paper-table-year">{paper.year || '—'}</span></td>
        <td className="paper-table-col-semester">{paper.semester ? `Semester ${paper.semester}` : '—'}</td>
        <td className="paper-table-col-questions">{questionCount || '—'}</td>
        <td className="paper-table-col-access"><span className={`paper-table-access ${paper.isUnlocked ? 'is-unlocked' : ''}`} aria-label={paper.isUnlocked ? 'Unlocked' : `Locked, costs ${dailyUnlockCost.toLocaleString()} coins to unlock`}>{paper.isUnlocked ? <><Icon name="check" size={13}/> Unlocked</> : <><Icon name="lock" size={13}/>{dailyUnlockCost.toLocaleString()} coins</>}</span></td>
        <td><div className="paper-table-actions">{showSave && <button type="button" className={`save-button ${isSaved ? 'is-saved' : ''}`} aria-label={isSaved ? 'Remove saved paper' : 'Save paper'} aria-pressed={isSaved} onClick={() => onToggleSaved(paper.id)}><Icon name="bookmark" size={16}/></button>}<button className="paper-table-view" type="button" aria-label={`Open ${paper.course || paper.subject || paper.title || 'question paper'}`} onClick={() => onOpen(paper)}>Open <Icon name="right" size={14}/></button></div></td>
      </tr>
    })}
  </tbody></table></div>

  return (
    <div className="paper-list">
      {papers.map((paper) => {
        const isSaved = savedIds.includes(paper.id)
        const dailyUnlockCost = Number.isFinite(Number(paper.unlockPricing?.daily)) ? Number(paper.unlockPricing.daily) : 20
        const questionCount = Number(paper.questionCount || paper.questions?.length || 0)
        return (
          <article className="paper-row" key={paper.id}>
            <button className="paper-open" onClick={() => onOpen(paper)} aria-label={`Open ${paper.course || paper.subject}, ${paper.title}`}>
              <span className={`paper-subject-icon ${paper.tone}`}><Icon name={paper.icon} size={19} /></span>
              <span className="paper-info">
                <span className="paper-card-overline"><span className={`paper-subject ${paper.tone}-text`}>{paper.subject && paper.subject !== paper.course ? paper.subject : paper.title || 'Question paper'}</span>{paper.year && <span className="paper-card-year">{paper.year}</span>}</span>
                <strong>{paper.course || paper.subject || paper.title || 'Question paper'}</strong>
                <span className="paper-card-details">{[paper.course && paper.title && paper.title !== paper.course ? paper.title : '', paper.semester ? `Semester ${paper.semester}` : '', paper.departmentName, questionCount > 0 ? `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}` : '', paper.detail].filter(Boolean).map((detail, index) => <small key={`${detail}-${index}`}>{detail}</small>)}</span>
                {recommendationReasons[paper.id] && <span className="paper-recommendation-reason"><Icon name="spark" size={12} /> {recommendationReasons[paper.id]}</span>}
                {paper.programmeAssignments?.length > 0 && <span className="paper-card-programmes">{paper.programmeAssignments.slice(0, 2).map((assignment, index) => <span key={`${assignment.programmeId || assignment.programmeName}-${index}`}>{assignment.programmeName || 'Programme'}{assignment.studyYear ? ` | Year ${assignment.studyYear}` : ''}</span>)}{paper.programmeAssignments.length > 2 && <span>+{paper.programmeAssignments.length - 2} programmes</span>}</span>}
              </span>
            </button>
            <div className="paper-card-actions">
            {showSave && (
              <button
                className={`save-button ${isSaved ? 'is-saved' : ''}`}
                aria-label={isSaved ? 'Remove saved paper' : 'Save paper'}
                aria-pressed={isSaved}
                onClick={() => onToggleSaved(paper.id)}
              >
                <Icon name="bookmark" size={17} />
              </button>
            )}
            <span className={`paper-lock ${paper.isUnlocked ? 'is-unlocked' : ''}`} aria-label={paper.isUnlocked ? 'Paper unlocked' : `One-day unlock costs ${dailyUnlockCost.toLocaleString()} coins`}>{paper.isUnlocked ? <><Icon name="check" size={13} /> <b>Unlocked</b></> : <><Icon name="lock" size={13} /> <b>{dailyUnlockCost.toLocaleString()} coins</b></>}</span>
            <button className="row-arrow" aria-label="Open paper" onClick={() => onOpen(paper)}>
              <Icon name="right" size={16} />
            </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
