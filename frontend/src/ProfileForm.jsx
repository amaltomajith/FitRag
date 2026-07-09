import { useState } from 'react'

const REGIONS = [
  'South Asian', 'East Asian', 'Mediterranean', 'Latin American',
  'West African', 'Middle Eastern', 'European', 'North American',
  'South East Asian', 'Other',
]

const GOALS = [
  'Weight Loss', 'Muscle Gain / Bulking', 'Maintenance',
  'Improve Endurance', 'Increase Flexibility', 'General Fitness',
]

const MEDICAL_OPTIONS = [
  { value: 'knee_pain',   label: 'Knee / joint pain' },
  { value: 'back_pain',   label: 'Back pain' },
  { value: 'hypertension',label: 'Hypertension' },
  { value: 'diabetes',    label: 'Diabetes' },
  { value: 'asthma',      label: 'Asthma' },
  { value: 'pregnancy',   label: 'Pregnancy' },
  { value: 'none',        label: 'None (healthy & active)' },
  { value: 'prefer_not',  label: 'Prefer not to say' },
]

/* ── Shared input styles ──────────────────────────────── */
const inputCls = `
  input-glow-focus w-full px-3.5 py-2.5 rounded-xl text-[13px]
  text-white/80 placeholder-white/20 transition-all
`
const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
}
/* Selects need an opaque dark bg or browsers auto-set the
   selected option's text to white on a white/transparent bg */
const selectStyle = {
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.75)',
  colorScheme: 'dark',
  appearance: 'none',
  WebkitAppearance: 'none',
}

/* ── Section header ───────────────────────────────────── */
function SectionHead({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white/40 flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {number}
      </div>
      <span className="label-caps">{title}</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}

/* ── Field label ──────────────────────────────────────── */
function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-medium text-white/35 mb-1.5">
      {children}
    </label>
  )
}

export default function ProfileForm({ onSubmitProfile, onGeneratePlan, loading }) {
  const [step, setStep] = useState('input')
  const [goalType, setGoalType] = useState('maintain')
  const [selectedMeds, setSelectedMeds] = useState([])
  const [customMed, setCustomMed] = useState('')
  const [showCustomMedInput, setShowCustomMedInput] = useState(false)
  const [profileResult, setProfileResult] = useState(null)
  const [formValues, setFormValues] = useState(null)
  const [useSuggestedTimeframe, setUseSuggestedTimeframe] = useState(true)

  const handleMedChange = (val) => {
    if (val === 'none' || val === 'prefer_not') {
      setSelectedMeds([val]); setShowCustomMedInput(false); return
    }
    let updated = selectedMeds.filter(m => m !== 'none' && m !== 'prefer_not')
    if (updated.includes(val)) {
      updated = updated.filter(m => m !== val)
      if (val === 'other') setShowCustomMedInput(false)
    } else {
      updated.push(val)
      if (val === 'other') setShowCustomMedInput(true)
    }
    setSelectedMeds(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    let meds = [...selectedMeds]
    if (meds.includes('other') && customMed.trim()) {
      meds = meds.filter(m => m !== 'other')
      meds.push(customMed.trim())
    }
    const payload = {
      name: fd.get('name') || 'Guest',
      age: parseInt(fd.get('age'), 10) || null,
      height_cm: parseFloat(fd.get('height_cm')) || null,
      weight_kg: parseFloat(fd.get('weight_kg')) || null,
      region: fd.get('region') || null,
      goal: fd.get('goal') || null,
      medical_conditions: meds,
      goal_type: fd.get('goal_type') || 'maintain',
      target_value: fd.get('goal_type') === 'maintain' ? null : parseFloat(fd.get('target_value')) || null,
      timeframe_weeks: parseInt(fd.get('timeframe_weeks'), 10) || null,
    }
    setFormValues(payload)
    try {
      const res = await onSubmitProfile(payload)
      setProfileResult(res)
      setStep('bmi_review')
    } catch (err) { console.error(err) }
  }

  const handleGeneratePlanClick = () => {
    let finalWeeks = formValues.timeframe_weeks
    if (!profileResult.feasible && useSuggestedTimeframe && profileResult.suggested_timeframe_weeks) {
      finalWeeks = profileResult.suggested_timeframe_weeks
    }
    onGeneratePlan(profileResult.user_id, { ...formValues, timeframe_weeks: finalWeeks })
  }

  const getBmiNote = (cat) => ({
    Underweight: 'Focus on safe weight gain with nutrient-dense, high-protein foods.',
    Normal:      'Your BMI is in the healthy range. Let\'s optimise your conditioning.',
    Overweight:  'We\'ll guide you toward sustainable fat loss while protecting muscle.',
    Obese:       'A gradual, safe deficit with joint-friendly conditioning is ideal.',
  }[cat] ?? 'Let\'s build your personalised RAG-grounded routine.')

  const bmiPosition = (bmi) => Math.min(100, Math.max(0, ((parseFloat(bmi) - 10) / 35) * 100))

  /* ────────────────── BMI Review step ────────────────── */
  if (step === 'bmi_review' && profileResult) {
    return (
      <div
        className="glass-panel rounded-2xl p-6 animate-fade-up max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: 420, margin: '0 auto' }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <p className="label-caps mb-2">Intake assessment</p>
          <h2
            className="text-[22px] font-semibold text-white/85"
            style={{ fontFamily: "'Space Grotesk',sans-serif" }}
          >
            Your metrics
          </h2>
          <p className="text-[12px] text-white/30 mt-1">
            Review before generating your personalised plan.
          </p>
        </div>

        {/* BMI card */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="label-caps mb-1">Body Mass Index</p>
              <span className="text-[32px] font-semibold text-white/85 tracking-tight">{profileResult.bmi}</span>
            </div>
            <span
              className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            >
              {profileResult.bmi_category}
            </span>
          </div>
          {/* Gradient bar + needle */}
          <div className="relative h-1.5 w-full rounded-full overflow-visible mb-3"
            style={{ background: 'linear-gradient(90deg, #4a9eff 0%, #52d68a 28%, #f5a623 58%, #ff5c5c 100%)' }}
          >
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-lg ring-2 ring-black"
              style={{ left: `calc(${bmiPosition(profileResult.bmi)}% - 5px)` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-white/20 mb-3">
            <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
          </div>
          <p className="text-[12px] text-white/45 leading-relaxed">{getBmiNote(profileResult.bmi_category)}</p>
        </div>

        {/* Feasibility */}
        {profileResult.feasible ? (
          <div
            className="flex gap-3 p-4 rounded-xl mb-5 text-[12px] leading-relaxed text-white/55"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <svg className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong className="text-white/75 block mb-0.5">Timeframe looks realistic</strong>
              Achieving your goal in {formValues.timeframe_weeks} weeks is safe (pace is under 0.5 kg/week).
            </div>
          </div>
        ) : (
          <div
            className="p-4 rounded-xl mb-5 text-[12px] leading-relaxed text-white/45"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex gap-3 mb-3">
              <svg className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <strong className="text-white/70 block mb-0.5">Aggressive timeframe</strong>
                {Math.abs(formValues.weight_kg - formValues.target_value)} kg in {formValues.timeframe_weeks} weeks
                exceeds the safe pace of 0.5 kg/week.
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <p className="mb-3 text-white/35">
                We recommend <strong className="text-white/65">{profileResult.suggested_timeframe_weeks} weeks</strong> for safe, sustainable results.
              </p>
              <div className="space-y-2">
                {[
                  { value: true,  label: `Use ${profileResult.suggested_timeframe_weeks} weeks (Recommended)` },
                  { value: false, label: `Keep original: ${formValues.timeframe_weeks} weeks` },
                ].map(({ value, label }) => (
                  <label key={String(value)} className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        borderColor: useSuggestedTimeframe === value ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                        background: useSuggestedTimeframe === value ? 'rgba(255,255,255,0.08)' : 'transparent',
                      }}
                      onClick={() => setUseSuggestedTimeframe(value)}
                    >
                      {useSuggestedTimeframe === value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
                      )}
                    </div>
                    <span
                      className="text-[11px]"
                      style={{ color: useSuggestedTimeframe === value ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)' }}
                      onClick={() => setUseSuggestedTimeframe(value)}
                    >
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleGeneratePlanClick}
          disabled={loading}
          className="btn-primary w-full py-3 rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {loading ? (
            <><span className="spinner" /> Generating your plan…</>
          ) : (
            <>
              Generate My Fitness Plan
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    )
  }

  /* ────────────────── Main form ───────────────────────── */
  return (
    <div className="animate-fade-up w-full overflow-y-auto" style={{ maxHeight: '92dvh' }}>
      {/* Hero header */}
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-semibold text-white/35 mb-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          AI-Powered Fitness Intake
        </div>
        <h1
          className="text-[32px] font-bold text-white/85 mb-2 tracking-tight"
          style={{ fontFamily: "'Space Grotesk',sans-serif" }}
        >
          FitRAG
        </h1>
        <p className="text-[13px] text-white/30 max-w-xs mx-auto leading-relaxed">
          Personalised nutrition & training, grounded in real knowledge.
        </p>
      </div>

      {/* Form panel */}
      <div className="glass-panel rounded-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Section 1: Personal ────────────────────── */}
          <div>
            <SectionHead number="1" title="Personal Details" />
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <input id="name" name="name" type="text" required placeholder="e.g. Alex Chen"
                  className={inputCls} style={inputStyle} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'age',       label: 'Age',        type: 'number', min: 12,  max: 120, placeholder: '28' },
                  { id: 'height_cm', label: 'Height (cm)',type: 'number', min: 50,  max: 300, placeholder: '175', step: '0.1' },
                  { id: 'weight_kg', label: 'Weight (kg)',type: 'number', min: 20,  max: 500, placeholder: '72',  step: '0.1' },
                ].map(({ id, label, ...rest }) => (
                  <div key={id}>
                    <Label htmlFor={id}>{label}</Label>
                    <input id={id} name={id} required className={inputCls} style={inputStyle} {...rest} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 2: Objectives ──────────────────── */}
          <div>
            <SectionHead number="2" title="Fitness Objective" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="region">Cuisine Preference</Label>
                  <select id="region" name="region" required className={inputCls} style={selectStyle}>
                    <option value="">Select cuisine…</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="goal">Training Target</Label>
                  <select id="goal" name="goal" required className={inputCls} style={selectStyle}>
                    <option value="">Select target…</option>
                    {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <Label htmlFor="goal_type">Goal Type</Label>
                  <select
                    id="goal_type" name="goal_type" required
                    value={goalType} onChange={e => setGoalType(e.target.value)}
                    className={inputCls} style={selectStyle}
                  >
                    <option value="maintain">Maintain</option>
                    <option value="lose_weight">Lose weight</option>
                    <option value="gain_muscle">Gain muscle</option>
                  </select>
                </div>
                <div className={goalType === 'maintain' ? 'opacity-30 pointer-events-none' : ''}>
                  <Label htmlFor="target_value">Target (kg)</Label>
                  <input id="target_value" name="target_value" type="number"
                    required={goalType !== 'maintain'} min="20" max="500" step="0.1"
                    placeholder="68" disabled={goalType === 'maintain'}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <Label htmlFor="timeframe_weeks">Duration (wks)</Label>
                  <input id="timeframe_weeks" name="timeframe_weeks" type="number"
                    required min="1" max="104" placeholder="12"
                    className={inputCls} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 3: Health ──────────────────────── */}
          <div>
            <SectionHead number="3" title="Health & Safety" />
            <p className="text-[11px] text-white/25 mb-3 leading-relaxed">
              We screen for contraindications to keep your programme safe.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[...MEDICAL_OPTIONS, { value: 'other', label: 'Other condition…' }].map(opt => {
                const checked = selectedMeds.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150"
                    style={{
                      background: checked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${checked ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <input type="checkbox" checked={checked}
                      onChange={() => handleMedChange(opt.value)} className="hidden" />
                    {/* Custom checkbox */}
                    <div
                      className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        background: checked ? 'rgba(255,255,255,0.85)' : 'transparent',
                        border: `1px solid ${checked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)'}`,
                      }}
                    >
                      {checked && (
                        <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-[11px] font-medium truncate"
                      style={{ color: checked ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}
                    >
                      {opt.label}
                    </span>
                  </label>
                )
              })}
            </div>
            {showCustomMedInput && (
              <div className="mt-3 animate-fade-up">
                <Label htmlFor="custom_med">Specify condition(s)</Label>
                <input id="custom_med" type="text"
                  required={selectedMeds.includes('other')}
                  value={customMed} onChange={e => setCustomMed(e.target.value)}
                  placeholder="e.g. shoulder injury, low back pain"
                  className={inputCls} style={inputStyle} />
              </div>
            )}
          </div>

          {/* CTA */}
          <button
            id="submit-profile-btn"
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40 mt-2"
          >
            {loading ? (
              <><span className="spinner" /> Analysing…</>
            ) : (
              <>
                Assess My Profile
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-white/15 text-[10px] mt-4 tracking-wide">
        Your data is stored locally and used only to personalise your programme.
      </p>
    </div>
  )
}
