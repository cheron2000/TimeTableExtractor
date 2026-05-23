"""
main.py — FastAPI entry point for Timetable Extractor v4
Adds /extract/full endpoint: full per-teacher + per-division split JSON.
"""

import uuid
import tempfile
import time
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from parser_engine import TimetableParser
from models import UploadResponse, TeacherListResponse, TimetableResponse, CompactScheduleResponse
from utils import configure_logging

configure_logging()

UPLOAD_DIR = Path(tempfile.gettempdir()) / "timetable_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_session_cache: dict[str, TimetableParser] = {}
_session_ts: dict[str, float] = {}
SESSION_TTL = 3600  # seconds


def _evict_expired():
    now = time.time()
    expired = [sid for sid, ts in _session_ts.items() if now - ts > SESSION_TTL]
    for sid in expired:
        _session_cache.pop(sid, None)
        _session_ts.pop(sid, None)
        for ext in (".xlsx", ".xlsm"):
            (UPLOAD_DIR / f"{sid}{ext}").unlink(missing_ok=True)

app = FastAPI(
    title="Timetable Extractor API",
    version="4.0.0",
    description="Extracts structured (teacher, division, room) data from Excel timetables.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_parser(session_id: str) -> TimetableParser:
    _evict_expired()
    if session_id in _session_cache:
        _session_ts[session_id] = time.time()
        return _session_cache[session_id]
    for ext in (".xlsx", ".xlsm"):
        path = UPLOAD_DIR / f"{session_id}{ext}"
        if path.exists():
            parser = TimetableParser(str(path))
            parser.parse()
            _session_cache[session_id] = parser
            _session_ts[session_id] = time.time()
            return parser
    raise HTTPException(404, detail=f"Session '{session_id}' not found.")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Timetable Extractor API v3"}


@app.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload an Excel timetable. Returns session_id for subsequent calls."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".xlsx", ".xlsm"}:
        raise HTTPException(400, detail="Only .xlsx and .xlsm files are supported.")

    session_id = uuid.uuid4().hex
    dest = UPLOAD_DIR / f"{session_id}{ext}"
    dest.write_bytes(await file.read())

    try:
        parser = TimetableParser(str(dest))
        parser.parse()
        _session_cache[session_id] = parser
        _session_ts[session_id] = time.time()
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, detail=f"Failed to parse: {e}")

    return UploadResponse(
        session_id=session_id,
        filename=file.filename or "",
        sheets=parser.sheet_names,
        rows=parser.row_count,
        cols=parser.col_count,
        teachers=sorted(parser.get_teacher_codes()),
        divisions=parser.get_divisions(),
    )


@app.get("/extract/cell")
def extract_cell(text: str = Query(..., description="Raw cell text to parse")):
    """
    Debug endpoint: parse a single cell string and return extracted entities.
    Example: /extract/cell?text=DBMS (UPM) SE-A Room 301
    """
    from parser_engine import extract_entities
    entities = extract_entities(text)
    return {
        "input":    text,
        "entities": entities,
        "compact":  [e["formatted"] for e in entities],
    }


@app.get("/extract/full/{session_id}")
def extract_full(session_id: str):
    """
    Split master timetable into per-teacher and per-division individual schedules.
    Returns: {"teacher": {"UPM": {...}}, "division": {"SE-A": {...}}}
    """
    parser = get_parser(session_id)
    return parser.extract_full_timetable_json()


@app.get("/extract/{session_id}", response_model=CompactScheduleResponse)
def extract_compact(session_id: str):
    """
    Extract full timetable as compact strings with lab merging.
    Output: {"MON": {"8:30": ["UPM SE-A 301"], "10:45": ["UPM SE-A Lab-204 [2hr]"]}}    """
    parser = get_parser(session_id)
    schedule = parser.extract_compact_schedule(merge_labs=True)
    return CompactScheduleResponse(schedule=schedule)


@app.get("/debug/{session_id}")
def debug_session(session_id: str):
    """
    Returns internal parser state: detected day_col, time_col, day_row_map,
    class_col_map, known_teachers, and a sample of the raw grid.
    Use this to diagnose extraction issues.
    """
    parser = get_parser(session_id)
    return {
        "day_col":        parser.day_col,
        "time_col":       parser.time_col,
        "class_col_map":  parser.class_col_map,
        "div_col_map":    {k: list(v) for k, v in parser.div_col_map.items()},
        "known_teachers": sorted(parser._known_teachers),
        "day_row_map":    {
            day: [(r, s) for r, s in entries]
            for day, entries in parser.day_row_map.items()
        },
        "grid_sample":    [
            {"row": r, "data": parser.grid[r]}
            for r in range(min(10, len(parser.grid)))
        ],
    }


@app.get("/debug/row/{session_id}/{row_index}")
def debug_row(session_id: str, row_index: int):
    """Returns the full raw grid row at the given index."""
    parser = get_parser(session_id)
    if row_index >= len(parser.grid):
        raise HTTPException(404, detail=f"Row {row_index} out of range (max {len(parser.grid)-1})")
    return {"row": row_index, "data": parser.grid[row_index]}


@app.get("/faculty")
def get_faculty_map():
    """Return the full faculty code→name map. Eliminates duplication in frontend."""
    from parser_engine import FACULTY_MAP
    return FACULTY_MAP


@app.get("/teachers/{session_id}", response_model=TeacherListResponse)
def get_teachers(session_id: str):
    parser = get_parser(session_id)
    return TeacherListResponse(teachers=parser.get_teachers_with_names())


@app.get("/timetable/teacher/{session_id}/{code}", response_model=TimetableResponse)
def get_teacher_timetable(session_id: str, code: str):
    parser = get_parser(session_id)
    code = code.upper().strip()
    if code not in parser.get_teacher_codes():
        raise HTTPException(404, detail=f"Teacher '{code}' not found.")
    schedule = parser.build_teacher_schedule(code)
    return TimetableResponse(
        label=f"{parser.faculty_display_name(code)} ({code})",
        schedule=schedule,
        slot_config=parser.slot_config_json(),
        fixed_days=parser.FIXED_DAYS,
    )


@app.get("/timetable/division/{session_id}/{div}", response_model=TimetableResponse)
def get_division_timetable(session_id: str, div: str):
    parser = get_parser(session_id)
    schedule = parser.build_division_schedule(div.upper().strip())
    return TimetableResponse(
        label=f"Division {div.upper()}",
        schedule=schedule,
        slot_config=parser.slot_config_json(),
        fixed_days=parser.FIXED_DAYS,
    )


@app.get("/timetable/batch/{session_id}/{div}/{batch}", response_model=TimetableResponse)
def get_batch_timetable(session_id: str, div: str, batch: str):
    parser = get_parser(session_id)
    schedule = parser.build_batch_schedule(div.upper().strip(), batch.upper().strip())
    return TimetableResponse(
        label=f"Division {div.upper()} · Batch {batch.upper()}",
        schedule=schedule,
        slot_config=parser.slot_config_json(),
        fixed_days=parser.FIXED_DAYS,
    )


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    _session_cache.pop(session_id, None)
    _session_ts.pop(session_id, None)
    for ext in (".xlsx", ".xlsm"):
        try:
            (UPLOAD_DIR / f"{session_id}{ext}").unlink(missing_ok=True)
        except Exception:
            pass
    return {"deleted": session_id}


@app.delete("/cache/clear")
def clear_cache():
    """Wipe all in-memory sessions — forces fresh parse on next request."""
    _session_cache.clear()
    _session_ts.clear()
    return {"cleared": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
