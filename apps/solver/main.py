import time
import logging
import hashlib
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from models import OptimizeRequest, OptimizeResponse
from solver_engine import optimize_deckle

# Configure Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
)
logger = logging.getLogger("deckle-solver")

app = FastAPI(
    title="PaperMill Deckle Cutting Stock Solver",
    description="1D Cutting Stock Optimization Service using Google OR-Tools CP-SAT",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "PaperMill Deckle Solver",
        "engine": "Google OR-Tools CP-SAT",
        "version": "2.0.0"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "papermill-deckle-solver"}

@app.post("/optimize", response_model=OptimizeResponse)
async def optimize_endpoint(req: OptimizeRequest, request: Request):
    # Compute request hash for structured audit logging
    req_body_str = req.model_dump_json()
    input_hash = hashlib.sha256(req_body_str.encode("utf-8")).hexdigest()[:12]

    item_count = len(req.items)
    machine_count = len(req.machines)
    logger.info(
        f"Optimization started [hash={input_hash}] - items={item_count}, machines={machine_count}, objective={req.options.objective}"
    )

    t0 = time.time()
    try:
        response = optimize_deckle(req)
        solve_duration_ms = int((time.time() - t0) * 1000)

        logger.info(
            f"Optimization finished [hash={input_hash}] - solve_time_ms={solve_duration_ms}, runs_created={len(response.runs)}, total_planned_kg={response.summary.total_kg}, total_trim_pct={response.summary.total_trim_percent}%"
        )
        return response
    except Exception as e:
        logger.error(f"Optimization error [hash={input_hash}]: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Solver computation error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
