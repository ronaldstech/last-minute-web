import { commitWrites, documentName, encodeFields, getOptionalDocument, listCollection, listCollectionPage, setDocument } from './firestore.js'

const messagePath = (groupId) => `studyGroups/${groupId}/messages`
const planPath = (groupId) => `studyGroups/${groupId}/plans`

export async function listGroupMessages(token, groupId, pageToken = '') {
  const page = await listCollectionPage(token, messagePath(groupId), { orderBy: 'createdAt', descending: true, pageSize: 30, pageToken })
  return { messages: page.documents.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)), nextPageToken: page.nextPageToken }
}

export async function listGroupPlans(token, groupId) {
  const plans = await listCollection(token, planPath(groupId), { orderBy: 'scheduledAt' })
  return plans.sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0))
}

async function requireMember(token, group, userId) {
  const current = await getOptionalDocument(token, `studyGroups/${group.id}`)
  if (!current || !(current.memberIds || []).includes(userId)) throw new Error('Only group members can participate in this discussion.')
  return current
}

export async function postGroupMessage(token, group, userId, senderName, text) {
  const current = await requireMember(token, group, userId)
  const id = crypto.randomUUID().replaceAll('-', '')
  await setDocument(token, `${messagePath(group.id)}/${id}`, { senderId: userId, senderName, text: text.trim(), createdAt: new Date() })
  return current
}

function questionContent(question) {
  const content = Array.isArray(question.content) ? question.content : []
  return content.length ? content : question.text ? [{ type: 'paragraph', text: question.text }] : []
}

function flattenDiscussionQuestions(questions = []) {
  const prompts = []
  const visit = (question, number, context = []) => {
    const children = question.subquestions || []
    const text = questionContent(question)
    if (!children.length) {
      if (text.length) prompts.push({
        number, text: question.text || text.map((block) => block.text || block.title || '').filter(Boolean).join('\n'),
        content: text, assets: question.assets || [], marks: question.marks ?? null, context,
      })
      return
    }
    const nextContext = [...context, { number, text: question.text || text.map((block) => block.text || block.title || '').filter(Boolean).join('\n'), content: text, assets: question.assets || [], marks: question.marks ?? null }]
    children.forEach((part, index) => {
      const partNumber = part.number || String.fromCharCode(97 + index)
      visit(part, `${number}(${partNumber})`, nextContext)
    })
  }
  questions.forEach((question, index) => visit(question, String(question.number || index + 1)))
  return prompts
}

export async function scheduleGroupDiscussion(token, group, userId, paper, scheduledAt) {
  const current = await requireMember(token, group, userId)
  if (current.ownerId !== userId) throw new Error('Only the group creator can schedule discussions.')
  if (!paper?.id) throw new Error('Choose a paper with a valid paper ID.')
  const questions = flattenDiscussionQuestions(paper.questions || [])
  if (!questions.length) throw new Error('This paper does not have discussion questions yet.')
  const id = crypto.randomUUID().replaceAll('-', '')
  const date = new Date(scheduledAt)
  const details = { examType: paper.title || paper.name || 'Paper discussion', course: paper.course || '', year: paper.year || '', semester: paper.semester || '', questionCount: questions.length }
  const plan = {
    groupId: group.id, paperId: paper.id, paperTitle: details.examType, course: details.course,
    year: details.year, semester: details.semester, paperDetails: details, questions, questionCount: questions.length,
    scheduledAt: date, createdBy: userId, createdAt: new Date(), joinedMemberIds: [], currentQuestionIndex: -1,
  }
  const messageId = crypto.randomUUID().replaceAll('-', '')
  plan.announcementMessageId = messageId
  const writes = [
    { update: { name: documentName(`${planPath(group.id)}/${id}`), fields: encodeFields(plan) } },
    { update: { name: documentName(`${messagePath(group.id)}/${messageId}`), fields: encodeFields({
      senderId: userId, senderName: 'Last Minute', text: 'A group discussion has been scheduled.',
      paperDetails: details, discussionAt: date, discussionPlanId: id, joinedMemberIds: [], createdAt: new Date(),
    }) } },
  ]
  for (const memberId of current.memberIds || []) writes.push({ update: { name: documentName(`notifications/group-plan-${id}-${memberId}`), fields: encodeFields({
    title: 'Group discussion scheduled', body: `${group.name}: ${details.examType}`, kind: 'info',
    userId: memberId, createdBy: userId, createdAt: new Date(),
    details: { Group: group.name, Paper: details.examType, 'Discussion time': date.toLocaleString() },
    readBy: [], actionStatus: null,
  }) } })
  await commitWrites(token, writes)
}

export async function joinGroupDiscussion(token, group, userId, plan) {
  await requireMember(token, group, userId)
  if (plan.endedAt) throw new Error('This discussion has ended.')
  if (new Date(plan.scheduledAt).getTime() > Date.now()) throw new Error('You can join when the discussion starts.')
  const transforms = [
    { transform: { document: documentName(`${planPath(group.id)}/${plan.id}`), fieldTransforms: [{ fieldPath: 'joinedMemberIds', appendMissingElements: { values: [{ stringValue: userId }] } }] } },
  ]
  if (plan.announcementMessageId) transforms.push({ transform: { document: documentName(`${messagePath(group.id)}/${plan.announcementMessageId}`), fieldTransforms: [{ fieldPath: 'joinedMemberIds', appendMissingElements: { values: [{ stringValue: userId }] } }] } })
  await commitWrites(token, transforms)
}

export async function publishNextDiscussionQuestion(token, group, userId, plan) {
  if (group.ownerId !== userId) throw new Error('Only the group creator can advance discussion questions.')
  if (plan.endedAt) throw new Error('This discussion has ended.')
  const index = Number(plan.currentQuestionIndex ?? -1) + 1
  const question = plan.questions?.[index]
  if (!question) return false
  const id = `question-${plan.id}-${index}`
  const marks = Number(question.marks || 0)
  const text = `Question ${question.number || index + 1}${marks ? ` (${marks} marks)` : ''}\n${question.text}`
  await commitWrites(token, [
    { update: { name: documentName(`${messagePath(group.id)}/${id}`), fields: encodeFields({ senderId: userId, senderName: 'Last Minute', text, messageType: 'discussion_question', planId: plan.id, questionIndex: index, questionCount: plan.questions.length, ...(marks ? { maxMarks: marks } : {}), createdAt: new Date() }) } },
    { update: { name: documentName(`${planPath(group.id)}/${plan.id}`), fields: encodeFields({ currentQuestionIndex: index }) }, updateMask: { fieldPaths: ['currentQuestionIndex'] } },
  ])
  return true
}

export async function answerDiscussionQuestion(token, group, userId, senderName, question, answer) {
  const current = await requireMember(token, group, userId)
  const plan = await getOptionalDocument(token, `${planPath(group.id)}/${question.planId}`)
  if (!plan || !(plan.joinedMemberIds || []).includes(userId)) throw new Error('Join this discussion before answering.')
  if (plan.endedAt) throw new Error('This discussion has ended.')
  if (Number(plan.currentQuestionIndex) !== Number(question.questionIndex)) throw new Error('This is no longer the current question.')
  const id = `answer-${question.id}-${userId}`
  if (await getOptionalDocument(token, `${messagePath(group.id)}/${id}`)) throw new Error('You have already responded to this question.')
  await setDocument(token, `${messagePath(group.id)}/${id}`, {
    senderId: userId, senderName, text: answer.trim() || 'Pass',
    messageType: answer.trim() ? 'discussion_answer' : 'discussion_pass',
    relatedQuestionId: question.id, planId: question.planId, questionIndex: question.questionIndex, createdAt: new Date(),
  })
  return current
}

export async function endGroupDiscussion(token, group, userId, plan) {
  if (group.ownerId !== userId) throw new Error('Only the group creator can end this discussion.')
  const current = await getOptionalDocument(token, `${planPath(group.id)}/${plan.id}`)
  if (!current) throw new Error('Discussion not found.')
  if (current.endedAt) return false
  if (Number(current.currentQuestionIndex ?? -1) < 0) throw new Error('Start the discussion before ending it.')
  await commitWrites(token, [{
    update: { name: documentName(`${planPath(group.id)}/${plan.id}`), fields: encodeFields({ endedAt: new Date() }) },
    updateMask: { fieldPaths: ['endedAt'] },
  }])
  return true
}

export async function publishDueDiscussionQuestions(token, group, userId, plans) {
  if (group.ownerId !== userId) return false
  let published = false
  for (const plan of plans) {
    if (!plan.endedAt && new Date(plan.scheduledAt).getTime() <= Date.now() && Number(plan.currentQuestionIndex ?? -1) < 0) {
      published = await publishNextDiscussionQuestion(token, group, userId, plan) || published
    }
  }
  return published
}
