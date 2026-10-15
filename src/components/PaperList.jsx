import Icon from './Icon.jsx'

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
          <div className="paper-row" key={paper.id}>
            <button className="paper-open" onClick={() => onOpen(paper)}>
              <span className={`paper-subject-icon ${paper.tone}`}><Icon name={paper.icon} size={19} /></span>
              <span className="paper-info">
                <span className={`paper-subject ${paper.tone}-text`}>{paper.subject}</span>
                <strong>{paper.title}</strong>
                <small>{paper.detail}</small>
              </span>
            </button>
            {showSave && (
              <button
                className={`save-button ${isSaved ? 'is-saved' : ''}`}
                aria-label={isSaved ? 'Remove saved paper' : 'Save paper'}
                onClick={() => onToggleSaved(paper.id)}
              >
                <Icon name="bookmark" size={17} />
              </button>
            )}
            <span className="paper-lock"><Icon name="lock" size={13} /> <b>20</b></span>
            <button className="row-arrow" aria-label="Open paper" onClick={() => onOpen(paper)}>
              <Icon name="right" size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
