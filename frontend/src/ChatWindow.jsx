import { useEffect, useRef, useState } from 'react'

/* ── Typing indicator ─────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 animate-fade-up">
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
        style={{
          background: 'linear-gradient(145deg,#1e1e1e,#111)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        F
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}

/* ── Media card ───────────────────────────────────────── */
function MediaCard({ item }) {
  const [showPlayer, setShowPlayer] = useState(false)

  return (
    <div
      className="flex-shrink-0 w-60 rounded-2xl overflow-hidden flex flex-col hover-lift cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Thumbnail / player */}
      {showPlayer ? (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${item.video_id}?autoplay=1`}
            title={item.video_title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div
          className="relative aspect-video w-full group overflow-hidden bg-black"
          onClick={() => setShowPlayer(true)}
        >
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.video_title}
              className="w-full h-full object-cover opacity-80 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
              No preview
            </div>
          )}
          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
              style={{
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              <svg className="w-4 h-4 text-black translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        {/* Type badge + name */}
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            {item.type === 'recipe' ? 'Recipe' : 'Technique'}
          </span>
          <span className="text-[10px] text-white/35 font-medium truncate">{item.name}</span>
        </div>

        <p className="text-[11px] font-medium text-white/70 line-clamp-2 leading-snug flex-1">
          {item.video_title}
        </p>

        {/* Actions */}
        <div
          className="flex items-center justify-between pt-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <a
            href={item.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/60 transition-colors font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open
          </a>
          {!showPlayer && (
            <button
              onClick={() => setShowPlayer(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-white/50 hover:text-white/90 transition-colors cursor-pointer"
            >
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Watch inline
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Single message ───────────────────────────────────── */
function Message({ msg }) {
  const isUser = msg.role === 'user'

  /* Render **bold** markdown */
  const renderContent = (text) =>
    text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return (
        <span key={i}>
          {parts.map((p, j) =>
            j % 2 === 1
              ? <strong key={j} style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{p}</strong>
              : p
          )}
          {i < text.split('\n').length - 1 && <br />}
        </span>
      )
    })

  if (isUser) {
    return (
      <div className="flex items-end gap-2.5 justify-end animate-fade-up">
        <div
          className="max-w-[76%] rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed text-white/85"
          style={{
            background: 'linear-gradient(145deg, #1c1c1e, #2c2c2e)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {msg.content}
        </div>
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white/50"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Y
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-up">
      <div className="flex items-end gap-2.5">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white/55"
          style={{
            background: 'linear-gradient(145deg,#1e1e1e,#111)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          F
        </div>
        {/* Bubble */}
        <div
          className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed text-white/75"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {renderContent(msg.content)}
        </div>
      </div>

      {/* Media row */}
      {msg.media?.length > 0 && (
        <div className="pl-9">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {msg.media.map((item, idx) => <MediaCard key={idx} item={item} />)}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main ChatWindow ──────────────────────────────────── */
export default function ChatWindow({ messages, isTyping, onSend, loading, userId }) {
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = (e) => {
    e.preventDefault()
    const text = inputRef.current.value.trim()
    if (!text || loading) return
    inputRef.current.value = ''
    onSend(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
  }

  const suggestions = [
    { emoji: '🥗', text: 'Suggest a diet plan for weight loss' },
    { emoji: '💪', text: 'What exercises build strong legs?' },
    { emoji: '🍛', text: 'Give me a high-protein meal from my region' },
    { emoji: '🏃', text: 'Design a beginner cardio routine' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(0,0,0,0.2)' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white/70"
          style={{
            background: 'linear-gradient(145deg,#1e1e1e,#111)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          F
        </div>
        <div>
          <h2
            className="text-[13px] font-semibold text-white/85"
            style={{ fontFamily: "'Space Grotesk',sans-serif" }}
          >
            FitRAG Assistant
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
            <span className="text-[10px] text-white/25 font-medium">llama-3.3-70b · RAG grounded</span>
          </div>
        </div>
        <div className="ml-auto">
          <span
            className="text-[9px] px-2.5 py-1 rounded-full font-mono text-white/20"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            #{userId}
          </span>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full gap-7 text-center animate-fade-up">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              🏋️
            </div>
            <div>
              <p
                className="text-[15px] font-semibold text-white/75 mb-1.5"
                style={{ fontFamily: "'Space Grotesk',sans-serif" }}
              >
                Start your session
              </p>
              <p className="text-[12px] text-white/30 max-w-[220px] mx-auto leading-relaxed">
                Ask me about local recipes, safe workouts, or your personalised plan.
              </p>
            </div>
            {/* Suggestion chips */}
            <div className="w-full max-w-xs space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSend(s.text)}
                  className="w-full text-left text-[12px] px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.055)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <span className="text-base leading-none flex-shrink-0">{s.emoji}</span>
                  <span className="font-medium">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ───────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <form onSubmit={handleSend} className="flex gap-2.5 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              id="chat-input"
              rows={1}
              placeholder="Message FitRAG…"
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="input-glow-focus w-full resize-none px-4 py-3 rounded-xl text-[13px] text-white/80 placeholder-white/20 transition-all disabled:opacity-40 min-h-[46px] max-h-32 leading-relaxed"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fieldSizing: 'content',
              }}
            />
          </div>
          <button
            id="send-btn"
            type="submit"
            disabled={loading}
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center btn-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed self-end"
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
        <p className="text-center text-white/15 text-[9px] mt-2.5 tracking-wide">
          Answers grounded in curated food &amp; exercise knowledge
        </p>
      </div>

    </div>
  )
}
