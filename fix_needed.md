# Fix Needed

| # | Issue | File | Status |
|---|-------|------|--------|
| 1 | Hardcoded `/tmp` path — breaks on Windows | `main.py` | ✅ Fixed |
| 2 | `/extract/full` route unreachable (ordering conflict) | `main.py` | ✅ Fixed |
| 3 | `.xls` accepted in HTML but rejected by backend | `index.html` | ✅ Fixed |
| 4 | Unused SheetJS CDN script (~1MB dead load) | `index.html` | ✅ Fixed |
| 5 | `FACULTY_MAP` duplicated + out of sync (missing `DKP`, `ABC`) | `script.js` + `/faculty` endpoint added | ✅ Fixed |
| 6 | Unbounded in-memory session cache (no TTL/eviction) | `main.py` | ✅ Fixed |
| 7 | `_looks_like_teacher_code` dead code | `parser_engine.py` | ✅ Fixed |
| 8 | `configure_logging` never called — logging unconfigured | `main.py` | ✅ Fixed |
