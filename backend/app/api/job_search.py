from fastapi import APIRouter, HTTPException, Query
import httpx
import os
import re
from html import unescape
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(
    prefix="/jobs",
    tags=["Job Search"],
)


ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs"


def clean_html(text: str) -> str:
    """
    Convert HTML job descriptions into clean plain text.
    """
    if not text:
        return ""

    text = unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def get_company_name(job: dict) -> str:
    """
    Safely extract company name from Adzuna response.
    """
    company = job.get("company")

    if isinstance(company, dict):
        return company.get("display_name", "Unknown Company")

    if isinstance(company, str):
        return company

    return "Unknown Company"


def get_location_name(job: dict) -> str:
    """
    Safely extract location from Adzuna response.
    """
    location = job.get("location")

    if isinstance(location, dict):
        return location.get("display_name", "Unknown Location")

    if isinstance(location, str):
        return location

    return "Unknown Location"


def normalize_job(job: dict) -> dict:
    """
    Convert the external job response into CareerPilot's
    own consistent job structure.
    """

    return {
        "id": str(job.get("id", "")),
        "title": job.get("title", "").strip(),
        "company": get_company_name(job),
        "location": get_location_name(job),
        "description": clean_html(job.get("description", "")),
        "apply_url": job.get("redirect_url", ""),
        "created": job.get("created"),
        "salary_min": job.get("salary_min"),
        "salary_max": job.get("salary_max"),
        "contract_type": job.get("contract_type"),
        "contract_time": job.get("contract_time"),
        "category": (
            job.get("category", {}).get("label")
            if isinstance(job.get("category"), dict)
            else None
        ),
        "source": "Adzuna",
    }


@router.get("/search")
async def search_jobs(
    query: str = Query(
        default="",
        min_length=0,
        max_length=100,
        description="Job title, skill, or keyword",
    ),
    location: str = Query(
        default="",
        max_length=100,
        description="City, state, country, or other location",
    ),
    page: int = Query(
        default=1,
        ge=1,
        le=10,
        description="Page number",
    ),
    results_per_page: int = Query(
        default=10,
        ge=1,
        le=20,
        description="Number of jobs per page",
    ),
    max_days_old: int = Query(
        default=30,
        ge=1,
        le=30,
        description="Only return jobs posted within this many days",
    ),
):
    """
    Search real job listings through Adzuna.
    """

    if not query.strip() and not location.strip():
        raise HTTPException(
            status_code=400,
            detail="Please provide a job keyword or location.",
        )

    app_id = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")
    country = os.getenv("ADZUNA_COUNTRY", "in")

    if not app_id or not app_key:
        raise HTTPException(
            status_code=500,
            detail=(
                "Adzuna API credentials are missing. "
                "Add ADZUNA_APP_ID and ADZUNA_APP_KEY "
                "to the backend .env file."
            ),
        )

    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": results_per_page,
        "what": query.strip(),
        "where": location.strip(),
        "max_days_old": max_days_old,
        "content-type": "application/json",
    }

    url = f"{ADZUNA_BASE_URL}/{country}/search/{page}"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                url,
                params=params,
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Job search provider timed out. Please try again.",
        )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to job search provider: {str(exc)}",
        )

    if response.status_code != 200:
        try:
            provider_error = response.json()
        except Exception:
            provider_error = response.text

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Job search provider returned an error.",
                "provider_response": provider_error,
            },
        )

    try:
        data = response.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Job search provider returned invalid JSON.",
        )

    raw_jobs = data.get("results", [])

    jobs = [
        normalize_job(job)
        for job in raw_jobs
    ]

    return {
        "query": query.strip(),
        "location": location.strip(),
        "page": page,
        "results_per_page": results_per_page,
        "max_days_old": max_days_old,
        "total": data.get("count", len(jobs)),
        "jobs": jobs,
        "source": "Adzuna",
    }