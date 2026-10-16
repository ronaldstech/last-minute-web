import Icon from './Icon.jsx'
import './PaperList.css'

export default function PaperList({ papers, savedIds = [], onOpen, onToggleSaved, showSave = false, loading = false }) {
  if (loading) return <div className="content-loader"><span className="notification-spinner" /> Loading papers…</div>
  if (papers.length === 0) {
    return <div className="empty-panel"><span className="empty-icon"><Icon name="file" size={24} /></span><h3>No papers found</h3><p>Try another search or choose a different subject.</p></div>
  }

  return (
    <div className="paper-list">
      {papers.map((paper) => {
        const isSaved = savedIds.includes(paper.id)
        return (
          <article className="paper-row" key={paper.id}>
            <button className="paper-open" onClick={() => onOpen(paper)} aria-label={`Open ${paper.course || paper.subject}, ${paper.title}`}>
              <span className={`paper-subject-icon ${paper.tone}`}><Icon name={paper.icon} size={19} /></span>
              <span className="paper-info">
                <span className="paper-card-overline"><span className={`paper-subject ${paper.tone}-text`}>{paper.course || paper.subject}</span>{paper.year && <span className="paper-card-year">{paper.year}</span>}</span>
                <strong>{paper.title || 'Question paper'}</strong>
                <small>{[paper.semester ? `Semester ${paper.semester}` : '', paper.departmentName, paper.detail].filter(Boolean).join(' | ')}</small>
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
            <span className={`paper-lock ${paper.isUnlocked ? 'is-unlocked' : ''}`}>{paper.isUnlocked ? <><Icon name="check" size={13} /> <b>Unlocked</b></> : <><Icon name="lock" size={13} /> <b>20</b></>}</span>
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
