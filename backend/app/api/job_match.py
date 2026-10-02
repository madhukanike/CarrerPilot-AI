from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.career_agent import CareerAgent


router = APIRouter(
    prefix="/jobs",
    tags=["Job Match"],
)


class JobMatchRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/analyze")
async def analyze_job_match(request: JobMatchRequest):
    if not request.resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Resume text is required.",
        )

    if not request.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description is required.",
        )

    try:
        agent = CareerAgent()

        analysis = agent.analyze_job_match(
            resume_text=request.resume_text,
            job_description=request.job_description,
        )

        return {
            "analysis": analysis
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )