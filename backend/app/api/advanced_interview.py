from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.career_agent import CareerAgent


router = APIRouter(
    prefix="/advanced-interview",
    tags=["Advanced Interview Coach"],
)


class InterviewSetupRequest(BaseModel):
    resume_text: str = Field(..., min_length=20)
    job_description: str = Field(default="")
    target_role: str = Field(default="Software Engineer")
    mode: str = Field(default="full")
    difficulty: str = Field(default="fresher")
    question_count: int = Field(default=8, ge=1, le=15)
    number_of_questions: int = Field(default=8, ge=1, le=15)


class InterviewSetupResponse(BaseModel):
    candidate_name: str
    job_title: str
    ats_score: int
    matched_skills: List[str]
    missing_skills: List[str]
    mode: str
    difficulty: str


class GenerateQuestionsRequest(BaseModel):
    resume_text: str = Field(..., min_length=20)
    job_description: str = Field(default="")
    target_role: str = Field(default="Software Engineer")
    mode: str = Field(default="full")
    difficulty: str = Field(default="fresher")
    question_count: int = Field(default=8, ge=1, le=15)
    number_of_questions: int = Field(default=8, ge=1, le=15)


class InterviewQuestion(BaseModel):
    question: str
    category: str = "general"


class GenerateQuestionsResponse(BaseModel):
    questions: List[InterviewQuestion]


class EvaluateAnswerRequest(BaseModel):
    question: str = Field(..., min_length=5)
    answer: str = Field(..., min_length=2)
    resume_text: str = Field(default="")
    target_role: str = Field(default="Software Engineer")
    job_role: str = Field(default="Software Engineer")
    category: str = Field(default="general")
    mode: str = Field(default="full")
    difficulty: str = Field(default="fresher")
    input_mode: str = Field(default="text")
    duration_seconds: float = Field(default=60.0, ge=0)


class FinalReportRequest(BaseModel):
    resume_text: str = Field(default="")
    target_role: str = Field(default="Software Engineer")
    job_role: str = Field(default="Software Engineer")
    mode: str = Field(default="full")
    difficulty: str = Field(default="fresher")
    ats_score: int = Field(default=0, ge=0, le=100)
    questions: List[Any] = Field(default_factory=list)
    evaluations: List[Dict[str, Any]] = Field(default_factory=list)
    answers: List[Dict[str, Any]] = Field(default_factory=list)


def get_agent():
    try:
        return CareerAgent()
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not initialize AI agent: {str(error)}",
        )


def get_question_count(request):
    return (
        request.number_of_questions
        or request.question_count
        or 8
    )


def get_job_description(text: str) -> str:
    if text and text.strip():
        return text.strip()

    return "General software engineering interview preparation."


def fallback_questions(mode: str, target_role: str, count: int):
    general_questions = [
        {
            "question": f"Tell me about yourself and why you want to become a {target_role}.",
            "category": "hr",
        },
        {
            "question": "Explain one important project from your resume.",
            "category": "project",
        },
        {
            "question": "What are your strongest technical skills?",
            "category": "technical",
        },
        {
            "question": "Describe a difficult problem you solved and how you solved it.",
            "category": "behavioral",
        },
        {
            "question": "How do you debug an application when it is not working correctly?",
            "category": "technical",
        },
        {
            "question": "What is the difference between supervised and unsupervised learning?",
            "category": "technical",
        },
        {
            "question": "Explain the time complexity of binary search.",
            "category": "dsa",
        },
        {
            "question": "Where do you see yourself professionally in the next three years?",
            "category": "hr",
        },
        {
            "question": "How would you improve the performance of a machine learning model?",
            "category": "technical",
        },
        {
            "question": "Describe a time when you worked successfully in a team.",
            "category": "behavioral",
        },
        {
            "question": "What is the difference between classification and regression?",
            "category": "technical",
        },
        {
            "question": "How do you handle feedback from a mentor or manager?",
            "category": "behavioral",
        },
        {
            "question": "Explain the difference between a list, tuple, and dictionary in Python.",
            "category": "dsa",
        },
        {
            "question": "Why should we select you for this role?",
            "category": "hr",
        },
        {
            "question": "What steps would you follow to deploy an AI application?",
            "category": "technical",
        },
    ]

    if mode == "technical":
        general_questions = [
            question
            for question in general_questions
            if question["category"] in ["technical", "project", "dsa"]
        ]

    elif mode == "hr":
        general_questions = [
            question
            for question in general_questions
            if question["category"] == "hr"
        ]

    elif mode == "behavioral":
        general_questions = [
            question
            for question in general_questions
            if question["category"] == "behavioral"
        ]

    elif mode == "dsa":
        general_questions = [
            question
            for question in general_questions
            if question["category"] == "dsa"
        ]

    if not general_questions:
        general_questions = fallback_questions(
            "full",
            target_role,
            count,
        )

    result = []

    for index in range(count):
        result.append(
            general_questions[index % len(general_questions)]
        )

    return result


@router.post(
    "/setup",
    response_model=InterviewSetupResponse,
)
async def setup_interview(request: InterviewSetupRequest):
    try:
        resume_words = set(
            request.resume_text.lower().split()
        )

        job_text = get_job_description(
            request.job_description
        )

        job_words = set(
            job_text.lower().split()
        )

        ignored_words = {
            "and",
            "the",
            "with",
            "for",
            "from",
            "this",
            "that",
            "you",
            "your",
            "have",
            "will",
            "are",
            "our",
            "their",
            "using",
            "years",
            "a",
            "an",
            "to",
            "of",
            "in",
            "on",
            "is",
            "as",
        }

        resume_words -= ignored_words
        job_words -= ignored_words

        matched_words = sorted(
            resume_words.intersection(job_words)
        )

        missing_words = sorted(
            job_words - resume_words
        )

        score = 0

        if job_words:
            score = round(
                len(matched_words) / len(job_words) * 100
            )

        return InterviewSetupResponse(
            candidate_name="Candidate",
            job_title=request.target_role,
            ats_score=max(0, min(100, score)),
            matched_skills=matched_words[:20],
            missing_skills=missing_words[:20],
            mode=request.mode,
            difficulty=request.difficulty,
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Interview setup failed: {str(error)}",
        )


@router.post(
    "/questions",
    response_model=GenerateQuestionsResponse,
)
async def generate_questions(
    request: GenerateQuestionsRequest,
):
    count = get_question_count(request)
    job_description = get_job_description(
        request.job_description
    )

    try:
        agent = get_agent()

        prompt = f"""
You are an expert professional interviewer.

Generate exactly {count} personalized interview questions.

Candidate resume:
{request.resume_text}

Target job role:
{request.target_role}

Job description:
{job_description}

Interview mode:
{request.mode}

Difficulty:
{request.difficulty}

Return ONLY valid JSON.

Required format:

{{
  "questions": [
    {{
      "question": "Question text",
      "category": "technical"
    }}
  ]
}}

Allowed categories:
technical, behavioral, hr, dsa, project, general

Rules:
- Generate exactly {count} questions.
- Questions must be relevant to the target role.
- Use the candidate resume where possible.
- Do not include answers.
- Do not include markdown.
"""

        result = agent._get_json_response(
            prompt=prompt,
            system_message=(
                "You are a professional interview question "
                "generator. Return only valid JSON."
            ),
        )

        questions = result.get("questions", [])

        valid_questions = []

        for item in questions:
            if isinstance(item, str):
                valid_questions.append(
                    {
                        "question": item,
                        "category": "general",
                    }
                )

            elif isinstance(item, dict):
                question_text = (
                    item.get("question")
                    or item.get("text")
                    or item.get("prompt")
                )

                if question_text:
                    valid_questions.append(
                        {
                            "question": question_text,
                            "category": item.get(
                                "category",
                                "general",
                            ),
                        }
                    )

        if valid_questions:
            return {
                "questions": valid_questions[:count]
            }

        raise ValueError(
            "The AI returned an empty question list."
        )

    except Exception as error:
        print(
            "Interview question generation failed:",
            str(error),
        )

        # Fallback questions keep the application usable
        # even when the AI service is temporarily unavailable.
        questions = fallback_questions(
            request.mode,
            request.target_role,
            count,
        )

        return {
            "questions": questions
        }


@router.post("/evaluate-answer")
async def evaluate_answer(
    request: EvaluateAnswerRequest,
):
    try:
        agent = get_agent()

        role = (
            request.target_role
            or request.job_role
            or "Software Engineer"
        )

        prompt = f"""
You are an expert interview evaluator.

Evaluate the candidate's answer.

Job role:
{role}

Interview mode:
{request.mode}

Difficulty:
{request.difficulty}

Question:
{request.question}

Candidate answer:
{request.answer}

Return ONLY valid JSON in this format:

{{
  "score": 8,
  "relevance": "Good",
  "technical_accuracy": "Good",
  "communication": "Good",
  "strengths": [
    "Strength 1"
  ],
  "improvements": [
    "Improvement 1"
  ],
  "feedback": "Detailed feedback",
  "ideal_answer": "A better sample answer"
}}

The score must be an integer from 0 to 10.
"""

        evaluation = agent._get_json_response(
            prompt=prompt,
            system_message=(
                "You are an objective interview evaluator. "
                "Return only valid JSON."
            ),
        )

        return {
            "score": evaluation.get("score", 0),
            "feedback": evaluation,
            "speech": None,
        }

    except Exception as error:
        print(
            "Answer evaluation failed:",
            str(error),
        )

        return {
            "score": 5,
            "feedback": {
                "score": 5,
                "relevance": "Needs review",
                "technical_accuracy": "Needs review",
                "communication": "Needs review",
                "strengths": [
                    "The candidate attempted the question."
                ],
                "improvements": [
                    "Add more specific examples.",
                    "Explain the answer in a clearer structure.",
                ],
                "feedback": (
                    "Your answer has a basic direction. "
                    "Try to support it with a real example "
                    "and explain the result."
                ),
                "ideal_answer": (
                    "A strong answer should directly address "
                    "the question and include a practical example."
                ),
            },
            "speech": None,
        }


@router.post("/final-report")
async def generate_final_report(
    request: FinalReportRequest,
):
    evaluations = (
        request.evaluations
        or request.answers
        or []
    )

    if not evaluations:
        raise HTTPException(
            status_code=400,
            detail="At least one evaluated answer is required.",
        )

    role = (
        request.target_role
        or request.job_role
        or "Software Engineer"
    )

    try:
        agent = get_agent()

        answers_text = "\n\n".join(
            [
                str(item)
                for item in evaluations
            ]
        )

        prompt = f"""
You are a senior hiring manager.

Create a final interview performance report.

Job role:
{role}

Interview mode:
{request.mode}

Difficulty:
{request.difficulty}

Interview evaluations:
{answers_text}

Return ONLY valid JSON in this format:

{{
  "overall_score": 75,
  "interview_readiness": "Ready",
  "strengths": [
    "Strength 1"
  ],
  "weaknesses": [
    "Weakness 1"
  ],
  "recommended_topics": [
    "Topic 1"
  ],
  "hiring_recommendation": "Recommended",
  "final_feedback": "Detailed final feedback"
}}

overall_score must be between 0 and 100.
"""

        report = agent._get_json_response(
            prompt=prompt,
            system_message=(
                "You create professional interview reports. "
                "Return only valid JSON."
            ),
        )

        return {
            "report": report
        }

    except Exception as error:
        print(
            "Final report generation failed:",
            str(error),
        )

        scores = []

        for item in evaluations:
            if isinstance(item, dict):
                score = item.get("score")

                try:
                    scores.append(float(score))
                except Exception:
                    pass

        average_score = (
            sum(scores) / len(scores)
            if scores
            else 5
        )

        return {
            "report": {
                "overall_score": round(
                    average_score * 10
                ),
                "interview_readiness": "Partially Ready",
                "strengths": [
                    "Completed the interview practice session."
                ],
                "weaknesses": [
                    "Continue practicing with structured answers."
                ],
                "recommended_topics": [
                    "Technical fundamentals",
                    "Project explanation",
                    "Communication skills",
                ],
                "hiring_recommendation": "Needs More Practice",
                "final_feedback": (
                    "Keep practicing and include specific "
                    "examples in your answers."
                ),
            }
        }