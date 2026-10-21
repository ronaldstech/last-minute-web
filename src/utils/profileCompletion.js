export const PROFILE_COMPLETION_FIELDS = [
  'username', 'email', 'phoneNumber', 'college', 'school', 'department', 'program', 'yearOfStudy', 'semesterNumber',
]

export function getProfileCompletion(profile = {}, emailFallback = '') {
  const email = profile.email || emailFallback
  const completed = PROFILE_COMPLETION_FIELDS.filter((field) => String(field === 'email' ? email : profile[field] ?? '').trim()).length
  return Math.round(completed / PROFILE_COMPLETION_FIELDS.length * 100)
}
