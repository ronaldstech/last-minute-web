const TABLE_ANSWER_PREFIX = '\u0000LAST_MINUTE_TABLE_ANSWER:'

export function decodeTableAnswer(answer) {
  if (typeof answer !== 'string' || !answer.startsWith(TABLE_ANSWER_PREFIX)) return null
  try {
    const value = JSON.parse(answer.slice(TABLE_ANSWER_PREFIX.length))
    if (!Array.isArray(value.columns) || !Array.isArray(value.rows)) return null
    return {
      columns: value.columns.map((cell) => String(cell ?? '')),
      rows: value.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []),
    }
  } catch { return null }
}

export function encodeTableAnswer(table) {
  return `${TABLE_ANSWER_PREFIX}${JSON.stringify({
    columns: table.columns.map((cell) => String(cell ?? '')),
    rows: table.rows.map((row) => row.map((cell) => String(cell ?? ''))),
  })}`
}

export function practiceAnswerText(answer) {
  const table = decodeTableAnswer(answer)
  if (!table) return typeof answer === 'string' ? answer : ''
  const escapeCell = (cell) => cell.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const header = `| ${table.columns.map(escapeCell).join(' | ')} |`
  const divider = `| ${table.columns.map(() => '---').join(' | ')} |`
  const rows = table.rows.map((row) => `| ${table.columns.map((_, index) => escapeCell(row[index] || '')).join(' | ')} |`)
  return [header, divider, ...rows].join('\n')
}

export function hasPracticeAnswerContent(answer) {
  const table = decodeTableAnswer(answer)
  if (table) return table.columns.some((cell) => cell.trim()) || table.rows.some((row) => row.some((cell) => cell.trim()))
  return typeof answer === 'string' && answer.trim().length > 0
}
