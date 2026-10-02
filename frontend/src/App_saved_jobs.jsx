import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

/* =========================================================
   HELPERS
========================================================= */

function safeText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => safeText(item))
            .filter(Boolean)
            .join(", ");
    }

    if (typeof value === "object") {
        return Object.entries(value)
            .map(([key, item]) => {
                return `${key.replace(/_/g, " ")}: ${safeText(item)}`;
            })
            .join(" | ");
    }

    return String(value);
}

function getArray(value) {
    if (value === null || value === undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [value];
}

function getQuestionText(question) {
    if (!question) {
        return "Question unavailable";
    }

    if (typeof question === "string") {
        return question;
    }

    return (
        question.question ||
        question.text ||
        question.prompt ||
        question.content ||
        question.question_text ||
        "Question unavailable"
    );
}

function formatJobSalary(min, max) {
    if (min === null && max === null) {
        return "Salary not disclosed";
    }

    const formatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    });

    if (min !== null && max !== null) {
        return `${formatter.format(min)} – ${formatter.format(max)}`;
    }

    if (min !== null) return `From ${formatter.format(min)}`;
    return `Up to ${formatter.format(max)}`;
}

function getJobExperience(job) {
    const text = `${safeText(job?.title)} ${safeText(job?.description)}`
        .replace(/\s+/g, " ")
        .toLowerCase();

    if (/\b(fresher|freshers|entry[-\s]?level|no experience|0\s*(?:-|to)\s*1?\s*years?)\b/.test(text)) {
        return { min: 0, max: 0, label: "Fresher" };
    }

    const rangePatterns = [
        /(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*)?experience/,
        /(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:years?|yrs?)/,
    ];

    for (const pattern of rangePatterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                min: Number(match[1]),
                max: Number(match[2]),
                label: `${match[1]}-${match[2]} years`,
            };
        }
    }

    const minimumPatterns = [
        /(?:minimum|at least)\s*(?:of\s*)?(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*)?experience/,
        /(\d+)\s*\+\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*)?experience/,
        /(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*)?experience/,
    ];

    for (const pattern of minimumPatterns) {
        const match = text.match(pattern);
        if (match) {
            const years = Number(match[1]);
            return { min: years, max: null, label: `${years}+ years` };
        }
    }

    return null;
}

function matchesExperienceFilter(job, filter) {
    if (filter === "any") return true;

    const experience = getJobExperience(job);

    if (filter === "fresher") {
        return experience?.min === 0;
    }

    if (!experience) return false;

    const years = Number(filter);

    if (filter === "5plus") {
        return experience.min >= 5;
    }

    // For a specific year, include jobs whose stated requirement
    // is up to that experience level, including ranges such as 1-2 years.
    return experience.min <= years &&
        (experience.max === null || experience.max >= years || experience.max === 0);
}

function formatJobDate(dateString) {
    if (!dateString) return "Date not available";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "Date not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
}

/* =========================================================
   APP
========================================================= */

function App() {
    /* =======================================================
       NAVIGATION
    ======================================================= */

    const [activePage, setActivePage] = useState("dashboard");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    /* =======================================================
       GLOBAL UI
    ======================================================= */

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const [loading, setLoading] = useState(false);
    const [resumeLoading, setResumeLoading] = useState(false);
    const [jobLoading, setJobLoading] = useState(false);
    const [evaluationLoading, setEvaluationLoading] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);

    /* =======================================================
       RESUME
    ======================================================= */

    const [resumeFile, setResumeFile] = useState(null);
    const [resumeText, setResumeText] = useState("");
    const [resumeAnalysis, setResumeAnalysis] = useState(null);

    /* =======================================================
       JOB MATCH
    ======================================================= */

    const [targetRole, setTargetRole] = useState("AI Engineer");
    const [jobDescription, setJobDescription] = useState("");
    const [jobMatch, setJobMatch] = useState(null);

    /* =======================================================
       INTERVIEW
    ======================================================= */

    const [interviewMode, setInterviewMode] = useState("full");
    const [difficulty, setDifficulty] = useState("fresher");
    const [numberOfQuestions, setNumberOfQuestions] = useState(8);

    const [interviewStarted, setInterviewStarted] =
        useState(false);
    const [interviewFinished, setInterviewFinished] =
        useState(false);

    const [interviewQuestions, setInterviewQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const [answer, setAnswer] = useState("");
    const [evaluations, setEvaluations] = useState([]);
    const [finalReport, setFinalReport] = useState(null);

    /* =======================================================
       JOB SEARCH
    ======================================================= */

    const [jobSearchKeyword, setJobSearchKeyword] = useState("");
    const [jobSearchLocation, setJobSearchLocation] = useState("");
    const [jobSearchExperience, setJobSearchExperience] = useState("any");
    const [jobSearchMaxDays, setJobSearchMaxDays] = useState(30);
    const [jobSearchResults, setJobSearchResults] = useState([]);
    const [jobSearchTotal, setJobSearchTotal] = useState(0);
    const [jobSearchPage, setJobSearchPage] = useState(1);
    const [jobSearchLoading, setJobSearchLoading] = useState(false);
    const [jobSearchSearched, setJobSearchSearched] = useState(false);

    /* =======================================================
       APPLICATION TRACKER
    ======================================================= */

    const APPLICATIONS_STORAGE_KEY = "careerpilot_applications";

    const [applications, setApplications] = useState(() => {
        try {
            const saved = localStorage.getItem(APPLICATIONS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (storageError) {
            console.error("Unable to load tracked applications:", storageError);
            return [];
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(
                APPLICATIONS_STORAGE_KEY,
                JSON.stringify(applications)
            );
        } catch (storageError) {
            console.error("Unable to save tracked applications:", storageError);
        }
    }, [applications]);

    /* =======================================================
       SAVED JOBS
    ======================================================= */

    const SAVED_JOBS_STORAGE_KEY = "careerpilot_saved_jobs";

    const [savedJobs, setSavedJobs] = useState(() => {
        try {
            const saved = localStorage.getItem(SAVED_JOBS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (storageError) {
            console.error("Unable to load saved jobs:", storageError);
            return [];
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(
                SAVED_JOBS_STORAGE_KEY,
                JSON.stringify(savedJobs)
            );
        } catch (storageError) {
            console.error("Unable to save jobs:", storageError);
        }
    }, [savedJobs]);

    /* =======================================================
       MENU
    ======================================================= */

    const navigationItems = [
        {
            id: "dashboard",
            label: "Dashboard",
            icon: "⌂",
        },
        {
            id: "resume",
            label: "Resume Analyzer",
            icon: "▤",
        },
        {
            id: "job-match",
            label: "Job Match",
            icon: "◇",
        },
        {
            id: "interview",
            label: "AI Interview Coach",
            icon: "◉",
        },
        {
            id: "job-search",
            label: "Job Search",
            icon: "⌕",
        },
        {
            id: "applications",
            label: "Application Tracker",
            icon: "✓",
        },
        {
            id: "saved-jobs",
            label: "Saved Jobs",
            icon: "★",
        },
        {
            id: "history",
            label: "History",
            icon: "◷",
        },
    ];

    /* =======================================================
       MESSAGE FUNCTIONS
    ======================================================= */

    const clearMessages = () => {
        setError("");
        setMessage("");
    };

    const showError = (text) => {
        setError(text);
        setMessage("");
    };

    const showMessage = (text) => {
        setMessage(text);
        setError("");
    };


    /* =======================================================
       JOB SEARCH API
    ======================================================= */

    const searchJobs = async (requestedPage = 1) => {
        clearMessages();

        const keyword = jobSearchKeyword.trim();
        const location = jobSearchLocation.trim();

        if (!keyword && !location) {
            showError("Please enter a job keyword or location.");
            return;
        }

        setJobSearchLoading(true);

        try {
            const params = new URLSearchParams();

            if (keyword) params.set("query", keyword);
            if (location) params.set("location", location);
            params.set("page", String(requestedPage));
            params.set("results_per_page", "10");
            params.set("max_days_old", String(jobSearchMaxDays));

            const response = await fetch(
                `${API_URL}/jobs/search?${params.toString()}`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                    },
                }
            );

            const data = await response.json();

            if (!response.ok) {
                const detail =
                    typeof data.detail === "string"
                        ? data.detail
                        : data.detail
                            ? safeText(data.detail)
                            : "Job search failed.";

                throw new Error(detail);
            }

            const jobs = Array.isArray(data.jobs)
                ? data.jobs
                : [];

            // Experience is not a standardized Adzuna filter, so we detect
            // experience requirements from each returned job description/title.
            const filteredJobs = jobs.filter((job) =>
                matchesExperienceFilter(job, jobSearchExperience)
            );

            setJobSearchResults(filteredJobs);
            setJobSearchTotal(
                jobSearchExperience === "any"
                    ? Number(data.total) || 0
                    : filteredJobs.length
            );
            setJobSearchPage(Number(data.page) || requestedPage);
            setJobSearchSearched(true);

            showMessage(
                jobs.length
                    ? `${jobs.length} jobs found.`
                    : "No jobs were found for this search."
            );
        } catch (err) {
            console.error("Job search error:", err);
            setJobSearchResults([]);
            setJobSearchTotal(0);
            setJobSearchSearched(true);
            showError(err.message || "Unable to search for jobs.");
        } finally {
            setJobSearchLoading(false);
        }
    };

    /* =======================================================
       FILE SELECTION
    ======================================================= */

    const handleResumeFileChange = (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const fileName = file.name.toLowerCase();

        const allowed =
            fileName.endsWith(".pdf") ||
            fileName.endsWith(".docx") ||
            fileName.endsWith(".txt");

        if (!allowed) {
            showError("Please upload a PDF, DOCX, or TXT resume.");
            event.target.value = "";
            return;
        }

        setResumeFile(file);
        clearMessages();
    };

    /* =======================================================
       RESUME UPLOAD + ANALYSIS
    ======================================================= */

    const uploadResume = async () => {
        clearMessages();

        if (!resumeFile) {
            showError("Please select a resume file first.");
            return;
        }

        setResumeLoading(true);

        try {
            const formData = new FormData();

            formData.append("file", resumeFile);

            const response = await fetch(`${API_URL}/resume/upload`, {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Resume analysis failed."
                );
            }

            const extractedResumeText =
                data.resume_text ||
                data.text ||
                data.extracted_text ||
                data.raw_text ||
                "";

            setResumeText(extractedResumeText);
            setResumeAnalysis(data.analysis || data);

            showMessage(
                "Resume uploaded and analyzed successfully."
            );
        } catch (err) {
            console.error("Resume upload error:", err);

            showError(
                err.message || "Unable to analyze resume."
            );
        } finally {
            setResumeLoading(false);
        }
    };

    /* =======================================================
       JOB MATCH ANALYSIS
       
       IMPORTANT:
       Backend expects JSON:
       
       {
         resume_text,
         job_description
       }
    ======================================================= */

    const analyzeJobMatch = async () => {
        clearMessages();

        if (!resumeText.trim()) {
            showError(
                "Please analyze your resume first so CareerPilot AI can use the extracted resume text."
            );
            return;
        }

        if (jobDescription.trim().length < 20) {
            showError(
                "Please enter a complete job description."
            );
            return;
        }

        setJobLoading(true);

        try {
            const payload = {
                resume_text: resumeText,
                job_description: jobDescription,
            };

            const response = await fetch(`${API_URL}/jobs/analyze`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Job match analysis failed."
                );
            }

            /*
              Backend response:
      
              {
                "analysis": {
                   "match_percentage": 100,
                   ...
                }
              }
            */

            const analysis = data.analysis || data;

            setJobMatch(analysis);

            showMessage(
                "Job match analysis completed successfully."
            );
        } catch (err) {
            console.error("Job match error:", err);

            showError(
                err.message || "Unable to analyze job match."
            );
        } finally {
            setJobLoading(false);
        }
    };

    /* =======================================================
       START INTERVIEW
       
       Backend expects:
  
       resume_text
       job_description
       mode
       difficulty
       number_of_questions
    ======================================================= */

    const handleStartInterview = async () => {
        clearMessages();

        if (resumeText.trim().length < 20) {
            showError(
                "Please analyze your resume first or paste at least 20 characters of resume information."
            );
            return;
        }

        if (jobDescription.trim().length < 20) {
            showError(
                "Please enter a job description of at least 20 characters."
            );
            return;
        }

        if (!targetRole.trim()) {
            showError("Please enter your target job role.");
            return;
        }

        setLoading(true);

        setInterviewStarted(false);
        setInterviewQuestions([]);
        setCurrentQuestionIndex(0);
        setAnswer("");
        setEvaluations([]);
        setFinalReport(null);

        try {
            /* ---------------------------------------------------
               EXACT BACKEND PAYLOAD
            --------------------------------------------------- */

            const payload = {
                resume_text: resumeText,
                job_description: jobDescription,
                mode: interviewMode,
                difficulty: difficulty,
                number_of_questions: Number(numberOfQuestions),
            };

            /* ---------------------------------------------------
               STEP 1: SETUP
            --------------------------------------------------- */

            const setupResponse = await fetch(
                `${API_URL}/advanced-interview/setup`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const setupData = await setupResponse.json();

            if (!setupResponse.ok) {
                throw new Error(
                    setupData.detail || "Interview setup failed."
                );
            }

            console.log("Interview setup:", setupData);

            /* ---------------------------------------------------
               STEP 2: GENERATE QUESTIONS
            --------------------------------------------------- */

            const questionsResponse = await fetch(
                `${API_URL}/advanced-interview/questions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const questionsData =
                await questionsResponse.json();

            if (!questionsResponse.ok) {
                throw new Error(
                    questionsData.detail ||
                    "Interview question generation failed."
                );
            }

            console.log(
                "Questions API response:",
                questionsData
            );

            /* ---------------------------------------------------
               NORMALIZE QUESTIONS
            --------------------------------------------------- */

            let generatedQuestions = [];

            if (Array.isArray(questionsData)) {
                generatedQuestions = questionsData;
            } else if (
                Array.isArray(questionsData.questions)
            ) {
                generatedQuestions = questionsData.questions;
            } else if (
                Array.isArray(
                    questionsData.interview_questions
                )
            ) {
                generatedQuestions =
                    questionsData.interview_questions;
            } else if (
                Array.isArray(questionsData.generated_questions)
            ) {
                generatedQuestions =
                    questionsData.generated_questions;
            } else if (Array.isArray(questionsData.data)) {
                generatedQuestions = questionsData.data;
            }

            if (generatedQuestions.length === 0) {
                console.error(
                    "Unexpected question response:",
                    questionsData
                );

                throw new Error(
                    "The backend did not return any interview questions. Please check the backend terminal for the AI response."
                );
            }

            /* ---------------------------------------------------
               START SESSION
            --------------------------------------------------- */

            setInterviewQuestions(generatedQuestions);
            setCurrentQuestionIndex(0);
            setAnswer("");
            setEvaluations([]);
            setFinalReport(null);
            setInterviewStarted(true);

            showMessage(
                `${generatedQuestions.length} interview questions generated successfully.`
            );
        } catch (err) {
            console.error(
                "Interview generation error:",
                err
            );

            showError(
                err.message ||
                "Unable to generate interview questions."
            );
        } finally {
            setLoading(false);
        }
    };

    /* =======================================================
       EVALUATE CURRENT ANSWER
       
       Backend expects:
  
       question
       answer
       job_role
       category
       input_mode
       duration_seconds
    ======================================================= */

    const handleEvaluateAnswer = async () => {
        clearMessages();

        if (interviewQuestions.length === 0) {
            showError("No interview questions are available.");
            return;
        }

        const currentQuestion =
            interviewQuestions[currentQuestionIndex];

        if (!currentQuestion) {
            showError("Current interview question is unavailable.");
            return;
        }

        if (!answer.trim()) {
            showError(
                "Please enter your answer before evaluating."
            );
            return;
        }

        setEvaluationLoading(true);

        try {
            const questionText =
                getQuestionText(currentQuestion);

            const payload = {
                question: questionText,
                answer: answer.trim(),
                job_role: targetRole,
                category:
                    currentQuestion.category || "general",
                input_mode: "text",
                duration_seconds: 0,
            };

            console.log(
                "Evaluation payload:",
                payload
            );

            const response = await fetch(
                `${API_URL}/advanced-interview/evaluate-answer`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Answer evaluation failed."
                );
            }

            console.log(
                "Evaluation response:",
                data
            );

            const evaluationResult =
                data.feedback ||
                data.evaluation ||
                data.result ||
                data;

            const newEvaluation = {
                questionNumber:
                    currentQuestionIndex + 1,

                question: questionText,

                answer: answer.trim(),

                evaluation: evaluationResult,

                score:
                    data.score ??
                    evaluationResult?.score ??
                    null,
            };

            setEvaluations((previous) => [
                ...previous,
                newEvaluation,
            ]);

            setAnswer("");

            /* ---------------------------------------------------
               MOVE TO NEXT QUESTION
            --------------------------------------------------- */

            if (
                currentQuestionIndex <
                interviewQuestions.length - 1
            ) {
                setCurrentQuestionIndex(
                    (previous) => previous + 1
                );

                showMessage(
                    "Answer evaluated successfully. Moving to the next question."
                );
            } else {
                showMessage(
                    "All interview questions have been completed. You can now generate the final report."
                );
            }
        } catch (err) {
            console.error(
                "Answer evaluation error:",
                err
            );

            showError(
                err.message ||
                "Unable to evaluate answer."
            );
        } finally {
            setEvaluationLoading(false);
        }
    };

    /* =======================================================
       FINAL REPORT
       
       Backend expects:
  
       job_role
       ats_score
       answers
    ======================================================= */

    const handleGenerateFinalReport = async () => {
        clearMessages();

        if (evaluations.length === 0) {
            showError(
                "Please evaluate at least one interview answer first."
            );
            return;
        }

        setReportLoading(true);

        try {
            const answers = evaluations.map(
                (item) => ({
                    question: item.question,
                    answer: item.answer,
                    feedback: item.evaluation,
                })
            );

            const matchScore =
                Number(
                    jobMatch?.match_percentage
                ) || 0;

            const payload = {
                job_role: targetRole,
                ats_score: matchScore,
                answers: answers,
            };

            console.log(
                "Final report payload:",
                payload
            );

            const response = await fetch(
                `${API_URL}/advanced-interview/final-report`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Final report generation failed."
                );
            }

            console.log(
                "Final report response:",
                data
            );

            setFinalReport(
                data.report ||
                data.final_report ||
                data.result ||
                data
            );

            showMessage(
                "Final interview report generated successfully."
            );
        } catch (err) {
            console.error(
                "Final report error:",
                err
            );

            showError(
                err.message ||
                "Unable to generate final report."
            );
        } finally {
            setReportLoading(false);
        }
    };

    /* =======================================================
       RESET INTERVIEW
    ======================================================= */

    const handleResetInterview = () => {
        setInterviewStarted(false);
        setInterviewQuestions([]);
        setCurrentQuestionIndex(0);
        setAnswer("");
        setEvaluations([]);
        setFinalReport(null);

        clearMessages();
    };

    /* =======================================================
       NAVIGATION
    ======================================================= */

    const navigateTo = (page) => {
        setActivePage(page);
        clearMessages();
    };

    /* =======================================================
       SAVED JOB ACTIONS
    ======================================================= */

    const isJobSaved = (job) => {
        const jobId = getJobTrackingId(job);
        return savedJobs.some((savedJob) => savedJob.jobId === jobId);
    };

    const saveJob = (job) => {
        clearMessages();

        const jobId = getJobTrackingId(job);

        if (savedJobs.some((savedJob) => savedJob.jobId === jobId)) {
            showMessage("This job is already saved.");
            return;
        }

        const savedJob = {
            id: `${jobId}-${Date.now()}`,
            jobId,
            title: job.title || "Untitled position",
            company: job.company || "Company not disclosed",
            location: job.location || "Location not disclosed",
            source: job.source || "Job listing",
            applyUrl: job.apply_url || "",
            salary: formatJobSalary(job.salary_min, job.salary_max),
            contractTime:
                job.contract_time ||
                job.contract_type ||
                "Employment type not specified",
            category: job.category || "",
            postedDate: job.created || "",
            savedAt: new Date().toISOString(),
        };

        setSavedJobs((previous) => [savedJob, ...previous]);
        showMessage("Job saved successfully.");
    };

    const removeSavedJob = (savedJobId) => {
        setSavedJobs((previous) =>
            previous.filter((savedJob) => savedJob.id !== savedJobId)
        );
        showMessage("Job removed from Saved Jobs.");
    };

    const applySavedJob = (savedJob) => {
        const existingApplication = applications.find(
            (application) => application.jobId === savedJob.jobId
        );

        if (existingApplication) {
            showMessage("This job is already in your Application Tracker.");
            navigateTo("applications");
            return;
        }

        addJobToTracker(savedJob, "Applied");
    };

    const renderSavedJobsPage = () => {
        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">JOB COLLECTION</span>
                    <h1>Saved Jobs</h1>
                    <p>
                        Keep interesting opportunities here and decide later when you
                        want to apply. Saved jobs remain available after refreshing the
                        browser.
                    </p>
                </div>

                {savedJobs.length === 0 ? (
                    <div className="panel job-empty-panel">
                        <div className="empty-icon">★</div>
                        <h2>No saved jobs yet</h2>
                        <p>
                            Go to Job Search and click “Save Job” on opportunities you want
                            to review later.
                        </p>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => navigateTo("job-search")}
                        >
                            Search jobs →
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="job-results-toolbar">
                            <div>
                                <strong>{savedJobs.length}</strong>{" "}
                                <span>saved jobs</span>
                            </div>
                            <span className="job-page-label">
                                Saved in this browser
                            </span>
                        </div>

                        <div className="job-results-list">
                            {savedJobs.map((job) => (
                                <article className="job-card" key={job.id}>
                                    <div className="job-card-main">
                                        <span className="job-source">{job.source}</span>
                                        <h2 className="job-card-title">{job.title}</h2>

                                        <div className="job-meta">
                                            <span>◉ {job.company}</span>
                                            <span>⌖ {job.location}</span>
                                        </div>

                                        <div className="job-details">
                                            <span className="job-detail-tag">
                                                {job.contractTime}
                                            </span>
                                            {job.category && (
                                                <span className="job-detail-tag">
                                                    {job.category}
                                                </span>
                                            )}
                                            <span className="job-detail-tag">
                                                {job.salary}
                                            </span>
                                        </div>

                                        <div className="job-posted">
                                            Saved {formatJobDate(job.savedAt)}
                                        </div>
                                    </div>

                                    <div className="job-card-action">
                                        {job.applyUrl ? (
                                            <a
                                                className="job-apply-button"
                                                href={job.applyUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View & Apply ↗
                                            </a>
                                        ) : null}

                                        <button
                                            type="button"
                                            className="primary-button"
                                            onClick={() => applySavedJob(job)}
                                        >
                                            Mark Applied
                                        </button>

                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => removeSavedJob(job.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    /* =======================================================
       APPLICATION TRACKER ACTIONS
    ======================================================= */

    const getJobTrackingId = (job) => {
        return String(
            job.id ||
            job.apply_url ||
            `${job.title || "job"}-${job.company || "company"}-${job.location || "location"}`
        );
    };

    const isJobTracked = (job) => {
        const jobId = getJobTrackingId(job);
        return applications.some(
            (application) => application.jobId === jobId
        );
    };

    const addJobToTracker = (job, initialStatus = "Saved") => {
        const jobId = getJobTrackingId(job);
        const existingApplication = applications.find(
            (application) => application.jobId === jobId
        );

        if (existingApplication) {
            if (
                initialStatus === "Applied" &&
                existingApplication.status !== "Applied"
            ) {
                setApplications((previous) =>
                    previous.map((application) =>
                        application.jobId === jobId
                            ? { ...application, status: "Applied" }
                            : application
                    )
                );
                showMessage("This job is already tracked and is now marked Applied.");
            } else {
                showMessage("This job is already in your Application Tracker.");
            }
            return;
        }

        const newApplication = {
            id: `${jobId}-${Date.now()}`,
            jobId,
            title: job.title || "Untitled position",
            company: job.company || "Company not disclosed",
            location: job.location || "Location not disclosed",
            source: job.source || "Job listing",
            applyUrl: job.apply_url || "",
            salary: formatJobSalary(job.salary_min, job.salary_max),
            contractTime:
                job.contract_time ||
                job.contract_type ||
                "Employment type not specified",
            category: job.category || "",
            postedDate: job.created || "",
            addedAt: new Date().toISOString(),
            status: initialStatus,
            notes: "",
        };

        setApplications((previous) => [newApplication, ...previous]);

        if (initialStatus === "Applied") {
            showMessage("Job added to your Application Tracker as Applied.");
        } else {
            showMessage("Job added to your Application Tracker.");
        }
    };

    const trackJob = (job) => {
        clearMessages();
        addJobToTracker(job, "Saved");
    };

    const markJobApplied = (job) => {
        clearMessages();
        addJobToTracker(job, "Applied");
    };

    const updateApplicationStatus = (applicationId, status) => {
        setApplications((previous) =>
            previous.map((application) =>
                application.id === applicationId
                    ? { ...application, status }
                    : application
            )
        );
        showMessage("Application status updated.");
    };

    const updateApplicationNotes = (applicationId, notes) => {
        setApplications((previous) =>
            previous.map((application) =>
                application.id === applicationId
                    ? { ...application, notes }
                    : application
            )
        );
    };

    const removeApplication = (applicationId) => {
        setApplications((previous) =>
            previous.filter(
                (application) => application.id !== applicationId
            )
        );
        showMessage("Job removed from your Application Tracker.");
    };

    const renderApplicationTrackerPage = () => {
        const statusOptions = [
            "Saved",
            "Applied",
            "Assessment",
            "Interview",
            "Selected",
            "Rejected",
        ];

        const countByStatus = (status) =>
            applications.filter(
                (application) => application.status === status
            ).length;

        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">APPLICATION MANAGEMENT</span>
                    <h1>Application Tracker</h1>
                    <p>
                        Keep track of the jobs you want to apply for, applications you
                        have submitted, interviews, and final outcomes.
                    </p>
                </div>

                <div className="panel">
                    <div className="job-results-toolbar">
                        <div>
                            <strong>{applications.length}</strong>{" "}
                            <span>tracked jobs</span>
                        </div>
                        <span className="job-page-label">
                            Saved in this browser
                        </span>
                    </div>

                    <div className="form-grid">
                        {statusOptions.map((status) => (
                            <div className="form-group" key={status}>
                                <label>{status}</label>
                                <div className="form-input">
                                    {countByStatus(status)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {applications.length === 0 ? (
                    <div className="panel job-empty-panel">
                        <div className="empty-icon">✓</div>
                        <h2>No applications tracked yet</h2>
                        <p>
                            Go to Job Search and click “Track Job” on any listing you want
                            to follow.
                        </p>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => navigateTo("job-search")}
                        >
                            Find jobs →
                        </button>
                    </div>
                ) : (
                    <div className="job-results-list">
                        {applications.map((application) => (
                            <article
                                className="job-card"
                                key={application.id}
                            >
                                <div className="job-card-main">
                                    <span className="job-source">
                                        {application.source}
                                    </span>

                                    <h2 className="job-card-title">
                                        {application.title}
                                    </h2>

                                    <div className="job-meta">
                                        <span>◉ {application.company}</span>
                                        <span>⌖ {application.location}</span>
                                    </div>

                                    <div className="job-details">
                                        <span className="job-detail-tag">
                                            {application.status}
                                        </span>

                                        <span className="job-detail-tag">
                                            {application.contractTime}
                                        </span>

                                        <span className="job-detail-tag">
                                            {application.salary}
                                        </span>
                                    </div>

                                    <div className="job-posted">
                                        Added {formatJobDate(application.addedAt)}
                                    </div>

                                    <div className="form-group" style={{ marginTop: "18px" }}>
                                        <label>Application status</label>
                                        <select
                                            className="form-input"
                                            value={application.status}
                                            onChange={(event) =>
                                                updateApplicationStatus(
                                                    application.id,
                                                    event.target.value
                                                )
                                            }
                                        >
                                            {statusOptions.map((status) => (
                                                <option value={status} key={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group" style={{ marginTop: "12px" }}>
                                        <label>Notes</label>
                                        <textarea
                                            className="form-input"
                                            rows="3"
                                            value={application.notes}
                                            onChange={(event) =>
                                                updateApplicationNotes(
                                                    application.id,
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Interview date, recruiter details, preparation notes..."
                                        />
                                    </div>
                                </div>

                                <div className="job-card-action">
                                    {application.applyUrl ? (
                                        <a
                                            className="job-apply-button"
                                            href={application.applyUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            View & Apply ↗
                                        </a>
                                    ) : null}

                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => removeApplication(application.id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    /* =======================================================
       RESUME PAGE
    ======================================================= */

    const renderResumePage = () => {
        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">
                        RESUME INTELLIGENCE
                    </span>

                    <h1>Resume Analyzer</h1>

                    <p>
                        Upload your resume and let CareerPilot AI
                        analyze your skills, experience, projects,
                        strengths, weaknesses, and improvement areas.
                    </p>
                </div>

                <div className="panel">
                    <h2>Upload your resume</h2>

                    <p className="muted">
                        Supported formats: PDF, DOCX, TXT
                    </p>

                    <label className="upload-box">
                        <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            onChange={handleResumeFileChange}
                        />

                        <span className="upload-icon">
                            ☁
                        </span>

                        <strong>
                            {resumeFile
                                ? resumeFile.name
                                : "Choose your resume"}
                        </strong>

                        <small>
                            Click to browse your computer
                        </small>
                    </label>

                    <button
                        type="button"
                        className="primary-button"
                        onClick={uploadResume}
                        disabled={resumeLoading}
                    >
                        {resumeLoading
                            ? "Analyzing resume..."
                            : "Analyze resume →"}
                    </button>
                </div>

                {resumeAnalysis && (
                    <div className="panel">
                        <span className="eyebrow">
                            ANALYSIS REPORT
                        </span>

                        <h2>
                            Resume insights
                        </h2>

                        <div className="analysis-section">
                            <h3>Summary</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.summary
                                ) ||
                                    "No summary available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Skills</h3>

                            <div className="tag-list">
                                {getArray(
                                    resumeAnalysis.skills
                                ).map(
                                    (skill, index) => (
                                        <span
                                            className="skill-tag"
                                            key={index}
                                        >
                                            {safeText(skill)}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>

                        <div className="analysis-section">
                            <h3>Education</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.education
                                ) ||
                                    "No education information available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Experience</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.experience
                                ) ||
                                    "No experience information available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Projects</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.projects
                                ) ||
                                    "No project information available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Strengths</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.strengths
                                ) ||
                                    "No strengths available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Weaknesses</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.weaknesses
                                ) ||
                                    "No weaknesses available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Missing Keywords</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.missing_keywords
                                ) ||
                                    "No missing keywords available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>Suggestions</h3>

                            <p>
                                {safeText(
                                    resumeAnalysis.suggestions ||
                                    resumeAnalysis.recommendations
                                ) ||
                                    "No suggestions available."}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /* =======================================================
       JOB MATCH PAGE
    ======================================================= */

    const renderJobMatchPage = () => {
        const matchPercentage =
            jobMatch?.match_percentage ?? 0;

        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">
                        CAREER FIT
                    </span>

                    <h1>
                        Job Match Analyzer
                    </h1>

                    <p>
                        Compare your resume with a real job
                        description and understand your
                        compatibility.
                    </p>
                </div>

                <div className="panel">
                    <h2>
                        Resume vs Job Description
                    </h2>

                    <div className="form-group">
                        <label>
                            Target job title
                        </label>

                        <input
                            className="form-input"
                            value={targetRole}
                            onChange={(event) =>
                                setTargetRole(
                                    event.target.value
                                )
                            }
                            placeholder="Example: AI Engineer"
                        />
                    </div>

                    <div className="form-group">
                        <label>
                            Job description
                        </label>

                        <textarea
                            className="form-input textarea"
                            value={jobDescription}
                            onChange={(event) =>
                                setJobDescription(
                                    event.target.value
                                )
                            }
                            placeholder="Paste the complete job description here..."
                            rows={10}
                        />
                    </div>

                    <button
                        type="button"
                        className="primary-button"
                        onClick={analyzeJobMatch}
                        disabled={jobLoading}
                    >
                        {jobLoading
                            ? "Analyzing..."
                            : "Analyze job match →"}
                    </button>
                </div>

                {jobMatch && (
                    <div className="panel">
                        <span className="eyebrow">
                            MATCH REPORT
                        </span>

                        <h2>
                            Job compatibility
                        </h2>

                        <div className="score-box">
                            <strong>
                                {safeText(
                                    matchPercentage
                                )}
                            </strong>

                            <span>
                                Match percentage
                            </span>

                            <small>/100</small>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Overall assessment
                            </h3>

                            <p>
                                {safeText(
                                    jobMatch.overall_assessment
                                ) ||
                                    "No assessment available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Matching Skills
                            </h3>

                            <div className="tag-list">
                                {getArray(
                                    jobMatch.matching_skills
                                ).map(
                                    (skill, index) => (
                                        <span
                                            className="skill-tag"
                                            key={index}
                                        >
                                            {safeText(skill)}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Missing Skills
                            </h3>

                            <div className="tag-list">
                                {getArray(
                                    jobMatch.missing_skills
                                ).map(
                                    (skill, index) => (
                                        <span
                                            className="skill-tag missing"
                                            key={index}
                                        >
                                            {safeText(skill)}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Matching Experience
                            </h3>

                            <p>
                                {safeText(
                                    jobMatch.matching_experience
                                ) ||
                                    "No matching experience information available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Experience Gaps
                            </h3>

                            <p>
                                {safeText(
                                    jobMatch.experience_gaps
                                ) ||
                                    "No experience gaps identified."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Recommendations
                            </h3>

                            <p>
                                {safeText(
                                    jobMatch.recommendations
                                ) ||
                                    "No recommendations available."}
                            </p>
                        </div>

                        <div className="analysis-section">
                            <h3>
                                Interview Readiness
                            </h3>

                            <p>
                                {safeText(
                                    jobMatch.interview_readiness
                                ) ||
                                    "Not available"}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /* =======================================================
       INTERVIEW SETUP
    ======================================================= */

    const renderInterviewSetup = () => {
        return (
            <div className="panel">
                <h2>
                    Interview setup
                </h2>

                <p className="muted">
                    Configure your personalized AI interview.
                </p>

                <div className="form-group">
                    <label>
                        Resume information
                    </label>

                    <textarea
                        className="form-input textarea"
                        value={resumeText}
                        onChange={(event) =>
                            setResumeText(
                                event.target.value
                            )
                        }
                        placeholder="Analyze your resume first or paste your resume information here..."
                        rows={8}
                    />
                </div>

                <div className="form-group">
                    <label>
                        Job description
                    </label>

                    <textarea
                        className="form-input textarea"
                        value={jobDescription}
                        onChange={(event) =>
                            setJobDescription(
                                event.target.value
                            )
                        }
                        placeholder="Paste the job description here..."
                        rows={7}
                    />
                </div>

                <div className="form-grid">
                    <div className="form-group">
                        <label>
                            Target role
                        </label>

                        <input
                            className="form-input"
                            value={targetRole}
                            onChange={(event) =>
                                setTargetRole(
                                    event.target.value
                                )
                            }
                            placeholder="AI Engineer"
                        />
                    </div>

                    <div className="form-group">
                        <label>
                            Number of questions
                        </label>

                        <select
                            className="form-input"
                            value={numberOfQuestions}
                            onChange={(event) =>
                                setNumberOfQuestions(
                                    Number(
                                        event.target.value
                                    )
                                )
                            }
                        >
                            <option value={5}>
                                5 questions
                            </option>

                            <option value={8}>
                                8 questions
                            </option>

                            <option value={10}>
                                10 questions
                            </option>

                            <option value={15}>
                                15 questions
                            </option>
                        </select>
                    </div>
                </div>

                {/* INTERVIEW MODE */}

                <div className="form-group">
                    <label>
                        Interview mode
                    </label>

                    <div className="option-grid">
                        <button
                            type="button"
                            className={`option-button ${interviewMode === "full"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setInterviewMode("full")
                            }
                        >
                            <strong>
                                ✦ Full Interview
                            </strong>

                            <span>
                                Complete interview simulation
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`option-button ${interviewMode ===
                                "technical"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setInterviewMode(
                                    "technical"
                                )
                            }
                        >
                            <strong>
                                ⌘ Technical
                            </strong>

                            <span>
                                Technical and role-specific questions
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`option-button ${interviewMode === "hr"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setInterviewMode("hr")
                            }
                        >
                            <strong>
                                ♟ HR Round
                            </strong>

                            <span>
                                HR and communication questions
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`option-button ${interviewMode ===
                                "behavioral"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setInterviewMode(
                                    "behavioral"
                                )
                            }
                        >
                            <strong>
                                ◌ Behavioral
                            </strong>

                            <span>
                                Situation-based questions
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`option-button ${interviewMode === "dsa"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setInterviewMode("dsa")
                            }
                        >
                            <strong>
                                ⌘ DSA
                            </strong>

                            <span>
                                Data structures and algorithms
                            </span>
                        </button>
                    </div>
                </div>

                {/* DIFFICULTY */}

                <div className="form-group">
                    <label>
                        Difficulty level
                    </label>

                    <div className="difficulty-buttons">
                        <button
                            type="button"
                            className={`difficulty-button ${difficulty === "fresher"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setDifficulty("fresher")
                            }
                        >
                            Fresher
                        </button>

                        <button
                            type="button"
                            className={`difficulty-button ${difficulty === "mid"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setDifficulty("mid")
                            }
                        >
                            Mid-level
                        </button>

                        <button
                            type="button"
                            className={`difficulty-button ${difficulty === "senior"
                                ? "selected"
                                : ""
                                }`}
                            onClick={() =>
                                setDifficulty("senior")
                            }
                        >
                            Senior
                        </button>
                    </div>
                </div>

                <div className="interview-note">
                    <strong>
                        Selected mode:
                    </strong>{" "}
                    {interviewMode.toUpperCase()}
                    <br />

                    <strong>
                        Difficulty:
                    </strong>{" "}
                    {difficulty.toUpperCase()}
                    <br />

                    <strong>
                        Questions:
                    </strong>{" "}
                    {numberOfQuestions}
                </div>

                <button
                    type="button"
                    className="primary-button"
                    onClick={handleStartInterview}
                    disabled={loading}
                >
                    {loading
                        ? "Generating questions..."
                        : "Start interview →"}
                </button>
            </div>
        );
    };

    /* =======================================================
       EVALUATION CARD
    ======================================================= */

    const renderEvaluation = (
        item,
        index
    ) => {
        const evaluation =
            item.evaluation || {};

        return (
            <div
                className="evaluation-card"
                key={`${item.questionNumber}-${index}`}
            >
                <div className="evaluation-heading">
                    <span>
                        Question {item.questionNumber} of{" "}
                        {interviewQuestions.length}
                    </span>
                </div>

                <h3>
                    {safeText(item.question)}
                </h3>

                <div className="evaluation-section">
                    <h4>
                        Your answer
                    </h4>

                    <p>
                        {safeText(item.answer)}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Score
                    </h4>

                    <p>
                        {safeText(
                            item.score ??
                            evaluation.score ??
                            evaluation.rating ??
                            "Not available"
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Feedback
                    </h4>

                    <p>
                        {safeText(
                            evaluation.feedback ||
                            evaluation.overall_feedback ||
                            evaluation.comments ||
                            "No feedback available."
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Strengths
                    </h4>

                    <p>
                        {safeText(
                            evaluation.strengths ||
                            "Not available"
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Improvements
                    </h4>

                    <p>
                        {safeText(
                            evaluation.improvements ||
                            evaluation.areas_for_improvement ||
                            "Not available"
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Technical accuracy
                    </h4>

                    <p>
                        {safeText(
                            evaluation.technical_accuracy ||
                            "Not available"
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Communication
                    </h4>

                    <p>
                        {safeText(
                            evaluation.communication ||
                            "Not available"
                        )}
                    </p>
                </div>

                <div className="evaluation-section">
                    <h4>
                        Ideal answer
                    </h4>

                    <p>
                        {safeText(
                            evaluation.ideal_answer ||
                            evaluation.model_answer ||
                            "Not available"
                        )}
                    </p>
                </div>
            </div>
        );
    };

    /* =======================================================
       INTERVIEW PAGE
    ======================================================= */

    const renderInterviewPage = () => {
        const currentQuestion =
            interviewQuestions[
            currentQuestionIndex
            ];

        const isLastQuestion =
            currentQuestionIndex ===
            interviewQuestions.length - 1;

        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">
                        INTERVIEW PREPARATION
                    </span>

                    <h1>
                        AI Interview Coach
                    </h1>

                    <p>
                        Practice personalized interview
                        questions and receive AI-powered
                        feedback after every answer.
                    </p>
                </div>

                {!interviewStarted &&
                    renderInterviewSetup()}

                {interviewStarted &&
                    currentQuestion && (
                        <>
                            <div className="panel">
                                <div className="interview-header">
                                    <div>
                                        <span className="eyebrow">
                                            LIVE INTERVIEW
                                        </span>

                                        <h2>
                                            Question{" "}
                                            {currentQuestionIndex + 1}{" "}
                                            of{" "}
                                            {interviewQuestions.length}
                                        </h2>
                                    </div>

                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={
                                            handleResetInterview
                                        }
                                    >
                                        Restart
                                    </button>
                                </div>

                                <div className="interview-meta">
                                    <span>
                                        {interviewMode.toUpperCase()}
                                    </span>

                                    <span>
                                        {difficulty.toUpperCase()}
                                    </span>
                                </div>

                                <div className="progress-track">
                                    <div
                                        className="progress-value"
                                        style={{
                                            width: `${((currentQuestionIndex +
                                                1) /
                                                interviewQuestions.length) *
                                                100
                                                }%`,
                                        }}
                                    />
                                </div>

                                <div className="progress-label">
                                    <span>
                                        Question{" "}
                                        {currentQuestionIndex + 1}
                                    </span>

                                    <span>
                                        {interviewQuestions.length} total
                                    </span>
                                </div>

                                <div className="question-box">
                                    <span className="question-label">
                                        QUESTION{" "}
                                        {currentQuestionIndex + 1}
                                    </span>

                                    <h2>
                                        {getQuestionText(
                                            currentQuestion
                                        )}
                                    </h2>
                                </div>

                                <div className="form-group">
                                    <label>
                                        Your answer
                                    </label>

                                    <textarea
                                        className="form-input textarea answer-box"
                                        value={answer}
                                        onChange={(event) =>
                                            setAnswer(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Type your answer here..."
                                        rows={9}
                                    />
                                </div>

                                <div className="interview-actions">
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={
                                            handleEvaluateAnswer
                                        }
                                        disabled={
                                            evaluationLoading
                                        }
                                    >
                                        {evaluationLoading
                                            ? "Evaluating..."
                                            : isLastQuestion
                                                ? "Evaluate final answer →"
                                                : "Evaluate answer →"}
                                    </button>

                                    {evaluations.length >
                                        0 && (
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={
                                                    handleGenerateFinalReport
                                                }
                                                disabled={
                                                    reportLoading
                                                }
                                            >
                                                {reportLoading
                                                    ? "Generating..."
                                                    : "Generate final report"}
                                            </button>
                                        )}
                                </div>
                            </div>

                            {evaluations.length >
                                0 && (
                                    <div className="panel">
                                        <span className="eyebrow">
                                            ANSWER FEEDBACK
                                        </span>

                                        <h2>
                                            Evaluation history
                                        </h2>

                                        {evaluations.map(
                                            renderEvaluation
                                        )}
                                    </div>
                                )}

                            {finalReport && (
                                <div className="panel final-report">
                                    <span className="eyebrow">
                                        FINAL REPORT
                                    </span>

                                    <h2>
                                        Interview performance
                                    </h2>

                                    <div className="score-box">
                                        <strong>
                                            {safeText(
                                                finalReport.overall_score ??
                                                finalReport.score ??
                                                finalReport.total_score ??
                                                "N/A"
                                            )}
                                        </strong>

                                        <span>
                                            Overall score
                                        </span>
                                    </div>

                                    <div className="analysis-section">
                                        <h3>
                                            Summary
                                        </h3>

                                        <p>
                                            {safeText(
                                                finalReport.summary ||
                                                finalReport.overall_feedback ||
                                                "No summary available."
                                            )}
                                        </p>
                                    </div>

                                    <div className="analysis-section">
                                        <h3>
                                            Strengths
                                        </h3>

                                        <p>
                                            {safeText(
                                                finalReport.strengths ||
                                                "No strengths available."
                                            )}
                                        </p>
                                    </div>

                                    <div className="analysis-section">
                                        <h3>
                                            Areas for improvement
                                        </h3>

                                        <p>
                                            {safeText(
                                                finalReport.improvements ||
                                                finalReport.areas_for_improvement ||
                                                finalReport.areas_to_improve ||
                                                "No improvement areas available."
                                            )}
                                        </p>
                                    </div>

                                    <div className="analysis-section">
                                        <h3>
                                            Recommendations
                                        </h3>

                                        <p>
                                            {safeText(
                                                finalReport.recommendations ||
                                                "No recommendations available."
                                            )}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
            </div>
        );
    };

    /* =======================================================
       DASHBOARD
    ======================================================= */

    const renderDashboard = () => {
        const matchPercentage =
            jobMatch?.match_percentage;

        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">
                        CAREER INTELLIGENCE
                    </span>

                    <h1>
                        Your career command center
                    </h1>

                    <p>
                        Analyze your resume, match jobs,
                        practice interviews, and improve
                        your career readiness.
                    </p>
                </div>

                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-icon">
                            ▤
                        </span>

                        <div>
                            <strong>
                                {resumeAnalysis ? "1" : "0"}
                            </strong>

                            <p>
                                Resume analyzed
                            </p>
                        </div>
                    </div>

                    <div className="stat-card">
                        <span className="stat-icon">
                            ◇
                        </span>

                        <div>
                            <strong>
                                {matchPercentage !==
                                    undefined
                                    ? `${matchPercentage}%`
                                    : "--"}
                            </strong>

                            <p>
                                Job match
                            </p>
                        </div>
                    </div>

                    <div className="stat-card">
                        <span className="stat-icon">
                            ◉
                        </span>

                        <div>
                            <strong>
                                {evaluations.length}
                            </strong>

                            <p>
                                Answers evaluated
                            </p>
                        </div>
                    </div>

                    <div className="stat-card">
                        <span className="stat-icon">
                            ✦
                        </span>

                        <div>
                            <strong>
                                {finalReport ? "1" : "0"}
                            </strong>

                            <p>
                                Final reports
                            </p>
                        </div>
                    </div>
                </div>

                <div className="dashboard-grid">
                    <div className="panel welcome-panel">
                        <span className="eyebrow">
                            GET STARTED
                        </span>

                        <h2>
                            Build your career with confidence.
                        </h2>

                        <p>
                            Upload your resume first. Then
                            compare it with jobs and practice
                            personalized AI interviews.
                        </p>

                        <button
                            type="button"
                            className="primary-button"
                            onClick={() =>
                                navigateTo("resume")
                            }
                        >
                            Analyze resume →
                        </button>
                    </div>

                    <div className="panel">
                        <span className="eyebrow">
                            QUICK ACTIONS
                        </span>

                        <h2>
                            Career tools
                        </h2>

                        <div className="quick-actions">
                            <button
                                type="button"
                                onClick={() =>
                                    navigateTo("resume")
                                }
                            >
                                <span>▤</span>
                                Resume Analyzer
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    navigateTo("job-match")
                                }
                            >
                                <span>◇</span>
                                Job Match
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    navigateTo("interview")
                                }
                            >
                                <span>◉</span>
                                AI Interview Coach
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    navigateTo("job-search")
                                }
                            >
                                <span>⌕</span>
                                Job Search
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    /* =======================================================
       JOB SEARCH
    ======================================================= */

    const renderJobSearchPage = () => {
        const hasPreviousPage = jobSearchPage > 1;
        const hasNextPage =
            jobSearchResults.length === 10 &&
            jobSearchPage * 10 < jobSearchTotal;

        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">OPPORTUNITY DISCOVERY</span>
                    <h1>Job Search</h1>
                    <p>
                        Search real job opportunities by role and location
                        and discover your next career opportunity.
                    </p>
                </div>

                <div className="panel job-search-panel">
                    <div className="job-search-header">
                        <h2>Find your next opportunity</h2>
                        <p className="muted">
                            Search real job listings through the connected job provider.
                        </p>
                    </div>

                    <div className="form-grid">
                        <div className="form-group">
                            <label>Job keyword</label>
                            <input
                                type="text"
                                className="form-input"
                                value={jobSearchKeyword}
                                onChange={(event) => setJobSearchKeyword(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") searchJobs(1);
                                }}
                                placeholder="AI Engineer, Python Developer, Data Analyst..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Location</label>
                            <input
                                type="text"
                                className="form-input"
                                value={jobSearchLocation}
                                onChange={(event) => setJobSearchLocation(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") searchJobs(1);
                                }}
                                placeholder="Hyderabad, Bengaluru, Chennai..."
                            />
                        </div>
                    </div>

                    <div className="job-search-filters">
                        <div className="form-group">
                            <label>Experience</label>
                            <select
                                className="form-input"
                                value={jobSearchExperience}
                                onChange={(event) => {
                                    setJobSearchExperience(event.target.value);
                                }}
                            >
                                <option value="any">Any experience</option>
                                <option value="fresher">Fresher</option>
                                <option value="1">1 year</option>
                                <option value="2">2 years</option>
                                <option value="3">3 years</option>
                                <option value="4">4 years</option>
                                <option value="5plus">5+ years</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Posted within</label>
                            <select
                                className="form-input"
                                value={jobSearchMaxDays}
                                onChange={(event) =>
                                    setJobSearchMaxDays(Number(event.target.value))
                                }
                            >
                                <option value={1}>Last 24 hours</option>
                                <option value={7}>Last 7 days</option>
                                <option value={14}>Last 14 days</option>
                                <option value={30}>Last 30 days</option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="primary-button job-search-button"
                        onClick={() => searchJobs(1)}
                        disabled={jobSearchLoading}
                    >
                        {jobSearchLoading ? "Searching jobs..." : "Search jobs →"}
                    </button>
                </div>

                {jobSearchSearched && (
                    <div className="job-results-toolbar">
                        <div>
                            <strong>{jobSearchTotal.toLocaleString("en-IN")}</strong>{" "}
                            <span>jobs found</span>
                        </div>
                        <span className="job-page-label">Page {jobSearchPage}</span>
                    </div>
                )}

                {jobSearchLoading && (
                    <div className="panel job-loading-panel">
                        <div className="loading-spinner" />
                        <h3>Searching for jobs...</h3>
                        <p className="muted">Fetching available job listings.</p>
                    </div>
                )}

                {!jobSearchLoading &&
                    jobSearchSearched &&
                    jobSearchResults.length === 0 && (
                        <div className="panel job-empty-panel">
                            <div className="empty-icon">⌕</div>
                            <h2>No jobs found</h2>
                            <p>
                                Try another keyword, location, or a wider posting-date filter.
                            </p>
                        </div>
                    )}

                {!jobSearchLoading && jobSearchResults.length > 0 && (
                    <div className="job-results-list">
                        {jobSearchResults.map((job, index) => (
                            <article
                                className="job-card"
                                key={job.id || `${job.title}-${index}`}
                            >
                                <div className="job-card-main">
                                    <span className="job-source">
                                        {job.source || "Job listing"}
                                    </span>

                                    <h2 className="job-card-title">
                                        {job.title || "Untitled position"}
                                    </h2>

                                    <div className="job-meta">
                                        <span>
                                            ◉ {job.company || "Company not disclosed"}
                                        </span>
                                        <span>
                                            ⌖ {job.location || "Location not disclosed"}
                                        </span>
                                    </div>

                                    <p className="job-description">
                                        {job.description || "No job description available."}
                                    </p>

                                    <div className="job-details">
                                        <span className="job-detail-tag">
                                            {job.contract_time ||
                                                job.contract_type ||
                                                "Employment type not specified"}
                                        </span>

                                        {job.category && (
                                            <span className="job-detail-tag">
                                                {job.category}
                                            </span>
                                        )}

                                        <span className="job-detail-tag">
                                            {formatJobSalary(job.salary_min, job.salary_max)}
                                        </span>
                                    </div>

                                    <div className="job-posted">
                                        Posted {formatJobDate(job.created)}
                                    </div>
                                </div>

                                <div className="job-card-action">
                                    {job.apply_url ? (
                                        <a
                                            className="job-apply-button"
                                            href={job.apply_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            View & Apply ↗
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            disabled
                                        >
                                            Apply link unavailable
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => saveJob(job)}
                                        disabled={isJobSaved(job)}
                                    >
                                        {isJobSaved(job) ? "★ Saved" : "☆ Save Job"}
                                    </button>

                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => trackJob(job)}
                                        disabled={isJobTracked(job)}
                                    >
                                        {isJobTracked(job) ? "✓ Tracked" : "Track Job"}
                                    </button>

                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => markJobApplied(job)}
                                    >
                                        {isJobTracked(job) ? "Mark as Applied" : "Applied"}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {!jobSearchLoading && jobSearchResults.length > 0 && (
                    <div className="job-pagination">
                        <button
                            type="button"
                            className="secondary-button"
                            disabled={!hasPreviousPage || jobSearchLoading}
                            onClick={() => searchJobs(jobSearchPage - 1)}
                        >
                            ← Previous
                        </button>

                        <span>Page {jobSearchPage}</span>

                        <button
                            type="button"
                            className="secondary-button"
                            disabled={!hasNextPage || jobSearchLoading}
                            onClick={() => searchJobs(jobSearchPage + 1)}
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>
        );
    };

    /* =======================================================
       HISTORY
    ======================================================= */

    const renderHistoryPage = () => {
        return (
            <div className="page-content">
                <div className="page-heading">
                    <span className="eyebrow">
                        CAREER HISTORY
                    </span>

                    <h1>
                        History
                    </h1>

                    <p>
                        Your current session results are
                        available in Resume Analyzer,
                        Job Match, and AI Interview Coach.
                    </p>
                </div>

                <div className="panel">
                    <div className="empty-panel">
                        <div className="empty-icon">
                            ◷
                        </div>

                        <h2>
                            History database
                        </h2>

                        <p>
                            Persistent history storage will
                            be connected in the next backend
                            development stage.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    /* =======================================================
       CURRENT PAGE
    ======================================================= */

    const renderCurrentPage = () => {
        if (activePage === "dashboard") {
            return renderDashboard();
        }

        if (activePage === "resume") {
            return renderResumePage();
        }

        if (activePage === "job-match") {
            return renderJobMatchPage();
        }

        if (activePage === "interview") {
            return renderInterviewPage();
        }

        if (activePage === "job-search") {
            return renderJobSearchPage();
        }

        if (activePage === "applications") {
            return renderApplicationTrackerPage();
        }

        if (activePage === "saved-jobs") {
            return renderSavedJobsPage();
        }

        if (activePage === "history") {
            return renderHistoryPage();
        }

        return renderDashboard();
    };

    /* =======================================================
       PAGE TITLE
    ======================================================= */

    const currentPage =
        navigationItems.find(
            (item) => item.id === activePage
        );

    /* =======================================================
       SIDEBAR
    ======================================================= */

    const renderSidebar = () => {
        return (
            <aside
                className={`sidebar ${sidebarOpen ? "open" : "closed"
                    }`}
            >
                <div className="brand">
                    <div className="brand-symbol">
                        ✦
                    </div>

                    {sidebarOpen && (
                        <div>
                            <strong>
                                CareerPilot AI
                            </strong>

                            <span>
                                Career Assistant
                            </span>
                        </div>
                    )}
                </div>

                {sidebarOpen && (
                    <div className="sidebar-section-title">
                        WORKSPACE
                    </div>
                )}

                <nav className="sidebar-nav">
                    {navigationItems.map(
                        (item) => (
                            <button
                                type="button"
                                key={item.id}
                                className={`nav-button ${activePage === item.id
                                    ? "active"
                                    : ""
                                    }`}
                                onClick={() =>
                                    navigateTo(item.id)
                                }
                            >
                                <span className="nav-icon">
                                    {item.icon}
                                </span>

                                {sidebarOpen && (
                                    <span>
                                        {item.label}
                                    </span>
                                )}
                            </button>
                        )
                    )}
                </nav>

                {sidebarOpen && (
                    <div className="sidebar-bottom">
                        <strong>
                            ✦ Unlock your potential
                        </strong>

                        <p>
                            Use AI tools to prepare for
                            your next opportunity.
                        </p>

                        <div className="workspace-user">
                            <div className="user-avatar">
                                M
                            </div>

                            <div>
                                <strong>
                                    Career Explorer
                                </strong>

                                <span>
                                    Free workspace
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        );
    };

    /* =======================================================
       TOPBAR
    ======================================================= */

    const renderTopbar = () => {
        return (
            <header className="topbar">
                <button
                    type="button"
                    className="menu-button"
                    onClick={() =>
                        setSidebarOpen(
                            (previous) => !previous
                        )
                    }
                    aria-label="Toggle sidebar"
                >
                    ☰
                </button>

                <div className="breadcrumb">
                    Workspace /{" "}
                    <strong>
                        {currentPage?.label ||
                            "Dashboard"}
                    </strong>
                </div>

                <div className="topbar-actions">
                    <button
                        type="button"
                        className="topbar-icon"
                        onClick={() =>
                            showMessage(
                                "Search will be connected in the next stage."
                            )
                        }
                    >
                        ⌕
                    </button>

                    <button
                        type="button"
                        className="topbar-icon"
                        onClick={() =>
                            showMessage(
                                "Notifications will be connected in the next stage."
                            )
                        }
                    >
                        ♧
                    </button>

                    <div className="topbar-avatar">
                        M
                    </div>
                </div>
            </header>
        );
    };

    /* =======================================================
       FINAL APP
    ======================================================= */

    return (
        <div className="app-shell">
            {renderSidebar()}

            <main className="main-content">
                {renderTopbar()}

                <section className="content-area">
                    {message && (
                        <div className="success-message">
                            {message}
                        </div>
                    )}

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    {renderCurrentPage()}
                </section>
            </main>
        </div>
    );
}

export default App;