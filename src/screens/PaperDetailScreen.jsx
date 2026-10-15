import Icon from '../components/Icon.jsx'

const questions = [
  'Define the key terms used in this topic.',
  'Explain your answer with a suitable example.',
  'Show all working and give your answer clearly.',
]

export default function PaperDetailScreen({ paper, activeTab, balance, onBack, showNotice }) {
  return (
    <section className="paper-detail-screen">
      <button className="back-link" onClick={onBack}>← Back to {activeTab.toLowerCase()}</button>
      <span className={`paper-subject ${paper.tone}-text`}>{paper.subject}</span>
      <h1>{paper.title}</h1>
      <p>{paper.detail}</p>
      <div className="detail-document">
        <span><Icon name="file" size={18} /> EXAM PAPER</span>
        <h2>{paper.title}</h2>
        <p>Section A · Answer all questions in this section.</p>
        {questions.map((question, index) => (
          <div className="question-preview" key={question}><strong>{index + 1}.</strong><span>{question}</span><i>[4 marks]</i></div>
        ))}
      </div>
      <button className="primary-button unlock-button" onClick={() => showNotice(`Unlocking this paper costs 20 coins. Your balance is ${balance}.`)}><Icon name="lock" size={16} /> Unlock paper · 20 coins</button>
    </section>
  )
}
