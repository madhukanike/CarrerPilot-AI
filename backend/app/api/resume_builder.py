import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.agents.career_agent import CareerAgent


router = APIRouter(
    prefix="/resume-builder",
    tags=["AI Resume Builder"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class ResumeBuilderRequest(BaseModel):
    resume_text: str
    target_role: str
    job_description: str = ""


class ResumePDFRequest(BaseModel):
    latex: str


# ============================================================
# SAFE DATA HELPERS
# ============================================================

def as_text(value: Any) -> str:
    """Convert a value to clean text without producing 'None'."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def safe_list(value: Any) -> list:
    """Return a list for AI-generated fields."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def clean_list(value: Any) -> list[str]:
    """Return non-empty strings from an AI list."""
    result = []

    for item in safe_list(value):
        text = as_text(item)

        if text:
            result.append(text)

    return result


# ============================================================
# LATEX ESCAPING
# ============================================================

LATEX_REPLACEMENTS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_latex(value: Any) -> str:
    """
    Escape text that will be inserted into normal LaTeX text.

    The AI only supplies content. The document structure remains
    controlled by this fixed renderer.
    """
    text = as_text(value)

    if not text:
        return ""

    return "".join(
        LATEX_REPLACEMENTS.get(character, character)
        for character in text
    )


def escape_latex_url(value: Any) -> str:
    """
    Escape a URL for use inside \\href{...}{...}.

    We keep URLs limited to normal http/https links. Invalid or
    unsupported links are omitted rather than allowing arbitrary
    LaTeX commands into the template.
    """
    url = as_text(value)

    if not url:
        return ""

    if not re.match(r"^https?://", url, re.IGNORECASE):
        return ""

    replacements = {
        "\\": r"\textbackslash{}",
        "%": r"\%",
        "#": r"\#",
        "{": r"\{",
        "}": r"\}",
        " ": r"\ ",
    }

    return "".join(
        replacements.get(character, character)
        for character in url
    )


# ============================================================
# LATEX BLOCK HELPERS
# ============================================================

def latex_bullets(items: Any) -> str:
    """
    Create resumeItem commands.

    Empty bullet lists return an empty string so we never generate
    an empty itemize environment.
    """
    bullets = clean_list(items)

    if not bullets:
        return ""

    return "\n".join(
        f"\\resumeItem{{{escape_latex(item)}}}"
        for item in bullets
    )


def latex_skill_line(label: str, values: Any) -> str:
    """
    Render one compact technical-skills line.

    Example:
    \\textbf{Programming Languages:} Python, SQL, Java
    """
    items = clean_list(values)

    if not items:
        return ""

    escaped_values = ", ".join(
        escape_latex(item)
        for item in items
    )

    return (
        rf"\item \textbf{{{escape_latex(label)}:}} "
        f"{escaped_values}"
    )


def build_project(project: dict) -> str:
    """
    Render one project using the structure of the user's original
    Kanike Madhu resume.

    Project heading:
      Project | technologies | Live Demo | GitHub        Year

    Bullets:
      - actual project bullets
    """
    title = escape_latex(project.get("title"))
    year = escape_latex(project.get("year"))

    technologies = clean_list(project.get("technologies"))
    technology_text = ", ".join(
        escape_latex(item)
        for item in technologies
    )

    if technology_text:
        technology_text = rf"\textit{{{technology_text}}}"

    live_demo = escape_latex_url(project.get("live_demo"))
    github = escape_latex_url(project.get("github"))

    links = []

    if live_demo:
        links.append(
            rf"\href{{{live_demo}}}{{Live Demo}}"
        )

    if github:
        links.append(
            rf"\href{{{github}}}{{GitHub}}"
        )

    heading_parts = []

    if title:
        heading_parts.append(
            rf"\textbf{{{title}}}"
        )

    if technology_text:
        heading_parts.append(
            technology_text
        )

    heading_parts.extend(links)

    left_side = " | ".join(heading_parts)

    heading = (
        "\\resumeProjectHeading\n"
        "{"
        + left_side
        + "}\n"
        "{"
        + rf"\textbf{{\small {year}}}"
        + "}"
    )

    bullets = latex_bullets(
        project.get("bullets")
    )

    if bullets:
        return (
            heading
            + "\n"
            + "\\resumeItemListStart\n"
            + bullets
            + "\n"
            + "\\resumeItemListEnd"
        )

    return heading


def build_experience(experience: dict) -> str:
    """
    Render experience in the original two-line company/role format.
    """
    company = escape_latex(
        experience.get("company")
    )

    period = escape_latex(
        experience.get("period")
    )

    role = escape_latex(
        experience.get("role")
    )

    location = escape_latex(
        experience.get("location")
    )

    heading = (
        "\\resumeSubheading\n"
        "{"
        + company
        + "}\n"
        "{"
        + period
        + "}\n"
        "{"
        + role
        + "}\n"
        "{"
        + location
        + "}"
    )

    bullets = latex_bullets(
        experience.get("bullets")
    )

    if bullets:
        return (
            heading
            + "\n"
            + "\\resumeItemListStart\n"
            + bullets
            + "\n"
            + "\\resumeItemListEnd"
        )

    return heading


def build_education(education: Any) -> str:
    """
    Render education with degree first and institution second,
    matching the user's original resume.
    """
    blocks = []

    for item in safe_list(education):
        if not isinstance(item, dict):
            continue

        degree = escape_latex(
            item.get("degree")
        )

        period = escape_latex(
            item.get("period")
        )

        institution = escape_latex(
            item.get("institution")
        )

        location = escape_latex(
            item.get("location")
        )

        if not any(
            [degree, period, institution, location]
        ):
            continue

        blocks.append(
            "\\resumeEducationHeading\n"
            "{"
            + degree
            + "}\n"
            "{"
            + period
            + "}\n"
            "{"
            + institution
            + "}\n"
            "{"
            + location
            + "}"
        )

    return "\n\n".join(blocks)


def build_certifications(certifications: Any) -> str:
    """
    Render certifications as compact dash-style entries.

    The section is omitted when there are no certifications.
    """
    items = clean_list(certifications)

    if not items:
        return ""

    rendered = []

    for item in items:
        escaped = escape_latex(item)

        if ":" in escaped:
            provider, remainder = escaped.split(":", 1)
            rendered.append(
                rf"\resumeItem{{\textbf{{{provider}:}}{remainder}}}"
            )
        else:
            rendered.append(
                rf"\resumeItem{{{escaped}}}"
            )

    return "\n".join(rendered)


# ============================================================
# FIXED USER TEMPLATE
# ============================================================

def build_latex_resume(data: dict) -> str:
    """
    Build the PDF from a fixed LaTeX template based on the user's
    original Kanike Madhu resume.

    Important design rule:
      AI controls resume CONTENT.
      This function controls resume STRUCTURE and FORMAT.
    """

    name = escape_latex(
        data.get("name")
    )

    email = escape_latex(
        data.get("email")
    )

    phone = escape_latex(
        data.get("phone")
    )

    location = escape_latex(
        data.get("location")
    )

    target_role = escape_latex(
        data.get("target_role")
    )

    linkedin = escape_latex_url(
        data.get("linkedin")
    )

    github = escape_latex_url(
        data.get("github")
    )

    portfolio = escape_latex_url(
        data.get("portfolio")
    )

    summary = escape_latex(
        data.get("summary")
    )

    skills = data.get("skills") or {}

    skill_lines = []

    skill_mapping = [
        ("Programming Languages", "programming"),
        ("AI", "ai"),
        ("Machine Learning", "machine_learning"),
        ("Backend Development", "backend"),
        ("Databases", "databases"),
        ("Cloud & DevOps", "cloud_devops"),
    ]

    for label, key in skill_mapping:
        line = latex_skill_line(
            label,
            skills.get(key),
        )

        if line:
            skill_lines.append(line)

    skills_block = "\n".join(skill_lines)

    projects = [
        build_project(item)
        for item in safe_list(data.get("projects"))
        if isinstance(item, dict)
        and any(
            as_text(item.get(key))
            for key in ("title", "year")
        )
    ]

    experience = [
        build_experience(item)
        for item in safe_list(data.get("experience"))
        if isinstance(item, dict)
        and any(
            as_text(item.get(key))
            for key in ("company", "role", "period")
        )
    ]

    education = build_education(
        data.get("education")
    )

    certifications = build_certifications(
        data.get("certifications")
    )

    # --------------------------------------------------------
    # HEADER
    # Matches the uploaded Kanike Madhu resume:
    # left = name / target role / location
    # right = email / phone / social links
    # --------------------------------------------------------

    social_parts = []

    if linkedin:
        social_parts.append(
            rf"\href{{{linkedin}}}{{LinkedIn}}"
        )

    if github:
        social_parts.append(
            rf"\href{{{github}}}{{GitHub}}"
        )

    if portfolio:
        social_parts.append(
            rf"\href{{{portfolio}}}{{Portfolio}}"
        )

    social_block = " $|$ ".join(social_parts)

    header_left = (
        rf"{{\Huge \scshape {name}}}"
        r"\\[2pt]"
        rf"\textbf{{{target_role}}}"
        r"\\[2pt]"
        rf"{location}"
    )

    header_right_lines = []

    if email:
        header_right_lines.append(
            rf"\textbf{{Email:}} {email}"
        )

    if phone:
        header_right_lines.append(
            rf"\textbf{{Phone:}} {phone}"
        )

    if social_block:
        header_right_lines.append(
            social_block
        )

    header_right = r"\\[2pt]".join(
        header_right_lines
    )

    # --------------------------------------------------------
    # OPTIONAL SECTIONS
    # --------------------------------------------------------

    projects_section = ""

    if projects:
        projects_section = (
            "%----------PROJECTS----------\n\n"
            "\\section{Projects}\n\n"
            "\\resumeSubHeadingListStart\n\n"
            + "\n\n".join(projects)
            + "\n\n"
            "\\resumeSubHeadingListEnd\n"
        )

    experience_section = ""

    if experience:
        experience_section = (
            "%----------EXPERIENCE----------\n\n"
            "\\section{Experience}\n\n"
            "\\resumeSubHeadingListStart\n\n"
            + "\n\n".join(experience)
            + "\n\n"
            "\\resumeSubHeadingListEnd\n"
        )

    education_section = ""

    if education:
        education_section = (
            "%----------EDUCATION----------\n\n"
            "\\section{Education}\n\n"
            "\\resumeSubHeadingListStart\n\n"
            + education
            + "\n\n"
            "\\resumeSubHeadingListEnd\n"
        )

    certifications_section = ""

    if certifications:
        certifications_section = (
            "%----------CERTIFICATIONS----------\n\n"
            "\\section{Certifications}\n\n"
            "\\resumeItemListStart\n"
            + certifications
            + "\n"
            "\\resumeItemListEnd\n"
        )

    # --------------------------------------------------------
    # USER'S FIXED LATEX TEMPLATE
    # --------------------------------------------------------

    latex = r"""
\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}
\usepackage{multicol}

\input{glyphtounicode}
\pdfgentounicode=1

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\setlength{\footskip}{8pt}

\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1.19in}
\addtolength{\topmargin}{-.7in}
\addtolength{\textheight}{1.4in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large\bfseries
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{1.0\textwidth}[t]{
      l@{\extracolsep{\fill}}r
    }
      \textbf{#1} & \textbf{\small #2} \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{1.001\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & \textbf{\small #2}\\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeEducationHeading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{1.0\textwidth}[t]{
      l@{\extracolsep{\fill}}r
    }
      \textbf{\small #1} & \textbf{\small #2} \\
      \textit{\small #3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{
  \resumeItem{#1}\vspace{-4pt}
}

\renewcommand\labelitemi{--}

\newcommand{\resumeSubHeadingListStart}{
  \begin{itemize}[leftmargin=0.0in, label={}]
}

\newcommand{\resumeSubHeadingListEnd}{
  \end{itemize}
}

\newcommand{\resumeItemListStart}{
  \begin{itemize}
}

\newcommand{\resumeItemListEnd}{
  \end{itemize}\vspace{-5pt}
}

\begin{document}

%----------HEADING----------

\begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}

\begin{minipage}[t]{0.62\textwidth}
__HEADER_LEFT__
\end{minipage}
&
\begin{minipage}[t]{0.35\textwidth}
\raggedleft
\small
__HEADER_RIGHT__
\end{minipage}

\end{tabular*}

\vspace{4pt}

%----------SUMMARY----------

\section{Professional Summary}

__SUMMARY__

%----------TECHNICAL SKILLS----------

\section{Technical Skills}

\begin{itemize}[leftmargin=0.15in, label={}, itemsep=0pt, topsep=0pt, parsep=0pt, partopsep=0pt]

\small
__SKILLS__

\end{itemize}

__PROJECTS_SECTION__

__EXPERIENCE_SECTION__

__EDUCATION_SECTION__

__CERTIFICATIONS_SECTION__

\end{document}
""".strip()

    replacements = {
        "__NAME__": name,
        "__HEADER_LEFT__": header_left,
        "__HEADER_RIGHT__": header_right,
        "__SUMMARY__": summary,
        "__SKILLS__": skills_block,
        "__PROJECTS_SECTION__": projects_section,
        "__EXPERIENCE_SECTION__": experience_section,
        "__EDUCATION_SECTION__": education_section,
        "__CERTIFICATIONS_SECTION__": certifications_section,
    }

    for placeholder, value in replacements.items():
        latex = latex.replace(
            placeholder,
            value or "",
        )

    return latex.strip() + "\n"


# ============================================================
# ATS RESUME GENERATION
# ============================================================

@router.post("/generate")
def generate_ats_resume(
    request: ResumeBuilderRequest,
):
    """
    Generate structured ATS-optimized resume content with the
    existing CareerAgent, then render it through the fixed
    Kanike Madhu LaTeX template.
    """

    resume_text = request.resume_text.strip()
    target_role = request.target_role.strip()
    job_description = request.job_description.strip()

    if len(resume_text) < 20:
        raise HTTPException(
            status_code=400,
            detail="Resume text is too short.",
        )

    if not target_role:
        raise HTTPException(
            status_code=400,
            detail="Target role is required.",
        )

    try:
        agent = CareerAgent()

        result = agent.generate_ats_resume(
            resume_text=resume_text,
            target_role=target_role,
            job_description=job_description,
        )

        if not isinstance(result, dict):
            raise ValueError(
                "CareerAgent.generate_ats_resume() "
                "did not return a JSON object."
            )

        # Keep the selected target role authoritative.
        result["target_role"] = target_role

        latex = build_latex_resume(result)

        return {
            "message": "ATS-friendly resume generated successfully.",
            "resume": result,
            "latex": latex,
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            "ATS resume generation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# PDF COMPILATION
# ============================================================

@router.post("/pdf")
def generate_resume_pdf(
    request: ResumePDFRequest,
):
    """
    Compile the generated LaTeX into a PDF.

    The endpoint intentionally compiles only the LaTeX generated
    by this application and disables shell escape.
    """

    latex = request.latex.strip()

    if not latex:
        raise HTTPException(
            status_code=400,
            detail="LaTeX content is empty.",
        )

    pdflatex_path = shutil.which("pdflatex")

    if not pdflatex_path:
        raise HTTPException(
            status_code=503,
            detail=(
                "pdflatex was not found on this computer. "
                "Install MiKTeX or TeX Live and make sure "
                "pdflatex is available in PATH."
            ),
        )

    temp_dir = tempfile.mkdtemp(
        prefix="careerpilot_resume_",
    )

    try:
        temp_path = Path(temp_dir)

        tex_file = (
            temp_path /
            "CareerPilot_ATS_Resume.tex"
        )

        pdf_file = (
            temp_path /
            "CareerPilot_ATS_Resume.pdf"
        )

        tex_file.write_text(
            latex,
            encoding="utf-8",
        )

        command = [
            pdflatex_path,
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-no-shell-escape",
            "-file-line-error",
            "-output-directory",
            str(temp_path),
            str(tex_file),
        ]

        result = subprocess.run(
            command,
            cwd=temp_dir,
            capture_output=True,
            text=True,
            timeout=90,
        )

        print(
            "========== PDFLATEX STDOUT =========="
        )
        print(result.stdout)

        print(
            "========== PDFLATEX STDERR =========="
        )
        print(result.stderr)

        print(
            "========== PDFLATEX RETURN CODE =========="
        )
        print(result.returncode)

        if result.returncode != 0 or not pdf_file.exists():
            log_file = (
                temp_path /
                "CareerPilot_ATS_Resume.log"
            )

            log_text = ""

            if log_file.exists():
                try:
                    log_text = log_file.read_text(
                        encoding="utf-8",
                        errors="replace",
                    )
                except Exception:
                    log_text = ""

            output = (
                result.stdout
                or result.stderr
                or log_text
                or "Unknown LaTeX compilation error."
            )

            # Keep the API error readable while still exposing
            # the useful LaTeX message in the backend terminal.
            error_lines = [
                line.strip()
                for line in output.splitlines()
                if line.strip()
            ]

            useful_lines = [
                line
                for line in error_lines
                if (
                    "!" in line
                    or "Error" in line
                    or "Fatal" in line
                    or "Emergency" in line
                )
            ]

            if useful_lines:
                detail = "LaTeX compilation failed: " + " ".join(
                    useful_lines[:5]
                )
            else:
                detail = (
                    "LaTeX compilation failed. "
                    "Check the backend terminal for the full pdflatex log."
                )

            raise HTTPException(
                status_code=500,
                detail=detail,
            )

        return FileResponse(
            path=str(pdf_file),
            media_type="application/pdf",
            filename="CareerPilot_ATS_Resume.pdf",
            background=BackgroundTask(
                shutil.rmtree,
                temp_dir,
                ignore_errors=True,
            ),
        )

    except HTTPException:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )
        raise

    except subprocess.TimeoutExpired:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        raise HTTPException(
            status_code=504,
            detail=(
                "PDF compilation timed out after 90 seconds."
            ),
        )

    except Exception as error:
        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

        print(
            "PDF generation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# END OF FILE
# ============================================================
