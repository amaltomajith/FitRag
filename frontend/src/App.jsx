import { useState, useCallback, useEffect } from 'react'
import ProfileForm from './ProfileForm'
import ChatWindow from './ChatWindow'
import { createProfile, sendMessage, getHistory, generateOnboardingPlan, getProfile } from './api'

const LS_KEY = 'fitrag_user_id'

/* â”€â”€ Stat row used in the sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StatRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] text-white/35 font-medium">{label}</span>
      <span className={`text-[11px] font-semibold ${accent ? 'text-white' : 'text-white/70'}`}>{value}</span>
    </div>
  )
}

export default function App() {
  const [userId, setUserId]     = useState(() => {
    const stored = localStorage.getItem(LS_KEY)
    return stored ? parseInt(stored, 10) : null
  })
  const [profile, setProfile]               = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError]     = useState(null)

  const [messages, setMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError]     = useState(null)
  const [isTyping, setIsTyping]       = useState(false)

  /* Load profile & history when userId changes */
  useEffect(() => {
    if (!userId) { setProfile(null); setMessages([]); return }
    getProfile(userId).then(setProfile).catch(console.error)
    getHistory(userId).then((hist) => {
      if (hist.messages?.length) {
        setMessages(hist.messages.map((m) => ({ role: m.role, content: m.content, media: [] })))
      }
    }).catch(console.error)
  }, [userId])

  const handleProfileSubmit = useCallback(async (data) => {
    setProfileLoading(true); setProfileError(null)
    try { return await createProfile(data) }
    catch (err) { setProfileError(err.message); throw err }
    finally { setProfileLoading(false) }
  }, [])

  const handleGeneratePlan = useCallback(async (uid, finalValues) => {
    setProfileLoading(true); setProfileError(null)
    try {
      await createProfile({ ...finalValues, user_id: uid })
      const planResult = await generateOnboardingPlan(uid)
      localStorage.setItem(LS_KEY, String(uid))
      setUserId(uid)
      setMessages([{ role: 'assistant', content: planResult.reply, media: planResult.media }])
    } catch (err) { setProfileError(err.message) }
    finally { setProfileLoading(false) }
  }, [])

  const handleSend = useCallback(async (text) => {
    if (!text.trim() || chatLoading) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setChatLoading(true); setChatError(null); setIsTyping(true)
    try {
      const result = await sendMessage(userId, text)
      setIsTyping(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply, media: result.media }])
    } catch (err) {
      setIsTyping(false); setChatError(err.message)
      setMessages((prev) => [...prev, { role: 'assistant', content: `âš ï¸ ${err.message}` }])
    } finally { setChatLoading(false) }
  }, [userId, chatLoading])

  const handleReset = () => { localStorage.removeItem(LS_KEY); setUserId(null); setMessages([]) }

  /* â”€â”€ BMI colour helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const bmiColour = (cat) => ({
    Normal:      'text-white',
    Underweight: 'text-white/60',
    Overweight:  'text-white/60',
    Obese:       'text-white/40',
  }[cat] ?? 'text-white/50')

  /* â”€â”€ BMI bar marker position (0â€‘100%) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const bmiPosition = (bmi) => Math.min(100, Math.max(0, ((parseFloat(bmi) - 10) / 35) * 100))

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <div className="min-h-screen min-h-dvh" style={{ background: '#000000' }}>

      {/* Subtle ambient top glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 70% 30% at 50% 0%, rgba(255,255,255,0.025) 0%, transparent 70%)' }}
        aria-hidden
      />

      {/* â”€â”€ ONBOARDING SCREEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!userId ? (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen min-h-dvh px-4 py-8">
          <div className="w-full max-w-md">
            <ProfileForm
              onSubmitProfile={handleProfileSubmit}
              onGeneratePlan={handleGeneratePlan}
              loading={profileLoading}
            />
            {profileError && (
              <div className="mt-3 px-4 py-2.5 rounded-xl text-white/50 text-xs text-center animate-fade-up"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {profileError}
              </div>
            )}
          </div>
        </div>

      ) : (
        /* â”€â”€ ACTIVE DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        <div className="relative z-10 flex flex-col md:flex-row md:items-stretch" style={{ height: '100dvh', minHeight: '100dvh', overflow: 'hidden' }}>

          {/* â”€â”€â”€ MOBILE: compact top bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {profile && (
            <div
              className="md:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,10,0.95)' }}
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white/60"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {(profile.name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white/80 truncate">{profile.name}</p>
                <p className="text-[10px] text-white/30 truncate">{profile.goal} Â· BMI {profile.bmi}</p>
              </div>
              <button
                onClick={handleReset}
                className="text-[10px] text-white/25 hover:text-white/60 transition-colors cursor-pointer px-3 py-1.5 rounded-lg"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                Reset
              </button>
            </div>
          )}

          {/* â”€â”€â”€ DESKTOP: full left sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            className="hidden md:flex glass-panel md:w-72 flex-shrink-0 flex-col animate-fade-up"
            style={{ maxHeight: '100dvh' }}
          >
            {/* Brand header */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold"
                  style={{ background: 'linear-gradient(145deg,#1e1e1e,#0a0a0a)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
                >
                  FR
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white/85 tracking-tight" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
                    FitRAG
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                    <span className="text-[9px] text-white/30 font-medium tracking-widest uppercase">Active Session</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="divider mx-5" />

            {/* Profile cards */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {profile ? (
                <>
                  {/* Member */}
                  <div>
                    <p className="label-caps mb-2">Member</p>
                    <div className="glass-card p-4 hover:translate-y-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white/70 flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          {(profile.name || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-white/85">{profile.name}</p>
                          <p className="text-[11px] text-white/35">{profile.age} yrs Â· {profile.height_cm} cm Â· {profile.weight_kg} kg</p>
                        </div>
                      </div>
                      <div className="glass-inset rounded-xl px-3 py-0.5">
                        <StatRow label="Region"    value={profile.region || 'â€”'} />
                        <StatRow label="Programme" value={profile.goal   || 'â€”'} />
                      </div>
                    </div>
                  </div>

                  {/* Targets */}
                  {profile.goal_type !== 'maintain' && (
                    <div>
                      <p className="label-caps mb-2">Targets</p>
                      <div className="glass-card p-4 hover:translate-y-0">
                        <div className="glass-inset rounded-xl px-3 py-0.5">
                          <StatRow label="Current"   value={`${profile.weight_kg} kg`} />
                          <StatRow label="Target"    value={`${profile.target_value} kg`} accent />
                          <StatRow label="Timeframe" value={`${profile.timeframe_weeks} wks`} />
                          <StatRow label="Pace"      value={`~${Math.abs(((profile.weight_kg - profile.target_value) / profile.timeframe_weeks)).toFixed(2)} kg/wk`} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BMI */}
                  {profile.bmi && (
                    <div>
                      <p className="label-caps mb-2">WHO BMI</p>
                      <div className="glass-card p-4 hover:translate-y-0">
                        <div className="flex justify-between items-baseline mb-3">
                          <span className={`text-2xl font-semibold tracking-tight ${bmiColour(profile.bmi_category)}`}>
                            {profile.bmi}
                          </span>
                          <span className="text-[10px] text-white/40 font-medium">{profile.bmi_category}</span>
                        </div>
                        <div className="relative h-1 w-full rounded-full overflow-hidden mb-1"
                          style={{ background: 'linear-gradient(90deg,#4a9eff 0%,#52d68a 25%,#f5a623 55%,#ff5c5c 100%)' }}>
                          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow"
                            style={{ left: `calc(${bmiPosition(profile.bmi)}% - 4px)` }} />
                        </div>
                        <div className="flex justify-between text-[8px] text-white/20 mt-1">
                          <span>Under</span><span>Normal</span><span>Over</span><span>Obese</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Health flags */}
                  <div>
                    <p className="label-caps mb-2">Health Flags</p>
                    <div className="glass-card p-4 hover:translate-y-0">
                      {profile.medical_conditions?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {profile.medical_conditions.map((med, i) => (
                            <span key={i} className="badge">{med}</span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          <span className="text-[11px] text-white/30">No restrictions</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3 animate-pulse">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/[0.03]" />)}
                </div>
              )}
            </div>

            {/* Reset footer */}
            <div className="px-5 pb-5 pt-3">
              <div className="divider mb-3" />
              <button
                onClick={handleReset}
                className="w-full py-2 rounded-xl text-[11px] font-medium text-white/25 hover:text-white/60 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                style={{ border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out / Reset
              </button>
            </div>
          </div>

          {/* â”€â”€â”€ Chat panel (full width on mobile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            className="glass-panel flex-1 overflow-hidden flex flex-col animate-fade-up md:rounded-none md:border-l md:border-t-0 rounded-none"
            style={{ animationDelay: '60ms' }}
          >
            <ChatWindow
              messages={messages}
              isTyping={isTyping}
              onSend={handleSend}
              loading={chatLoading}
              userId={userId}
            />
            {chatError && (
              <div className="px-4 pb-2 text-white/40 text-xs text-center">{chatError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
