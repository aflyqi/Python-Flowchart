"""
FastAPI server for Python-to-Flowchart tool.

Serves:
- POST /api/parse   — Parse Python source into flow graph
- POST /api/function — Parse a specific function's flow
- POST /api/project — Parse a directory as a project graph
- Static files for the React frontend (in production)
"""

import sys
import os
from pathlib import Path

# Ensure parser module is importable
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional

from parser.ast_parser import FlowGraphBuilder

app = FastAPI(title="Python Flowchart Tool", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ─────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    source: str = Field(..., description="Python source code to parse")
    filepath: str = Field(default="", description="Optional file path for context")
    enable_struct_groups: bool = Field(default=False, description="Wrap if/while/for/try bodies in colored groups")
    enable_chunk_groups: bool = Field(default=False, description="Group consecutive init/import statements")


class FunctionRequest(BaseModel):
    source: str = Field(..., description="Python source code containing the function")
    func_name: str = Field(..., description="Name of the function to visualize")
    filepath: str = Field(default="", description="Optional file path")
    max_depth: int = Field(default=0, description="How many levels of called functions to expand (0-5)")
    enable_struct_groups: bool = Field(default=False)
    enable_chunk_groups: bool = Field(default=False)


class ClassRequest(BaseModel):
    source: str = Field(..., description="Python source code containing the class")
    class_name: str = Field(..., description="Name of the class to visualize")
    filepath: str = Field(default="", description="Optional file path")
    enable_struct_groups: bool = Field(default=False)
    enable_chunk_groups: bool = Field(default=False)


class ProjectRequest(BaseModel):
    root_dir: str = Field(..., description="Root directory containing Python files")


# ── Global builder instance ────────────────────────────────────────────

_builders: dict = {}  # In-memory cache keyed by source hash


def _get_builder(source: str, filepath: str = "") -> FlowGraphBuilder:
    """Get or create a FlowGraphBuilder for the given source."""
    key = f"{filepath}:{hash(source)}"
    if key not in _builders:
        builder = FlowGraphBuilder()
        builder.parse_source(source, filepath)
        _builders[key] = builder
        # Limit cache size
        if len(_builders) > 20:
            oldest = next(iter(_builders))
            del _builders[oldest]
    return _builders[key]


# ── API routes ─────────────────────────────────────────────────────────

@app.post("/api/parse")
async def parse_code(req: ParseRequest):
    """Parse Python source code into a full file-level flow graph."""
    builder = FlowGraphBuilder()
    builder.enable_struct_groups = req.enable_struct_groups
    builder.enable_chunk_groups = req.enable_chunk_groups
    result = builder.parse_source(req.source, req.filepath)
    result["defined_functions"] = builder.get_defined_functions()
    return result


@app.post("/api/function")
async def parse_function(req: FunctionRequest):
    """Parse a specific function's internal flow graph."""
    max_depth = max(0, min(5, req.max_depth))
    builder = FlowGraphBuilder()
    builder.parse_source(req.source, req.filepath)
    result = builder.parse_function(
        req.func_name,
        filepath=req.filepath,
        max_depth=max_depth,
        enable_struct_groups=req.enable_struct_groups,
        enable_chunk_groups=req.enable_chunk_groups,
    )
    if not result.get("nodes"):
        raise HTTPException(status_code=404, detail=f"Function '{req.func_name}' not found")
    return result


@app.post("/api/class")
async def parse_class(req: ClassRequest):
    """Parse a class definition into member-level flow graph."""
    builder = FlowGraphBuilder()
    builder.parse_source(req.source, req.filepath)
    result = builder.parse_class(
        req.class_name,
        filepath=req.filepath,
        enable_struct_groups=req.enable_struct_groups,
        enable_chunk_groups=req.enable_chunk_groups,
    )
    if not result.get("nodes"):
        raise HTTPException(status_code=404, detail=f"Class '{req.class_name}' not found")
    return result


@app.post("/api/project")
async def parse_project(req: ProjectRequest):
    """Parse a directory for project-level call graph."""
    root = Path(req.root_dir).resolve()
    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {req.root_dir}")
    builder = FlowGraphBuilder()
    result = builder.parse_project(str(root))
    return result


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Static file serving (production) ───────────────────────────────────

FRONTEND_DIR = Path(__file__).parent / "frontend" / "dist"

if FRONTEND_DIR.is_dir():
    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
else:
    @app.get("/")
    async def dev_hint():
        return {
            "message": "Frontend not built. Run: cd frontend && npm run build",
            "dev_mode": "Start the Vite dev server: cd frontend && npm run dev",
        }


# ── Entry point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
