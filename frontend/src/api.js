// In dev, VITE_API_URL is empty and Vite's proxy forwards /api/* → localhost:8000
// In production, set VITE_API_URL to your Railway backend URL in Vercel env vars
// e.g. VITE_API_URL=https://fitrag-backend.up.railway.app
let BASE = import.meta.env.VITE_API_URL ?? ''
if (BASE.endsWith('/')) {
  BASE = BASE.slice(0, -1)
}

async function handleResponse(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export async function createProfile(data) {
  return handleResponse(await fetch(`${BASE}/api/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }))
}

export async function sendMessage(userId, message) {
  return handleResponse(await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, message }),
  }))
}

export async function getProfile(userId) {
  return handleResponse(await fetch(`${BASE}/api/profile/${userId}`))
}

export async function getHistory(userId) {
  return handleResponse(await fetch(`${BASE}/api/history/${userId}`))
}

export async function generateOnboardingPlan(userId) {
  return handleResponse(await fetch(`${BASE}/api/onboarding-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  }))
}
