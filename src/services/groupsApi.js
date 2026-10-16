import { API_BASE_URL } from './apiConfig.js'

async function request(path, token, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('Could not connect to the online study groups. Check your connection and try again.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'The study groups service could not complete the request.')
  return result
}

export async function loadGroups(token) {
  const result = await request('/groups', token)
  return result.groups || []
}

export async function loadGroupInvitations(token) {
  const result = await request('/groups/invitations', token)
  return result.invitations || []
}

export async function createBackendGroup(token, data) {
  const result = await request('/groups', token, { method: 'POST', body: data })
  return result.group
}

export async function inviteToBackendGroup(token, groupId, email) {
  return request('/groups/invitations', token, { method: 'POST', body: { groupId, email } })
}

export async function respondToBackendInvitation(token, invitationId, accept) {
  return request('/groups/invitations/respond', token, { method: 'POST', body: { invitationId, accept } })
}

export async function loadBackendGroupMessages(token, groupId, before = '') {
  const query = new URLSearchParams({ groupId, ...(before ? { before } : {}) })
  return request(`/groups/messages?${query}`, token)
}

export async function sendBackendGroupMessage(token, groupId, text) {
  return request(`/groups/messages?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { text } })
}

export async function loadBackendGroupPlans(token, groupId) {
  const result = await request(`/groups/plans?groupId=${encodeURIComponent(groupId)}`, token)
  return result.plans || []
}

export async function scheduleBackendGroupDiscussion(token, groupId, paperId, scheduledAt) {
  return request(`/groups/plans?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { paperId, scheduledAt: new Date(scheduledAt).toISOString() } })
}

export async function joinBackendGroupDiscussion(token, groupId, planId) {
  return request(`/groups/plans/join?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { planId } })
}

export async function publishBackendNextQuestion(token, groupId, planId) {
  const result = await request(`/groups/plans/next?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { planId } })
  return result.published
}

export async function endBackendGroupDiscussion(token, groupId, planId) {
  const result = await request(`/groups/plans/end?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { planId } })
  return result.ended
}

export async function publishBackendDueQuestions(token, groupId) {
  const result = await request(`/groups/plans/publish-due?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: {} })
  return result.published
}

export async function answerBackendDiscussionQuestion(token, groupId, questionId, answer) {
  return request(`/groups/plans/answer?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { questionId, answer } })
}

export async function saveBackendDiscussionMarks(token, groupId, questionId, results) {
  return request(`/groups/plans/mark?groupId=${encodeURIComponent(groupId)}`, token, { method: 'POST', body: { questionId, results } })
}
