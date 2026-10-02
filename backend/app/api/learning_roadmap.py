from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import current_user
from app.agents.career_agent import CareerAgent

router = APIRouter(prefix="/learning", tags=["Learning Roadmap"])


class LearningRoadmapRequest(BaseModel):
    resume_text: str = Field(min_length=20, max_length=50000)
    target_role: str = Field(min_length=2, max_length=200)
    career_recommendations: dict = Field(default_factory=dict)
    resume_analysis: dict = Field(default_factory=dict)


@router.post("/roadmap")
def learning_roadmap(
    request: LearningRoadmapRequest,
    user=Depends(current_user),
):
    try:
        agent = CareerAgent()
        roadmap = agent.generate_learning_roadmap(
            resume_text=request.resume_text,
            target_role=request.target_role,
            career_recommendations=request.career_recommendations,
            resume_analysis=request.resume_analysis,
        )

        return {
            "roadmap": roadmap,
            "user_id": user["id"],
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print("Learning roadmap error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to generate the learning roadmap.",
        ) from error
