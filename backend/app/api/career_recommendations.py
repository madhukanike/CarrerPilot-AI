from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import current_user
from app.agents.career_agent import CareerAgent

router = APIRouter(prefix="/career", tags=["Career Recommendations"])


class CareerRecommendationRequest(BaseModel):
    resume_text: str = Field(min_length=20, max_length=50000)
    target_role: str = Field(min_length=2, max_length=200)
    resume_analysis: dict = Field(default_factory=dict)
    job_match: dict = Field(default_factory=dict)


@router.post("/recommendations")
def career_recommendations(
    request: CareerRecommendationRequest,
    user=Depends(current_user),
):
    try:
        agent = CareerAgent()
        recommendations = agent.generate_career_recommendations(
            resume_text=request.resume_text,
            target_role=request.target_role,
            resume_analysis=request.resume_analysis,
            job_match=request.job_match,
        )

        return {
            "recommendations": recommendations,
            "user_id": user["id"],
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print("Career recommendation error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to generate career recommendations.",
        ) from error
