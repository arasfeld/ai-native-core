"""Background job API — queue agent tasks and poll for results."""

from __future__ import annotations

import structlog
from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

log = structlog.get_logger()
router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobRequest(BaseModel):
    task: str  # e.g. "ingest_document", "run_agent"
    payload: dict = {}


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobResult(BaseModel):
    job_id: str
    status: str
    result: dict | None = None


async def _get_redis(request: Request) -> ArqRedis:
    arq = request.app.state.arq
    if arq is None:
        raise HTTPException(status_code=503, detail="Job queue unavailable (Redis not connected)")
    return arq


@router.post("", response_model=JobResponse, status_code=202)
async def enqueue_job(req: JobRequest, request: Request) -> JobResponse:
    """Enqueue a background task and return its job ID."""
    arq: ArqRedis = await _get_redis(request)

    task_map = {
        "ingest_document": "worker.main.ingest_document",
        "run_agent": "worker.main.run_agent",
    }
    func = task_map.get(req.task)
    if func is None:
        raise HTTPException(status_code=400, detail=f"Unknown task: {req.task!r}")

    job = await arq.enqueue_job(func, **req.payload)
    log.info("jobs.enqueued", task=req.task, job_id=job.job_id)
    return JobResponse(job_id=job.job_id, status="queued")


@router.get("/{job_id}", response_model=JobResult)
async def get_job(job_id: str, request: Request) -> JobResult:
    """Return the status and result of a background job."""
    arq: ArqRedis = await _get_redis(request)
    job = Job(job_id, arq)
    status = await job.status()

    if status == JobStatus.not_found:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    result = None
    if status == JobStatus.complete:
        info = await job.result_info()
        result = info.result if info else None

    return JobResult(job_id=job_id, status=status.value, result=result)
