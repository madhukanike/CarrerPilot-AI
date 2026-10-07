from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.resume import router as resume_router
from app.api.job_match import router as job_match_router
from app.api.interview import router as interview_router
from app.api.advanced_interview import router as advanced_interview_router
from app.api.job_search import router as job_search_router
from app.api.career_recommendations import router as career_recommendations_router
from app.api.learning_roadmap import router as learning_roadmap_router
from app.api.resume_builder import router as resume_builder_router
from app.db import init_db


app = FastAPI(
    title="CareerPilot AI",
    description="AI-powered career assistant",
    version="0.1.0",
)


# Initialize the SQLite database when the backend starts.
# This creates backend/data/careerpilot.db automatically if it does not exist.
init_db()


# Allow the Vite/React frontend to communicate with FastAPI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://carrerpilot-ai-1-459n.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# API ROUTERS
# ============================================================

# Stage 10: Signup, Login, Logout, User State
app.include_router(auth_router)

# Existing CareerPilot functionality
app.include_router(resume_router)
app.include_router(job_match_router)
app.include_router(interview_router)
app.include_router(advanced_interview_router)
app.include_router(job_search_router)
app.include_router(career_recommendations_router)
app.include_router(learning_roadmap_router)
app.include_router(resume_builder_router)


# ============================================================
# BASIC HEALTH ROUTES
# ============================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to CareerPilot AI",
        "status": "Backend is running",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }
