import { commitWrites, deleteDocument, documentName, encodeFields, getOptionalDocument, listCollectionPage, patchDocument, queryCollection, setDocument } from './firestore.js'

export async function listPapers(token) {
  const page = await listCollectionPage(token, 'papers', {
    orderBy: 'updatedAt', descending: true, pageSize: 100,
    fields: ['title', 'course', 'schoolName', 'departmentName', 'year', 'semester', 'questionCount', 'updatedAt', 'createdAt'],
  })
  return page.documents.map((paper) => {
    const course = paper.course || paper.schoolName || paper.departmentName || 'QUESTION PAPER'
    const date = [paper.course, paper.year, `${Number(paper.questionCount || 0)} questions`].filter(Boolean).join(' · ')
    const toneSet = ['mint', 'blue', 'peach', 'violet', 'yellow']
    const iconSet = ['flask', 'sigma', 'beaker', 'atom', 'book']
    const index = Math.abs([...course].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % toneSet.length
    return { ...paper, subject: String(course).toUpperCase(), detail: date, icon: iconSet[index], tone: toneSet[index] }
  })
}

export async function listSavedPaperIds(token, userId) {
  const page = await listCollectionPage(token, `users/${userId}/savedPapers`, { orderBy: 'savedAt', descending: true, pageSize: 100, fields: ['paperId'] })
  return page.documents.map((document) => document.id)
}

export async function setPaperSaved(token, userId, paperId, isSaved) {
  const path = `users/${userId}/savedPapers/${paperId}`
  if (isSaved) {
    await setDocument(token, path, { paperId, savedAt: new Date() })
  } else {
    await deleteDocument(token, path)
  }
}

export async function fetchUserProfile(token, userId) {
  return getOptionalDocument(token, `users/${userId}`)
}

export async function updateUserProfile(token, userId, profile) {
  const editable = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined))
  await patchDocument(token, `users/${userId}`, editable)
}

export async function initializeUserProfile(token, session, phoneNumber) {
  const existing = await fetchUserProfile(token, session.userId)
  if (existing) return existing
  const profile = {
    uid: session.userId,
    username: session.name || '',
    email: session.email || '',
    phoneNumber,
    coinBalance: 0,
    freeCoinBalance: 50,
    welcomeBonusGranted: true,
    avatarIndex: 0,
    phoneVerified: false,
  }
  const notificationId = `welcome-bonus-${session.userId}`
  const writes = [
    { update: { name: documentName(`users/${session.userId}`), fields: encodeFields(profile) } },
    { update: { name: documentName(`notifications/${notificationId}`), fields: encodeFields({ title: 'Welcome! Here are 50 free coins', body: 'Your 50 welcome coins are ready to use for paper unlocks and mark your answers.', kind: 'success', userId: session.userId, createdBy: session.userId, createdAt: new Date(), details: { 'Free coins': '50' }, readBy: [] }) } },
  ]
  await commitWrites(token, writes)
  return profile
}

export async function listMyGroups(token, userId) {
  const groups = await queryCollection(token, 'studyGroups', 'memberIds', 'ARRAY_CONTAINS', userId)
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listMyInvitations(token, userId) {
  const invitations = await queryCollection(token, 'groupInvitations', 'inviteeId', 'EQUAL', userId)
  return invitations.filter((invite) => invite.status === 'pending').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

export async function createStudyGroup(token, userId, ownerName, data) {
  const id = crypto.randomUUID().replaceAll('-', '')
  await setDocument(token, `studyGroups/${id}`, {
    name: data.name.trim(),
    description: data.description.trim(),
    course: data.course.trim(),
    ownerId: userId,
    ownerName,
    memberIds: [userId],
    createdAt: new Date(),
  })
  return id
}

export async function respondToInvitation(token, invitation, userId, accept) {
  if (invitation.inviteeId !== userId || invitation.status !== 'pending') {
    throw new Error('This invitation is no longer available for your account.')
  }
  const status = accept ? 'accepted' : 'declined'
  const writes = [
    { update: { name: documentName(`groupInvitations/${invitation.id}`), fields: encodeFields({ status, respondedAt: new Date() }) }, updateMask: { fieldPaths: ['status', 'respondedAt'] } },
    { update: { name: documentName(`notifications/group-invite-${invitation.id}`), fields: encodeFields({ actionStatus: status }) }, updateMask: { fieldPaths: ['actionStatus'] } },
    { transform: { document: documentName(`notifications/group-invite-${invitation.id}`), fieldTransforms: [{ fieldPath: 'readBy', appendMissingElements: { values: [{ stringValue: userId }] } }] } },
  ]
  if (accept) writes.splice(1, 0, { transform: { document: documentName(`studyGroups/${invitation.groupId}`), fieldTransforms: [{ fieldPath: 'memberIds', appendMissingElements: { values: [{ stringValue: userId }] } }] } })
  await commitWrites(token, writes)
}

export async function listMyTransactions(token, userId) {
  const transactions = await queryCollection(token, 'transactions', 'userId', 'EQUAL', userId)
  return transactions.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
}

export async function creditCoinsOnce(token, userId, chargeId, amount) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transaction = await getOptionalDocument(token, `transactions/${chargeId}`)
    if (!transaction) throw new Error('The payment record could not be found.')
    if (transaction.credited === true) return false
    try {
      await commitWrites(token, [
        {
          update: { name: documentName(`transactions/${chargeId}`), fields: encodeFields({ credited: true, updatedAt: new Date() }) },
          updateMask: { fieldPaths: ['credited', 'updatedAt'] },
          ...(transaction.updateTime ? { currentDocument: { updateTime: transaction.updateTime } } : {}),
        },
        {
          transform: {
            document: documentName(`users/${userId}`),
            fieldTransforms: [{ fieldPath: 'coinBalance', increment: { integerValue: amount } }],
          },
        },
      ])
      return true
    } catch (error) {
      if (attempt === 2 || !error.message.includes('ABORTED')) throw error
    }
  }
  return false
}
