export function hasAnswerablePrompt(question) {
  if (String(question?.type || '').toLowerCase() === 'paragraph') return false
  const blocks = Array.isArray(question?.content) ? question.content : []
  return Boolean(question?.text?.trim()) || blocks.some((block) => block?.type && block.type !== 'paragraph') || Boolean(question?.assets?.length)
}
