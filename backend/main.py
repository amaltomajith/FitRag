"""
FitRAG FastAPI Backend
======================
Endpoints:
  POST /api/profile          – create/update user profile
  POST /api/chat             – RAG-powered chat
  GET  /api/history/{user_id} – fetch message history
"""

from __future__ import annotations

import json
import os
import sqlite3
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from chromadb.utils import embedding_functions

from media import search_youtube

# ── Paths & Constants ──────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DB_PATH    = BASE_DIR / "app.db"
CHROMA_DIR = BASE_DIR / "chroma_db"

GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL    = "llama-3.3-70b-versatile"
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

print(f"[startup] GROQ_API_KEY loaded. Length: {len(GROQ_API_KEY)}")
print(f"[startup] YOUTUBE_API_KEY loaded. Length: {len(YOUTUBE_API_KEY)}")

TOP_K = 5  # number of RAG chunks to retrieve per collection
HISTORY_LIMIT = 10  # last N messages to include as chat context


# ── SQLite helpers ─────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db() -> None:
    # Check if migration is needed (new columns added)
    need_recreate = False
    try:
        with get_conn() as conn:
            conn.execute("SELECT name, age, medical_conditions, goal_type, target_value, timeframe_weeks FROM users LIMIT 1")
    except sqlite3.OperationalError:
        need_recreate = True

    with get_conn() as conn:
        if need_recreate:
            print("[db] Dev migration: upgrading users and messages schemas...")
            conn.execute("DROP TABLE IF EXISTS messages;")
            conn.execute("DROP TABLE IF EXISTS users;")
        
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT,
                age        INTEGER,
                height_cm  REAL,
                weight_kg  REAL,
                region     TEXT,
                goal       TEXT,
                medical_conditions TEXT, -- JSON array of strings
                goal_type  TEXT, -- "lose_weight" | "gain_muscle" | "maintain"
                target_value REAL,
                timeframe_weeks INTEGER,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                role       TEXT NOT NULL,
                content    TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        """)
    print("[db] SQLite schema initialised.")


# ── Global singletons (loaded once at startup) ─────────────────────────────────

_embedding_ef = None
_chroma_client: Optional[chromadb.PersistentClient] = None
_groq_client: Optional[OpenAI] = None


def get_embedding_function():
    global _embedding_ef
    if _embedding_ef is None:
        print("[startup] Loading ONNX embedding function ...")
        _embedding_ef = embedding_functions.ONNXMiniLM_L6_V2()
        print("[startup] Embedding function ready.")
    return _embedding_ef


def get_chroma() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _chroma_client


def get_groq() -> OpenAI:
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY environment variable is not set.")
        _groq_client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)
    return _groq_client


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    get_embedding_function()   # warm up model at startup
    get_chroma()
    yield


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="FitRAG API", version="1.0.0", lifespan=lifespan)

# ALLOWED_ORIGINS env var: comma-separated list of allowed origins.
# Example: https://fitrag.vercel.app,https://www.fitrag.vercel.app
# Defaults to "*" (open) for local development.
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check (required by Railway) ────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fitrag-api"}


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class ProfileRequest(BaseModel):
    name:               Optional[str]       = None
    age:                Optional[int]       = None
    height_cm:          Optional[float]     = None
    weight_kg:          Optional[float]     = None
    region:             Optional[str]       = None
    goal:               Optional[str]       = None
    medical_conditions: Optional[list[str]] = []
    goal_type:          Optional[str]       = None
    target_value:       Optional[float]     = None
    timeframe_weeks:    Optional[int]       = None
    user_id:            Optional[int]       = None


class ChatRequest(BaseModel):
    user_id: int
    message: str


# ── Utility functions ──────────────────────────────────────────────────────────

def embed(text: str) -> list[float]:
    ef = get_embedding_function()
    # ef([text]) returns a list of embeddings. Convert to standard list of floats.
    return [float(x) for x in ef([text])[0]]


def detect_intent(message: str) -> tuple[bool, bool]:
    """
    Rough keyword intent detection.
    Returns (query_foods, query_exercises).
    If ambiguous, query both.
    """
    msg_lower = message.lower()

    food_kws = {
        "food", "eat", "diet", "meal", "nutrition", "calorie", "protein", "carb",
        "fat", "recipe", "breakfast", "lunch", "dinner", "snack", "weight loss",
        "bulk", "cut", "macro", "vegetarian", "vegan", "cuisine", "cook",
    }
    exercise_kws = {
        "exercise", "workout", "train", "muscle", "strength", "cardio", "lift",
        "rep", "set", "gym", "run", "push", "pull", "squat", "deadlift",
        "bench", "routine", "programme", "program", "fitness", "weight",
    }

    words = set(msg_lower.split())
    has_food     = bool(words & food_kws) or any(k in msg_lower for k in food_kws)
    has_exercise = bool(words & exercise_kws) or any(k in msg_lower for k in exercise_kws)

    if not has_food and not has_exercise:
        # default: query both so we always have context
        return True, True
    return has_food, has_exercise


def query_chroma(collection_name: str, query_vec: list[float], n: int = TOP_K) -> list[dict]:
    """Query a Chroma collection, return list of {document, metadata}."""
    client = get_chroma()
    try:
        col = client.get_collection(collection_name)
    except Exception:
        return []   # collection doesn't exist yet (before ingest)

    results = col.query(
        query_embeddings=[query_vec],
        n_results=min(n, col.count()),
        include=["documents", "metadatas", "distances"],
    )
    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        chunks.append({"document": doc, "metadata": meta})
    return chunks


def build_system_prompt(user_row: sqlite3.Row, rag_chunks: list[dict]) -> str:
    """Construct the system prompt with user profile + retrieved knowledge."""
    # Parse medical conditions list
    try:
        medical_conditions = json.loads(user_row["medical_conditions"]) if user_row["medical_conditions"] else []
    except Exception:
        medical_conditions = []

    # Compute BMI
    bmi = None
    bmi_category = "Unknown"
    if user_row["height_cm"] and user_row["weight_kg"]:
        height_m = user_row["height_cm"] / 100.0
        bmi = user_row["weight_kg"] / (height_m ** 2)
        if bmi < 18.5:
            bmi_category = "Underweight"
        elif bmi < 25.0:
            bmi_category = "Normal"
        elif bmi < 30.0:
            bmi_category = "Overweight"
        else:
            bmi_category = "Obese"

    profile_parts = []
    if user_row["name"]:
        profile_parts.append(f"Name: {user_row['name']}")
    if user_row["age"]:
        profile_parts.append(f"Age: {user_row['age']}")
    if user_row["height_cm"]:
        profile_parts.append(f"Height: {user_row['height_cm']} cm")
    if user_row["weight_kg"]:
        profile_parts.append(f"Weight: {user_row['weight_kg']} kg")
    if bmi:
        profile_parts.append(f"BMI: {round(bmi, 2)} ({bmi_category})")
    if user_row["goal"]:
        profile_parts.append(f"Fitness Goal: {user_row['goal']}")
    if user_row["goal_type"]:
        profile_parts.append(f"Goal Type: {user_row['goal_type']}")
    if user_row["target_value"]:
        profile_parts.append(f"Target Value: {user_row['target_value']}")
    if user_row["timeframe_weeks"]:
        profile_parts.append(f"Timeframe: {user_row['timeframe_weeks']} weeks")
    if user_row["region"]:
        profile_parts.append(f"Food region preference: {user_row['region']}")
    if medical_conditions:
        profile_parts.append(f"Medical Conditions: {', '.join(medical_conditions)}")

    profile_str = "\n".join(profile_parts) if profile_parts else "No profile data yet."

    chunks_str = ""
    if rag_chunks:
        chunk_lines = []
        for i, c in enumerate(rag_chunks, 1):
            chunk_lines.append(f"[{i}] {c['document']}")
        chunks_str = "\n".join(chunk_lines)
    else:
        chunks_str = "No specific knowledge retrieved."

    num_items = len(rag_chunks)
    variety_inst = ""
    if num_items < 3:
        variety_inst = f"""
- NOTE: Fewer than 3 relevant items were retrieved (only {num_items} items available in context).
- Please build variety by combining these {num_items} items creatively (e.g., suggesting them at different meals, times, or preparation methods) rather than repeating the same item verbatim across meals. Make the plan feel complete and balanced despite limited items.
"""

    contra_warning = ""
    if medical_conditions:
        contra_warning = f"""
- The user has listed these medical conditions: {', '.join(medical_conditions)}.
- You MUST explicitly avoid recommending exercises or foods that are contraindicated. For example, if "knee pain" or "knee/joint pain" is listed, avoid high-impact leg work (box jumps, running, etc.) and suggest low-impact alternatives from context (like planks, pull-ups, bench press, or goblet squats with low impact).
- Do NOT provide specific medical advice, diagnostics, or dosage recommendations.
- You MUST explicitly state that this guidance is not medical advice, and the user should consult a doctor before starting, especially given their listed conditions: {', '.join(medical_conditions)}.
"""
    else:
        contra_warning = """
- Always include a general disclaimer advising the user to consult a doctor before starting any intense new fitness or diet program.
"""

    system_prompt = f"""You are FitRAG, an expert AI fitness and nutrition coach.
Always personalise your advice to the user's profile below.

## User Profile
{profile_str}

## Retrieved Knowledge (use these facts to ground your answer)
{chunks_str}

## Instructions
- Base your answer primarily on the retrieved knowledge above.
- ONLY reference foods or exercises that appear in the retrieved context. Never invent or suggest items outside of the provided retrieved knowledge.
- Do NOT suggest items outside the user's preferred region (if known) unless the user explicitly asks for non-regional options.
- Be specific and practical — give concrete meal plans, portion sizes, or exercise programmes rather than generic advice.{variety_inst}{contra_warning}
- If the user's region is known, prioritise foods from that cuisine.
- If the user's goal is known (e.g. weight loss, muscle gain, maintenance), tailor macros and exercises accordingly.
- Keep answers concise (under 350 words) but packed with actionable detail.
- Do NOT make up facts not present in the retrieved knowledge; instead, acknowledge any gaps and suggest the user consult a professional.

# TODO: media_fetching
# YouTube exercise demo URLs and food images are retrieved by the endpoint and appended to the response metadata.
"""
    return system_prompt


# ── Endpoints ──────────────────────────────────────────────────────────────────

class OnboardingPlanRequest(BaseModel):
    user_id: int


@app.post("/api/profile")
def create_or_update_profile(req: ProfileRequest):
    # Compute BMI & Category
    bmi = None
    bmi_category = "Unknown"
    if req.height_cm and req.weight_kg:
        height_m = req.height_cm / 100.0
        bmi = req.weight_kg / (height_m ** 2)
        if bmi < 18.5:
            bmi_category = "Underweight"
        elif bmi < 25.0:
            bmi_category = "Normal"
        elif bmi < 30.0:
            bmi_category = "Overweight"
        else:
            bmi_category = "Obese"

    # Compute feasibility & recommended pace
    feasible = True
    suggested_timeframe = None
    
    if req.goal_type in ("lose_weight", "gain_muscle") and req.weight_kg and req.target_value and req.timeframe_weeks:
        weight_change = abs(req.weight_kg - req.target_value)
        required_pace = weight_change / req.timeframe_weeks
        # Safe pace is 0.5 kg / week
        if required_pace > 0.5:
            feasible = False
            import math
            suggested_timeframe = int(math.ceil(weight_change / 0.5))

    # Serialize medical conditions list to JSON string
    meds_str = json.dumps(req.medical_conditions or [])

    with get_conn() as conn:
        if req.user_id:
            # Update existing user
            row = conn.execute("SELECT id FROM users WHERE id = ?", (req.user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found.")
            conn.execute(
                """UPDATE users
                   SET name = COALESCE(?, name),
                       age = COALESCE(?, age),
                       height_cm = COALESCE(?, height_cm),
                       weight_kg = COALESCE(?, weight_kg),
                       region    = COALESCE(?, region),
                       goal      = COALESCE(?, goal),
                       medical_conditions = COALESCE(?, medical_conditions),
                       goal_type = COALESCE(?, goal_type),
                       target_value = COALESCE(?, target_value),
                       timeframe_weeks = COALESCE(?, timeframe_weeks)
                   WHERE id = ?""",
                (
                    req.name, req.age, req.height_cm, req.weight_kg, req.region, req.goal,
                    meds_str, req.goal_type, req.target_value, req.timeframe_weeks, req.user_id
                ),
            )
            uid = req.user_id
            status = "updated"
        else:
            # Create new user
            cur = conn.execute(
                """INSERT INTO users (
                    name, age, height_cm, weight_kg, region, goal, 
                    medical_conditions, goal_type, target_value, timeframe_weeks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    req.name, req.age, req.height_cm, req.weight_kg, req.region, req.goal,
                    meds_str, req.goal_type, req.target_value, req.timeframe_weeks
                ),
            )
            uid = cur.lastrowid
            status = "created"

    return {
        "user_id": uid,
        "status": status,
        "bmi": round(bmi, 2) if bmi is not None else None,
        "bmi_category": bmi_category,
        "feasible": feasible,
        "suggested_timeframe_weeks": suggested_timeframe
    }


@app.post("/api/onboarding-plan")
async def generate_onboarding_plan(req: OnboardingPlanRequest):
    # ── 1. Fetch user profile ──────────────────────────────────────────────────
    with get_conn() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (req.user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")

    # Parse medical conditions list
    try:
        medical_conditions = json.loads(user_row["medical_conditions"]) if user_row["medical_conditions"] else []
    except Exception:
        medical_conditions = []

    # ── 2. RAG Retrieval ───────────────────────────────────────────────────────
    query_str = f"{user_row['region'] or ''} {user_row['goal'] or ''}"
    query_vec = embed(query_str)
    
    foods_results = query_chroma("foods", query_vec)
    exercises_results = query_chroma("exercises", query_vec)
    rag_chunks = foods_results + exercises_results

    # Collect candidates for media matching later
    candidate_entities = []
    for res in foods_results:
        try:
            meta = res.get("metadata", {})
            if "source_json" in meta:
                item = json.loads(meta["source_json"])
                candidate_entities.append({
                    "name": item["name"],
                    "type": "recipe",
                    "query": f"{item['name']} recipe"
                })
        except Exception:
            pass

    for res in exercises_results:
        try:
            meta = res.get("metadata", {})
            if "source_json" in meta:
                item = json.loads(meta["source_json"])
                candidate_entities.append({
                    "name": item["name"],
                    "type": "exercise",
                    "query": f"{item['name']} exercise proper form"
                })
        except Exception:
            pass

    # ── 3. Build system prompt with grounding & safety parameters ─────────────
    # Compute BMI
    bmi = None
    bmi_category = "Unknown"
    if user_row["height_cm"] and user_row["weight_kg"]:
        height_m = user_row["height_cm"] / 100.0
        bmi = user_row["weight_kg"] / (height_m ** 2)
        if bmi < 18.5:
            bmi_category = "Underweight"
        elif bmi < 25.0:
            bmi_category = "Normal"
        elif bmi < 30.0:
            bmi_category = "Overweight"
        else:
            bmi_category = "Obese"

    profile_summary = f"""Name: {user_row['name'] or 'User'}
Age: {user_row['age'] or 'N/A'}
Height: {user_row['height_cm']} cm
Weight: {user_row['weight_kg']} kg
BMI: {round(bmi, 2) if bmi else 'N/A'} ({bmi_category})
Goal: {user_row['goal']} (Goal Type: {user_row['goal_type'] or 'N/A'})
Target Value: {user_row['target_value'] or 'N/A'}
Timeframe: {user_row['timeframe_weeks']} weeks
Medical Conditions: {', '.join(medical_conditions) if medical_conditions else 'None'}
Region: {user_row['region']}
"""

    contra_warning = ""
    if medical_conditions:
        contra_warning = f"""
- The user has listed these medical conditions: {', '.join(medical_conditions)}.
- You MUST explicitly avoid recommending exercises or foods that are contraindicated. For example, if "knee pain" or "knee/joint pain" is listed, avoid high-impact leg work (box jumps, running, etc.) and suggest low-impact alternatives from context (like planks, pull-ups, bench press, or goblet squats with low impact).
- Do NOT give specific medical advice, dosage recommendations, or suggest diagnostics.
- You MUST explicitly state that this plan is not medical advice, and they should consult a doctor before starting, especially given their listed conditions: {', '.join(medical_conditions)}.
"""
    else:
        contra_warning = """
- Always include a general disclaimer advising the user to consult a doctor before starting any intense new fitness or diet program.
"""

    system_prompt = f"""You are FitRAG, an expert AI fitness and nutrition coach.
You are generating a personalized onboarding plan for the user.

## User Profile
{profile_summary}

## Retrieved Knowledge (use these facts to ground your plan)
{'\n'.join([f"[{i}] {c['document']}" for i, c in enumerate(rag_chunks, 1)])}

## Instructions
- Give a warm, brief welcome referencing the user's name, BMI category, and goal.
- Outline a high-level plan (diet and exercise suggestions) to reach their goal within their timeframe, grounding recommendations ONLY in the retrieved knowledge.
- Do NOT invent or suggest exercises or foods outside the retrieved knowledge database.{contra_warning}
- End the plan by warmly inviting the user to ask follow-up questions in the chat.
- Keep the response concise, engaging, and professional (under 350 words).
"""

    # ── 4. Call Groq ───────────────────────────────────────────────────────────
    groq = get_groq()
    def call_groq():
        return groq.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "system", "content": system_prompt}],
            temperature=0.7,
            max_tokens=600,
        )

    completion = await asyncio.to_thread(call_groq)
    plan_text = completion.choices[0].message.content.strip()

    # ── 5. Grounded Media extraction ───────────────────────────────────────────
    entities_to_search = []
    plan_lower = plan_text.lower()
    for candidate in candidate_entities:
        if candidate["name"].lower() in plan_lower:
            if not any(e["name"] == candidate["name"] for e in entities_to_search):
                entities_to_search.append(candidate)

    entities_to_search = entities_to_search[:2]

    async def fetch_media(name, item_type, q):
        res = await asyncio.to_thread(search_youtube, q)
        if res:
            return {
                "type": item_type,
                "name": name,
                "video_id": res["video_id"],
                "video_title": res["title"],
                "thumbnail_url": res["thumbnail_url"],
                "video_url": res["video_url"]
            }
        return None

    media_list = []
    if entities_to_search:
        tasks = [fetch_media(c["name"], c["type"], c["query"]) for c in entities_to_search]
        media_results = await asyncio.gather(*tasks)
        media_list = [m for m in media_results if m is not None]

    # ── 6. Save as first assistant message ──────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (req.user_id, "assistant", plan_text, now),
        )

    return {
        "reply": plan_text,
        "media": media_list,
        "bmi": round(bmi, 2) if bmi is not None else None,
        "bmi_category": bmi_category
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    # ── 1. Fetch user profile ──────────────────────────────────────────────────
    with get_conn() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (req.user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found. Create a profile first.")

        history_rows = conn.execute(
            """SELECT role, content FROM messages
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (req.user_id, HISTORY_LIMIT),
        ).fetchall()

    # Reverse to chronological order
    history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_rows)]

    # ── 2. RAG retrieval ───────────────────────────────────────────────────────
    query_vec                    = embed(req.message)
    query_foods, query_exercises = detect_intent(req.message)

    foods_results = query_chroma("foods", query_vec) if query_foods else []
    exercises_results = query_chroma("exercises", query_vec) if query_exercises else []
    rag_chunks = foods_results + exercises_results

    # ── 3. Find candidates from RAG results ────────────────────────────────────
    candidate_entities = []
    
    # Collect foods candidates
    for res in foods_results:
        try:
            meta = res.get("metadata", {})
            if "source_json" in meta:
                item = json.loads(meta["source_json"])
                candidate_entities.append({
                    "name": item["name"],
                    "type": "recipe",
                    "query": f"{item['name']} recipe"
                })
        except Exception:
            pass

    # Collect exercises candidates
    for res in exercises_results:
        try:
            meta = res.get("metadata", {})
            if "source_json" in meta:
                item = json.loads(meta["source_json"])
                candidate_entities.append({
                    "name": item["name"],
                    "type": "exercise",
                    "query": f"{item['name']} exercise proper form"
                })
        except Exception:
            pass

    # ── 4. Build messages for Groq ─────────────────────────────────────────────
    system_prompt = build_system_prompt(user_row, rag_chunks)

    messages_for_llm = [{"role": "system", "content": system_prompt}]
    messages_for_llm += history
    messages_for_llm.append({"role": "user", "content": req.message})

    # ── 5. Call Groq LLM first ─────────────────────────────────────────────────
    groq = get_groq()
    
    def call_groq():
        return groq.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages_for_llm,
            temperature=0.7,
            max_tokens=600,
        )
        
    completion = await asyncio.to_thread(call_groq)
    assistant_reply = completion.choices[0].message.content.strip()

    # ── 6. Extract only the entity names mentioned in the reply ────────────────
    entities_to_search = []
    reply_lower = assistant_reply.lower()
    for candidate in candidate_entities:
        # Case-insensitive substring match of the name in the reply
        if candidate["name"].lower() in reply_lower:
            # Prevent duplicate searches
            if not any(e["name"] == candidate["name"] for e in entities_to_search):
                entities_to_search.append(candidate)

    # Limit to top 2 mentioned entities to control latency/quota
    entities_to_search = entities_to_search[:2]

    # ── 7. Concurrent YouTube search for mentioned items only ──────────────────
    async def fetch_media(name, item_type, q):
        res = await asyncio.to_thread(search_youtube, q)
        if res:
            return {
                "type": item_type,
                "name": name,
                "video_id": res["video_id"],
                "video_title": res["title"],
                "thumbnail_url": res["thumbnail_url"],
                "video_url": res["video_url"]
            }
        return None

    media_list = []
    if entities_to_search:
        tasks = [fetch_media(c["name"], c["type"], c["query"]) for c in entities_to_search]
        media_results = await asyncio.gather(*tasks)
        media_list = [m for m in media_results if m is not None]

    # ── 8. Persist messages ────────────────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (req.user_id, "user", req.message, now),
        )
        conn.execute(
            "INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (req.user_id, "assistant", assistant_reply, now),
        )

    return {
        "reply": assistant_reply,
        "media": media_list,
    }


@app.get("/api/profile/{user_id}")
def get_user_profile(user_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        user = dict(row)
        try:
            user["medical_conditions"] = json.loads(user["medical_conditions"]) if user["medical_conditions"] else []
        except Exception:
            user["medical_conditions"] = []
            
        bmi = None
        bmi_category = "Unknown"
        if user["height_cm"] and user["weight_kg"]:
            height_m = user["height_cm"] / 100.0
            bmi = user["weight_kg"] / (height_m ** 2)
            if bmi < 18.5:
                bmi_category = "Underweight"
            elif bmi < 25.0:
                bmi_category = "Normal"
            elif bmi < 30.0:
                bmi_category = "Overweight"
            else:
                bmi_category = "Obese"
                
        user["bmi"] = round(bmi, 2) if bmi is not None else None
        user["bmi_category"] = bmi_category
        return user


@app.get("/api/history/{user_id}")
def get_history(user_id: int):
    with get_conn() as conn:
        user_row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")
        rows = conn.execute(
            """SELECT id, role, content, created_at FROM messages
               WHERE user_id = ?
               ORDER BY created_at ASC""",
            (user_id,),
        ).fetchall()

    return {
        "user_id": user_id,
        "messages": [dict(r) for r in rows],
    }


@app.get("/health")
def health():
    return {"status": "ok"}
