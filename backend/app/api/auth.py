from pathlib import Path
import sqlite3

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.auth import create_token, hash_password, hash_token, verify_password
from app.db import (
    create_session,
    create_user,
    delete_session,
    get_state,
    get_user_by_email,
    get_user_by_id,
    get_user_id_by_session,
    save_state,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class ProfileRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=200)


class StateRequest(BaseModel):
    resume_text: str = ""
    resume_analysis: dict = Field(default_factory=dict)
    resume_file_name: str = ""
    resume_uploaded_at: str = ""
    target_role: str = "AI Engineer"
    job_description: str = ""
    job_match: dict = Field(default_factory=dict)
    career_recommendations: dict = Field(default_factory=dict)
    learning_roadmap: dict = Field(default_factory=dict)
    applications: list = Field(default_factory=list)
    saved_jobs: list = Field(default_factory=list)
    interview_history: list = Field(default_factory=list)


def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    user_id = get_user_id_by_session(hash_token(token))
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User account was not found.")

    return user


def _db_path() -> Path:
    # backend/app/api/auth.py -> backend/data/careerpilot.db
    return Path(__file__).resolve().parents[2] / "data" / "careerpilot.db"


def _update_profile(user_id: int, name: str, email: str) -> dict:
    """Update only the authenticated user's public profile fields."""
    db_path = _db_path()
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "UPDATE users SET name = ?, email = ? WHERE id = ?",
            (name, email, user_id),
        )
        connection.commit()

    updated = get_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="User account was not found.")
    return updated


@router.post("/signup")
def signup(request: SignupRequest):
    email = request.email.strip().lower()
    name = request.name.strip()

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    if get_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    password_hash, password_salt = hash_password(request.password)
    user = create_user(name, email, password_hash, password_salt)

    token = create_token()
    create_session(user["id"], hash_token(token))

    return {"token": token, "user": user, "state": get_state(user["id"])}


@router.post("/login")
def login(request: LoginRequest):
    user = get_user_by_email(request.email)

    if not user or not verify_password(
        request.password,
        user["password_hash"],
        user["password_salt"],
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_token()
    create_session(user["id"], hash_token(token))

    public_user = get_user_by_id(user["id"])
    return {"token": token, "user": public_user, "state": get_state(user["id"])}


@router.get("/me")
def me(user=Depends(current_user)):
    return {"user": user}


@router.put("/profile")
def update_profile(request: ProfileRequest, user=Depends(current_user)):
    name = request.name.strip()
    email = request.email.strip().lower()

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    existing = get_user_by_email(email)
    if existing and existing["id"] != user["id"]:
        raise HTTPException(
            status_code=409,
            detail="Another account already uses this email address.",
        )

    updated = _update_profile(user["id"], name, email)
    return {"message": "Profile updated successfully.", "user": updated}


@router.get("/state")
def read_state(user=Depends(current_user)):
    return {"state": get_state(user["id"])}


@router.put("/state")
def write_state(request: StateRequest, user=Depends(current_user)):
    save_state(user["id"], request.model_dump())
    return {"message": "Career state saved successfully.", "state": get_state(user["id"])}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token:
            delete_session(hash_token(token))

    return {"message": "Logged out successfully."}
