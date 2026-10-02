from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.career_agent import CareerAgent


# -----------------------------------------------------------------------------
# Legacy/basic interview API
# -----------------------------------------------------------------------------
# The current React application uses /advanced-interview for the full interview
# flow. This router is still required by app.main.py and keeps the original
# /interview endpoints available for compatibility.
# -----------------------------------------------------------------------------

router = APIRouter(prefix="/interview", tags=["Interview"])


class InterviewQuestionRequest(BaseModel):
    resume_text: str = Field(default="", max_length=50000)
    job_role: str = Field(default="Software Engineer", min_length=2, max_length=200)


class InterviewEvaluateRequest(BaseModel):
    question: str = Field(min_length=1, max_length=10000)
    answer: str = Field(min_length=1, max_length=20000)
    job_role: str = Field(default="Software Engineer", min_length=2, max_length=200)


@router.post("/question")
def generate_question(request: InterviewQuestionRequest):
    """Generate one interview question using the shared CareerAgent."""
    try:
        if len(request.resume_text.strip()) < 20:
            raise HTTPException(
                status_code=400,
                detail="Please provide at least 20 characters of resume information.",
            )

        agent = CareerAgent()
        question = agent.generate_interview_question(
            resume_text=request.resume_text.strip(),
            job_role=request.job_role.strip(),
        )

        return {
            "question": question,
            "job_role": request.job_role.strip(),
        }

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print("Interview question generation error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to generate interview question.",
        ) from error


@router.post("/evaluate")
def evaluate_answer(request: InterviewEvaluateRequest):
    """Evaluate one interview answer using the shared CareerAgent."""
    try:
        agent = CareerAgent()
        evaluation = agent.evaluate_interview_answer(
            question=request.question.strip(),
            answer=request.answer.strip(),
            job_role=request.job_role.strip(),
        )

        score = evaluation.get("score") if isinstance(evaluation, dict) else None

        return {
            "score": score,
            "evaluation": evaluation,
            "feedback": evaluation,
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print("Interview answer evaluation error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to evaluate interview answer.",
        ) from error
