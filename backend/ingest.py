import json
import os
import sys
from pathlib import Path

# Ensure the backend directory is in Python path
sys.path.insert(0, str(Path(__file__).parent))

from chromadb.utils import embedding_functions
import chromadb

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
KB_DIR   = BASE_DIR / "knowledge_base"
DB_DIR   = BASE_DIR / "chroma_db"

FOODS_FILE     = KB_DIR / "foods.json"
EXERCISES_FILE = KB_DIR / "exercises.json"


def make_food_chunk(entry: dict) -> str:
    """Convert a food entry dict into a natural-language sentence for embedding."""
    m = entry["macros"]
    return (
        f"{entry['name']} is a {entry['region']} food typically eaten at "
        f"{entry['typical_meal_type']}. Per 100g it provides {m['protein']}g protein, "
        f"{m['carbs']}g carbs, {m['fat']}g fat, and {m['kcal']} kcal. "
        f"{entry['notes']}"
    )


def make_exercise_chunk(entry: dict) -> str:
    """Convert an exercise entry dict into a natural-language sentence for embedding."""
    cues_text = " | ".join(entry["cues"])
    return (
        f"{entry['name']} is a {entry['difficulty'].lower()}-level exercise targeting "
        f"{entry['muscle_group']}, using {entry['equipment']}. "
        f"Typical volume: {entry['typical_reps']}. "
        f"Key form cues: {cues_text}."
    )


def ingest_collection(
    client: chromadb.PersistentClient,
    collection_name: str,
    entries: list[dict],
    chunk_fn,
    ef,
) -> None:
    """Embed entries and upsert into a Chroma collection."""
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    ids        = []
    documents  = []
    metadatas  = []
    embeddings = []

    for i, entry in enumerate(entries):
        chunk_text = chunk_fn(entry)
        doc_id     = f"{collection_name}_{i}"

        ids.append(doc_id)
        documents.append(chunk_text)
        # Store original JSON as flat string fields in metadata
        metadatas.append({"source_json": json.dumps(entry, ensure_ascii=False)})

    print(f"[ingest] Embedding {len(documents)} chunks for collection '{collection_name}' ...")
    vecs = ef(documents)
    embeddings = [[float(x) for x in v] for v in vecs]

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )
    print(f"[ingest] OK - Upserted {len(ids)} items into '{collection_name}'.\n")


def main():
    print("[ingest] Loading ONNX embedding function ...")
    ef = embedding_functions.ONNXMiniLM_L6_V2()
    print("[ingest] Embedding function loaded.\n")

    print(f"[ingest] Opening Chroma persistent client at {DB_DIR} ...")
    DB_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(DB_DIR))

    # ── Foods ──────────────────────────────────────────────────────────────────
    with open(FOODS_FILE, encoding="utf-8") as f:
        foods = json.load(f)
    ingest_collection(client, "foods", foods, make_food_chunk, ef)

    # ── Exercises ──────────────────────────────────────────────────────────────
    with open(EXERCISES_FILE, encoding="utf-8") as f:
        exercises = json.load(f)
    ingest_collection(client, "exercises", exercises, make_exercise_chunk, ef)

    print("[ingest] All done! ChromaDB is ready.")


if __name__ == "__main__":
    main()
