export function hasAnswerablePrompt(question) {
  if (question?.subquestions?.length) return false
  const blocks = Array.isArray(question?.content) ? question.content : []
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0
  return hasText(question?.text) || blocks.some((block) => (
    hasText(block?.text) || hasText(block?.code) || hasText(block?.path) || Boolean(block?.items?.length || block?.rows?.length)
  )) || Boolean(question?.assets?.length)
}
