# FitRAG — AI Fitness & Nutrition Chatbot

A full-stack RAG-powered chatbot that gives personalised fitness and nutrition advice
grounded in a curated knowledge base of 25 foods (5 cuisines) and 25 exercises.

## Stack
- **Backend**: Python FastAPI + ChromaDB + sentence-transformers + Groq LLM
- **Frontend**: React + Vite + Tailwind CSS v4
- **Storage**: SQLite (users + messages), ChromaDB (vector store)
- **LLM**: Groq `llama-3.3-70b-versatile` via OpenAI-compatible client

## Quick Start

### 1. Backend setup

```bash
cd backend

# Install Python deps
pip install -r requirements.txt

# Set your Groq API key
$env:GROQ_API_KEY = "gsk_..."   # PowerShell
# OR: export GROQ_API_KEY="gsk_..."  # bash/zsh

# Ingest the knowledge base into ChromaDB (run once)
python ingest.py

# Start the API server
uvicorn main:app --reload --port 8000
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Project Structure

```
backend/
  main.py              # FastAPI app (profile, chat, history)
  ingest.py            # ChromaDB embedding script
  requirements.txt
  knowledge_base/
    foods.json         # 25 foods across 5 regions
    exercises.json     # 25 exercises with form cues
  chroma_db/           # Auto-created by ingest.py
  app.db               # Auto-created by FastAPI on startup

frontend/
  src/
    App.jsx            # Root: profile gate → chat
    ProfileForm.jsx    # Height/weight/region/goal form
    ChatWindow.jsx     # Message bubbles, typing indicator
    api.js             # fetch wrappers for /api/*
  index.css            # Tailwind v4 + custom animations
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/profile` | Create/update user profile → returns `user_id` |
| POST | `/api/chat` | `{user_id, message}` → RAG-grounded LLM reply |
| GET | `/api/history/{user_id}` | Full message history |
| GET | `/health` | Health check |
