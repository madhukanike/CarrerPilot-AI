import json
import os
import re

from dotenv import load_dotenv
from groq import Groq


load_dotenv(override=True)



class CareerAgent:
    """
    AI agent for resume analysis, job matching,
    and interview analysis using Groq.
    """

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise ValueError(
                "GROQ_API_KEY is missing. Add it to the .env file."
            )

        self.client = Groq(api_key=api_key)

    # ============================================================
    # COMMON AI JSON RESPONSE FUNCTION
    # ============================================================

    def _get_json_response(
        self,
        prompt: str,
        system_message: str
    ) -> dict:
        """
        Send a prompt to Groq and safely convert
        the response to JSON.
        """

        response = self.client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": system_message,
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.1,
            max_completion_tokens=4096,
            reasoning_effort="low",
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content

        if not content:
            raise ValueError(
                "The AI returned an empty response."
            )

        content = content.strip()

        # Remove markdown code fences if AI adds them.
        if content.startswith("```json"):
            content = content[7:]

        if content.startswith("```"):
            content = content[3:]

        if content.endswith("```"):
            content = content[:-3]

        content = content.strip()

        # Try normal JSON parsing first.
        try:
            return json.loads(content)

        except json.JSONDecodeError:
            # Try extracting JSON object from additional text.
            start_index = content.find("{")
            end_index = content.rfind("}")

            if start_index == -1 or end_index == -1:
                raise ValueError(
                    f"The AI response was not valid JSON: {content}"
                )

            json_content = content[
                start_index:end_index + 1
            ]

            try:
                return json.loads(json_content)

            except json.JSONDecodeError as error:
                raise ValueError(
                    f"The AI response was not valid JSON: {content}"
                ) from error

    # ============================================================
    # RESUME ANALYZER
    # ============================================================

    def analyze_resume(self, resume_text: str) -> dict:
        """
        Analyze a resume and return structured career insights.
        """

        prompt = f"""
You are CareerPilot AI, an expert professional resume
analyzer and career advisor.

Analyze the candidate's resume carefully and provide a
complete, practical, and evidence-based resume analysis.

IMPORTANT RULES:

1. Use ONLY information actually present in the resume.
2. Do NOT invent companies, job experience, education,
   certifications, achievements, projects, technologies,
   or skills.
3. If a section is not available in the resume,
   return an empty list.
4. Keep the analysis specific to the candidate.
5. Do not assume experience that is not explicitly mentioned.
6. Identify weaknesses based on what is missing, unclear,
   weakly presented, or insufficiently demonstrated.
7. Missing keywords should be useful professional or
   technical keywords relevant to the candidate's background.
8. Do not add unrelated technologies just to increase the score.
9. resume_score must be an integer from 0 to 100.
10. Return ONLY valid JSON.
11. Do not return markdown.
12. Do not return code fences.
13. Do not include explanations outside the JSON object.

Return EXACTLY this JSON structure:

{{
    "summary": "Professional summary of the candidate",

    "skills": [
        "skill1",
        "skill2",
        "skill3"
    ],

    "education": [
        "Education details"
    ],

    "experience": [
        "Experience details"
    ],

    "projects": [
        "Project details"
    ],

    "strengths": [
        "Specific strength demonstrated by the resume"
    ],

    "weaknesses": [
        "Specific resume weakness"
    ],

    "missing_skills": [
        "Relevant missing skill"
    ],

    "missing_keywords": [
        "Relevant missing keyword"
    ],

    "certifications": [
        "Certification name and provider"
    ],

    "achievements": [
        "Achievement explicitly mentioned in the resume"
    ],

    "resume_score": 0,

    "improvement_suggestions": [
        "Specific improvement suggestion"
    ],

    "recommended_roles": [
        "Recommended role"
    ]
}}

SCORING GUIDELINES:

Evaluate the resume based on:

- Professional summary
- Technical skills
- Education
- Work experience
- Internships
- Projects
- Certifications
- Achievements
- Resume structure
- Clarity
- Specificity
- Measurable results
- Career relevance
- Missing information
- Overall presentation

Do NOT give a high score simply because the resume
contains many technologies.

Do NOT give a low score simply because the candidate
is a fresher.

Base the score on the actual quality and completeness
of the resume.

------------------------------------------------------------
SUMMARY
------------------------------------------------------------

Provide a concise professional summary based only
on information found in the resume.

------------------------------------------------------------
SKILLS
------------------------------------------------------------

Extract technical and professional skills explicitly
present in the resume.

------------------------------------------------------------
EDUCATION
------------------------------------------------------------

Extract:

- Degree
- College/university
- Graduation year
- CGPA
- Percentage
- Relevant education information

Only include information actually present.

------------------------------------------------------------
EXPERIENCE
------------------------------------------------------------

Extract:

- Jobs
- Internships
- Training
- Professional experience

Do not invent experience.

------------------------------------------------------------
PROJECTS
------------------------------------------------------------

Extract projects explicitly mentioned in the resume.

Include the project name and a concise description.

Do not invent project details.

------------------------------------------------------------
STRENGTHS
------------------------------------------------------------

Identify concrete strengths demonstrated by the resume.

Examples:

- Strong Python skills
- Strong machine learning project experience
- Good API development experience
- Strong project portfolio
- Good use of measurable results

Only use strengths supported by the resume.

------------------------------------------------------------
WEAKNESSES
------------------------------------------------------------

Identify genuine resume weaknesses.

Examples:

- Missing measurable results
- Weak project descriptions
- Missing professional experience
- Missing links
- Poorly explained responsibilities
- Missing important sections
- Lack of relevant keywords
- Skills listed without evidence

Do not invent personal weaknesses.

These should be weaknesses of the RESUME,
not psychological or personality weaknesses.

------------------------------------------------------------
MISSING SKILLS
------------------------------------------------------------

Identify relevant skills that are absent or insufficiently
demonstrated based on the candidate's career direction.

Do not add completely unrelated technologies.

------------------------------------------------------------
MISSING KEYWORDS
------------------------------------------------------------

Identify useful professional or technical keywords that
could improve resume visibility.

Keywords should be relevant to the candidate's background.

Do not claim that the candidate has experience with a
keyword if the resume does not support it.

------------------------------------------------------------
CERTIFICATIONS
------------------------------------------------------------

Extract certifications explicitly mentioned in the resume.

Include:

- Certification name
- Provider
- Relevant year if available

If there are no certifications, return:

[]

------------------------------------------------------------
ACHIEVEMENTS
------------------------------------------------------------

Extract achievements explicitly mentioned in the resume.

Examples:

- Awards
- Competition results
- Academic achievements
- Publications
- Measurable accomplishments
- Recognition
- Performance results

If there are no achievements, return:

[]

------------------------------------------------------------
IMPROVEMENT SUGGESTIONS
------------------------------------------------------------

Provide practical and actionable suggestions.

Examples:

- Add measurable results
- Improve project descriptions
- Add relevant links
- Improve professional summary
- Add missing relevant keywords
- Clarify internship responsibilities

------------------------------------------------------------
RECOMMENDED ROLES
------------------------------------------------------------

Recommend roles that match the candidate's:

- Skills
- Education
- Projects
- Experience
- Career direction

Do not recommend roles that have no connection
to the resume.

------------------------------------------------------------
CANDIDATE RESUME
------------------------------------------------------------

{resume_text}
"""

        return self._get_json_response(
            prompt=prompt,
            system_message=(
                "You are a professional resume analyzer "
                "and career advisor. Analyze only the "
                "information provided in the resume. "
                "Never invent candidate information. "
                "Return exactly one valid JSON object."
            ),
        )

    # ============================================================
    # JOB MATCH ANALYZER
    # ============================================================

    def analyze_job_match(
        self,
        resume_text: str,
        job_description: str
    ) -> dict:
        """
        Compare a resume with a job description.
        """

        prompt = f"""
You are CareerPilot AI, an expert recruitment
and career advisor.

Compare the candidate's resume with the provided
job description.

Return ONLY one valid JSON object.

Do not include markdown, explanations,
code fences, or extra text.

Use exactly this JSON structure:

{{
    "match_percentage": 0,

    "overall_assessment":
        "Short assessment of the candidate's suitability",

    "matching_skills": [
        "skill1",
        "skill2"
    ],

    "missing_skills": [
        "skill1",
        "skill2"
    ],

    "matching_experience": [
        "Relevant experience from the resume"
    ],

    "experience_gaps": [
        "Experience gap"
    ],

    "recommendations": [
        "Recommendation for improving the resume or skills"
    ],

    "interview_readiness":
        "Ready, Partially Ready, or Not Ready"
}}

RULES:

1. match_percentage must be an integer from 0 to 100.
2. Use only information found in the resume
   and job description.
3. Do not invent skills.
4. Do not invent experience.
5. Do not invent education.
6. Do not invent projects.
7. If information is unavailable, return an empty list.
8. Compare:
   - Technical skills
   - Experience
   - Projects
   - Education
   - Responsibilities
9. Keep the assessment practical and relevant.
10. Return valid JSON only.

------------------------------------------------------------
CANDIDATE RESUME
------------------------------------------------------------

{resume_text}

------------------------------------------------------------
JOB DESCRIPTION
------------------------------------------------------------

{job_description}
"""

        return self._get_json_response(
            prompt=prompt,
            system_message=(
                "You are a professional job matching "
                "assistant. Return only one valid "
                "JSON object."
            ),
        )

    # ============================================================
    # SINGLE INTERVIEW QUESTION
    # ============================================================

    def generate_interview_question(
        self,
        resume_text: str,
        job_role: str
    ) -> str:
        """
        Generate one interview question based on
        the resume and job role.
        """

        prompt = f"""
You are CareerPilot AI, an expert interview coach.

Generate one relevant interview question
for the candidate.

Job Role:

{job_role}

Candidate Resume:

{resume_text}

RULES:

1. Generate only ONE question.
2. The question must be relevant to the job role.
3. Consider the candidate's actual resume.
4. Do not invent candidate experience.
5. The question should be practical and interview relevant.
6. Return only the question as plain text.
"""

        response = self.client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional interview coach. "
                        "Generate practical interview questions."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.5,
            max_completion_tokens=512,
            reasoning_effort="low",
        )

        content = response.choices[0].message.content

        if not content:
            raise ValueError(
                "The AI returned an empty interview question."
            )

        return content.strip()

    # ============================================================
    # INTERVIEW ANSWER EVALUATION
    # ============================================================

    def evaluate_interview_answer(
        self,
        question: str,
        answer: str,
        job_role: str
    ) -> dict:
        """
        Strictly evaluate one interview answer.

        Short, empty, and obvious gibberish responses are rejected
        before the LLM is called. Normal answers are evaluated by
        the LLM with strict relevance-first scoring.
        """

        question_clean = " ".join((question or "").strip().split())
        answer_clean = " ".join((answer or "").strip().split())

        # ---------------------------------------------------------
        # 1. Empty answer
        # ---------------------------------------------------------
        if not answer_clean:
            return {
                "score": 0,
                "overall_feedback": (
                    "No answer was provided. The response does not "
                    "address the interview question."
                ),
                "strengths": [],
                "improvements": [
                    "Provide a direct answer to the question.",
                    "Explain your reasoning and include a relevant example when appropriate.",
                ],
                "better_answer": (
                    "Give a direct, relevant answer with your reasoning "
                    "and a practical example where appropriate."
                ),
            }

        words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]*", answer_clean)
        letters = re.findall(r"[A-Za-z]", answer_clean)
        normalized_letters = "".join(letters).lower()

        # ---------------------------------------------------------
        # 2. One/two-word responses such as "hi", "ok", "yes"
        # ---------------------------------------------------------
        if len(words) <= 2:
            return {
                "score": 0,
                "overall_feedback": (
                    "The response is too short and does not meaningfully "
                    "answer the interview question."
                ),
                "strengths": [],
                "improvements": [
                    "Answer the actual question directly.",
                    "Use complete sentences.",
                    "Include relevant reasoning, technical details, or an example.",
                ],
                "better_answer": (
                    "Answer the question directly, explain the main idea, "
                    "and support it with a relevant example."
                ),
            }

        # ---------------------------------------------------------
        # 3. Obvious keyboard/random-text detection
        # ---------------------------------------------------------
        vowels = sum(ch in "aeiou" for ch in normalized_letters)
        vowel_ratio = vowels / len(letters) if letters else 0

        unique_letters = set(normalized_letters)

        long_no_vowel_token = any(
            len(token) >= 15 and not re.search(r"[aeiou]", token.lower())
            for token in re.findall(r"[A-Za-z]+", answer_clean)
        )

        obvious_gibberish = (
            len(letters) >= 12
            and (
                vowel_ratio < 0.15
                or len(unique_letters) <= 3
                or long_no_vowel_token
            )
        )

        if obvious_gibberish:
            return {
                "score": 0,
                "overall_feedback": (
                    "The response appears to be random or unintelligible "
                    "text and does not address the interview question."
                ),
                "strengths": [],
                "improvements": [
                    "Provide a meaningful response related to the question.",
                    "Use complete sentences and relevant technical or practical details.",
                ],
                "better_answer": (
                    "Give a clear answer that directly addresses the question "
                    "and uses relevant concepts or examples."
                ),
            }

        # ---------------------------------------------------------
        # 4. Strict LLM evaluation
        # ---------------------------------------------------------
        prompt = f"""
You are CareerPilot AI, a STRICT technical interview evaluator.

Evaluate whether the candidate actually answered the exact question.
Do not reward an answer merely because the candidate typed something.

JOB ROLE:
{job_role}

INTERVIEW QUESTION:
{question_clean}

CANDIDATE ANSWER:
{answer_clean}

Return ONLY this JSON structure:

{{
    "score": 0,
    "overall_feedback": "Specific evaluation of this answer",
    "strengths": [],
    "improvements": [],
    "better_answer": "A strong example answer to this exact question"
}}

STRICT SCORING POLICY:

1. First judge RELEVANCE. Does the answer actually respond to the question?
2. Empty, meaningless, random, greeting-only, acknowledgement-only,
   or completely unrelated answers MUST receive score 0.
3. Mostly irrelevant answers MUST receive 1-25.
4. Partially relevant but incomplete/inaccurate answers may receive 26-59.
5. A score of 60+ requires a meaningful answer to the exact question.
6. A score of 80+ requires a strong, relevant, technically accurate,
   sufficiently complete and well-structured answer.
7. Do not give points simply because the candidate attempted an answer.
8. Do not invent strengths. If there is no genuine strength, return [].
9. For technical questions, evaluate the actual concepts requested.
   Unrelated technical buzzwords do not count as correctness.
10. For behavioral questions asking for an example, look for a concrete
    situation, action, and result.
11. Evaluate:
    - relevance
    - technical accuracy
    - completeness
    - clarity
    - structure
    - reasoning
    - communication
12. Do not invent candidate experience, projects, employers,
    achievements, technologies, or results.
13. The better_answer must answer the exact question and must not claim
    the candidate personally did something they did not state.
14. score MUST be an integer from 0 to 100.
15. Return valid JSON only.
"""

        # IMPORTANT: Do not use _get_json_response() here. That helper
        # enables Groq's JSON-object constrained decoding globally, and
        # some GPT-OSS responses can trigger Groq's json_validate_failed
        # even when the generated text is valid JSON. Interview evaluation
        # is parsed safely below instead.
        response = self.client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict professional interview evaluator. "
                        "Relevance comes before completeness. Never give a "
                        "meaningful score to an irrelevant or non-responsive answer. "
                        "Return one JSON object and nothing else."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.1,
            max_completion_tokens=4096,
            reasoning_effort="low",
        )

        content = response.choices[0].message.content or ""
        content = content.strip()

        # Strip optional markdown fences.
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        # Parse JSON ourselves. If the model adds surrounding text, extract
        # the first complete JSON object.
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            start_index = content.find("{")
            end_index = content.rfind("}")
            if start_index == -1 or end_index == -1:
                raise ValueError(
                    f"The AI returned an invalid interview evaluation: {content}"
                )
            try:
                result = json.loads(content[start_index:end_index + 1])
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"The AI returned invalid JSON for interview evaluation: {content}"
                ) from error

        if not isinstance(result, dict):
            result = {}

        # ---------------------------------------------------------
        # 5. Validate the model result
        # ---------------------------------------------------------
        try:
            score = int(float(result.get("score", 0)))
        except (TypeError, ValueError):
            score = 0

        score = max(0, min(100, score))

        strengths = result.get("strengths", [])
        improvements = result.get("improvements", [])

        if not isinstance(strengths, list):
            strengths = [str(strengths)] if strengths else []

        if not isinstance(improvements, list):
            improvements = [str(improvements)] if improvements else []

        feedback = (
            result.get("overall_feedback")
            or result.get("feedback")
            or result.get("comments")
            or "No detailed feedback available."
        )

        better_answer = (
            result.get("better_answer")
            or result.get("ideal_answer")
            or "Provide a direct, relevant and technically accurate answer."
        )

        # Accept the alternative field names sometimes produced by the
        # model, while keeping one stable shape for the frontend.
        if not improvements:
            model_improvement = result.get("improvement")
            if model_improvement:
                improvements = [str(model_improvement)]

        if not strengths:
            model_strength = result.get("strength")
            if model_strength:
                strengths = [str(model_strength)]

        # Final safety guard for extremely short responses.
        if len(words) <= 3:
            score = min(score, 10)
            strengths = []

        result["score"] = score
        result["overall_feedback"] = str(feedback)
        result["strengths"] = strengths
        result["improvements"] = improvements
        result["better_answer"] = str(better_answer)

        return result

    # ============================================================
    # STAGE 15 - AI CAREER RECOMMENDATIONS
    # ============================================================

    def generate_career_recommendations(
        self,
        resume_text: str,
        target_role: str,
        resume_analysis: dict | None = None,
        job_match: dict | None = None,
    ) -> dict:
        """
        Generate personalized career recommendations using the
        candidate resume, target role, resume analysis, and latest
        job-match information.
        """

        resume_analysis = resume_analysis or {}
        job_match = job_match or {}

        prompt = f"""
You are CareerPilot AI, a practical and evidence-based career advisor.

Create personalized career recommendations for the candidate below.
Use the candidate's actual resume as the primary source. Resume analysis
and job-match data are supporting context.

IMPORTANT RULES:
1. Do not invent skills, experience, education, projects, certifications,
   achievements, or job history.
2. Clearly distinguish between skills the candidate already demonstrates
   and skills they could learn next.
3. Recommend only skills that are relevant to the target role.
4. Do not claim the candidate already has a skill merely because you
   recommend learning it.
5. Recommendations must be practical for an entry-level/fresher candidate
   when the provided evidence indicates that level.
6. Use short, actionable explanations.
7. Return ONLY valid JSON.

Return exactly this structure:
{{
  "target_role": "{target_role}",
  "career_summary": "Short personalized summary",
  "current_strengths": [
    {{"skill": "skill", "evidence": "Evidence from the resume"}}
  ],
  "skills_to_learn": [
    {{"skill": "skill", "reason": "Why it matters for the target role", "priority": "High"}}
  ],
  "recommended_projects": [
    {{"project": "Project idea", "reason": "Why it strengthens the profile"}}
  ],
  "interview_focus_areas": [
    "Topic to prepare"
  ],
  "next_steps": [
    "Concrete next action"
  ]
}}

TARGET ROLE:
{target_role}

RESUME ANALYSIS:
{json.dumps(resume_analysis, ensure_ascii=False)}

LATEST JOB MATCH:
{json.dumps(job_match, ensure_ascii=False)}

CANDIDATE RESUME:
{resume_text}
"""

        return self._get_json_response(
            prompt=prompt,
            system_message=(
                "You are a professional career advisor. "
                "Use only evidence supplied by the candidate and "
                "return exactly one valid JSON object."
            ),
        )

    # ============================================================
    # STAGE 16 - PERSONALIZED LEARNING ROADMAP
    # ============================================================

    def generate_learning_roadmap(
        self,
        resume_text: str,
        target_role: str,
        career_recommendations: dict | None = None,
        resume_analysis: dict | None = None,
    ) -> dict:
        """
        Generate a practical, personalized learning roadmap from the
        candidate's resume, target role, and Stage 15 recommendations.
        """

        career_recommendations = career_recommendations or {}
        resume_analysis = resume_analysis or {}

        prompt = f"""
You are CareerPilot AI, a practical learning-roadmap advisor.

Create a personalized learning roadmap for the candidate below.
Use the candidate's resume as the primary evidence. Stage 15 career
recommendations and resume analysis are supporting context.

IMPORTANT RULES:
1. Do not invent skills, experience, education, projects, certifications,
   or achievements.
2. Clearly separate demonstrated skills from skills/topics to learn.
3. Focus on the target role: {target_role}.
4. Prioritize skills that are relevant to the target role and useful for
   entry-level job preparation.
5. Build a logical progression from foundation to practical application.
6. Do not recommend an unnecessarily large list of technologies.
7. Include hands-on projects where they help demonstrate a skill.
8. Keep the roadmap practical and actionable.
9. Return ONLY valid JSON.

Return exactly this structure:
{{
  "target_role": "{target_role}",
  "roadmap_summary": "Short personalized explanation of the roadmap",
  "learning_stages": [
    {{
      "stage": 1,
      "title": "Stage title",
      "objective": "What the candidate should be able to do after this stage",
      "estimated_time": "Example: 1-2 weeks",
      "topics": [
        {{
          "topic": "Topic",
          "why": "Why this topic matters for the target role",
          "priority": "High"
        }}
      ],
      "practice_project": "A small practical project or exercise",
      "interview_focus": "What to prepare for interviews"
    }}
  ],
  "weekly_action_plan": [
    "Concrete weekly action"
  ],
  "milestone": "What the candidate should be ready to demonstrate at the end"
}}

TARGET ROLE:
{target_role}

STAGE 15 CAREER RECOMMENDATIONS:
{json.dumps(career_recommendations, ensure_ascii=False)}

RESUME ANALYSIS:
{json.dumps(resume_analysis, ensure_ascii=False)}

CANDIDATE RESUME:
{resume_text}
"""

        return self._get_json_response(
            prompt=prompt,
            system_message=(
                "You are a professional learning-roadmap advisor. "
                "Use only evidence supplied by the candidate and return "
                "exactly one valid JSON object."
            ),
        )

