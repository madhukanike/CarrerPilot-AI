import { useEffect, useRef, useState } from "react";
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

function normalizeInterviewReport(report, evaluations, totalQuestions) {
  const source =
    report && typeof report === "object" && !Array.isArray(report)
      ? report
      : {};

  const items = Array.isArray(evaluations) ? evaluations : [];

  const scores = items
    .map((item) =>
      Number(
        item?.score ??
        item?.evaluation?.score ??
        item?.evaluation?.rating ??
        item?.evaluation?.total_score
      )
    )
    .filter((value) => Number.isFinite(value));

  const averageScore =
    scores.length > 0
      ? Math.round(
        scores.reduce((sum, value) => sum + value, 0) /
        scores.length
      )
      : null;

  const improvementItems = items
    .flatMap((item) => {
      const evaluation = item?.evaluation || {};
      return [
        ...getArray(evaluation.improvements),
        ...getArray(evaluation.areas_for_improvement),
        ...getArray(evaluation.areas_to_improve),
      ];
    })
    .map((item) => safeText(item).trim())
    .filter(Boolean)
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.toLowerCase() === item.toLowerCase()
        ) === index
    );

  const strengthItems = items
    .flatMap((item) =>
      getArray(item?.evaluation?.strengths)
    )
    .map((item) => safeText(item).trim())
    .filter(Boolean)
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.toLowerCase() === item.toLowerCase()
        ) === index
    );

  const feedbackItems = items
    .map((item) =>
      safeText(
        item?.evaluation?.feedback ||
        item?.evaluation?.overall_feedback ||
        item?.evaluation?.comments
      ).trim()
    )
    .filter(Boolean);

  const answeredCount = items.filter(
    (item) => String(item?.answer || "").trim()
  ).length;

  const summaryFallback =
    `You completed ${answeredCount} of ${totalQuestions || answeredCount
    } interview questions. ` +
    (averageScore !== null
      ? `Your average answer score was ${averageScore}/100. `
      : "") +
    (feedbackItems.length > 0
      ? feedbackItems.slice(0, 2).join(" ")
      : "Review the answer-level feedback below to understand your performance.");

  const improvementsFallback =
    improvementItems.length > 0
      ? improvementItems.slice(0, 6)
      : [
        "Continue giving specific, structured answers.",
        "Support technical answers with concrete examples from your projects.",
        "Explain your reasoning and trade-offs clearly.",
      ];

  const recommendationsFallback =
    improvementItems.length > 0
      ? improvementItems
        .slice(0, 4)
        .map((item) => `Practice and improve: ${item}`)
      : [
        "Use the STAR structure for experience-based questions.",
        "Include measurable project results when possible.",
        "Practice explaining technical concepts in a concise, structured way.",
      ];

  return {
    ...source,
    summary:
      source.summary ||
      source.overall_feedback ||
      summaryFallback,
    strengths:
      source.strengths ||
      (strengthItems.length > 0
        ? strengthItems.slice(0, 6)
        : "Your strongest points are reflected in the answer-level feedback."),
    improvements:
      source.improvements ||
      source.areas_for_improvement ||
      source.areas_to_improve ||
      improvementsFallback,
    recommendations:
      source.recommendations ||
      recommendationsFallback,
  };
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

function formatDate(dateString) {
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
     STAGE 10 - AUTHENTICATION
  ======================================================= */

  const AUTH_TOKEN_KEY = "careerpilot_auth_token";
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const authHydratingRef = useRef(false);
  const authSyncTimerRef = useRef(null);

  const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);

  const authFetch = async (path, options = {}) => {
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...options, headers });
  };

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
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeUploadedAt, setResumeUploadedAt] = useState("");

  /* =======================================================
     STAGE 11 - PROFILE
  ======================================================= */

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  /* =======================================================
     JOB MATCH
  ======================================================= */

  const [targetRole, setTargetRole] = useState("AI Engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [jobMatch, setJobMatch] = useState(null);

  /* =======================================================
     STAGE 15 - AI CAREER RECOMMENDATIONS
  ======================================================= */

  const [careerRecommendations, setCareerRecommendations] = useState(null);
  const [careerRecommendationsLoading, setCareerRecommendationsLoading] = useState(false);

  /* =======================================================
     STAGE 16 - PERSONALIZED LEARNING ROADMAP
  ======================================================= */

  const [learningRoadmap, setLearningRoadmap] = useState(null);
  const [learningRoadmapLoading, setLearningRoadmapLoading] = useState(false);

  /* =======================================================
     STAGE 17 - AI ATS RESUME BUILDER
  ======================================================= */

  const [resumeBuilderTargetRole, setResumeBuilderTargetRole] = useState("");
  const [resumeBuilderJobDescription, setResumeBuilderJobDescription] = useState("");
  const [resumeBuilderResult, setResumeBuilderResult] = useState(null);
  const [resumeBuilderLoading, setResumeBuilderLoading] = useState(false);
  const [resumeBuilderPdfLoading, setResumeBuilderPdfLoading] = useState(false);

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
     FACE-TO-FACE INTERVIEW - CAMERA + MICROPHONE
  ======================================================= */

  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const speechRecognitionRef = useRef(null);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  /* =======================================================
     JOB SEARCH
  ======================================================= */

  const [jobSearchKeyword, setJobSearchKeyword] = useState("");
  const [jobSearchLocation, setJobSearchLocation] = useState("");
  const [jobSearchMaxDays, setJobSearchMaxDays] = useState(30);
  const [jobSearchResults, setJobSearchResults] = useState([]);
  const [jobSearchTotal, setJobSearchTotal] = useState(0);
  const [jobSearchPage, setJobSearchPage] = useState(1);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [jobSearchSearched, setJobSearchSearched] = useState(false);

  /* =======================================================
     APPLICATION TRACKER
  ======================================================= */

  // Stage 12: Applications are now database-backed.
  // The legacy localStorage key is kept only for one-time migration.
  const APPLICATIONS_STORAGE_KEY = "careerpilot_applications";
  const [applications, setApplications] = useState([]);

  /* =======================================================
     SAVED JOBS
  ======================================================= */

  // Stage 12: Saved Jobs are now database-backed.
  // The legacy localStorage key is kept only for one-time migration.
  const SAVED_JOBS_STORAGE_KEY = "careerpilot_saved_jobs";
  const [savedJobs, setSavedJobs] = useState([]);

  /* =======================================================
     INTERVIEW HISTORY
  ======================================================= */

  // Stage 12: Interview History is now database-backed.
  // The legacy localStorage key is kept only for one-time migration.
  const INTERVIEW_HISTORY_STORAGE_KEY = "careerpilot_interview_history";
  const [interviewHistory, setInterviewHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  /* =======================================================
     STAGE 10 - DATABASE SYNC
  ======================================================= */

  const buildCareerState = () => ({
    resume_text: resumeText,
    resume_analysis: resumeAnalysis || {},
    resume_file_name: resumeFileName,
    resume_uploaded_at: resumeUploadedAt,
    target_role: targetRole,
    job_description: jobDescription,
    job_match: jobMatch || {},
    career_recommendations: careerRecommendations || {},
    learning_roadmap: learningRoadmap || {},
    applications,
    saved_jobs: savedJobs,
    interview_history: interviewHistory,
  });

  const getLegacyCareerData = () => {
    const readArray = (key) => {
      try {
        const value = localStorage.getItem(key);
        if (!value) return [];
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (storageError) {
        console.warn(`Unable to migrate ${key}:`, storageError);
        return [];
      }
    };

    return {
      applications: readArray(APPLICATIONS_STORAGE_KEY),
      saved_jobs: readArray(SAVED_JOBS_STORAGE_KEY),
      interview_history: readArray(INTERVIEW_HISTORY_STORAGE_KEY),
    };
  };

  const hasLegacyCareerData = () => {
    const legacy = getLegacyCareerData();
    return Boolean(
      legacy.applications.length ||
      legacy.saved_jobs.length ||
      legacy.interview_history.length
    );
  };

  const clearLegacyCareerData = () => {
    localStorage.removeItem(APPLICATIONS_STORAGE_KEY);
    localStorage.removeItem(SAVED_JOBS_STORAGE_KEY);
    localStorage.removeItem(INTERVIEW_HISTORY_STORAGE_KEY);
  };

  const saveCareerStateToDatabase = async () => {
    if (!authUser || authHydratingRef.current || !getAuthToken()) return;
    try {
      await authFetch("/auth/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCareerState()),
      });
    } catch (stateError) {
      console.error("Unable to sync CareerPilot state:", stateError);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initializeAuthentication = async () => {
      const token = getAuthToken();
      if (!token) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      try {
        const meResponse = await authFetch("/auth/me");
        if (!meResponse.ok) throw new Error("Session expired.");
        const meData = await meResponse.json();
        if (cancelled) return;

        setAuthUser(meData.user);
        setProfileName(meData.user?.name || "");
        setProfileEmail(meData.user?.email || "");
        authHydratingRef.current = true;
        const stateResponse = await authFetch("/auth/state");
        if (stateResponse.ok) {
          const remote = (await stateResponse.json()).state || {};
          setResumeText(remote.resume_text || "");
          setResumeAnalysis(remote.resume_analysis || null);
          setResumeFileName(remote.resume_file_name || "");
          setResumeUploadedAt(remote.resume_uploaded_at || "");
          setTargetRole(remote.target_role || "AI Engineer");
          setJobDescription(remote.job_description || "");
          setJobMatch(remote.job_match || null);
          setCareerRecommendations(remote.career_recommendations || null);
          setLearningRoadmap(remote.learning_roadmap || null);
          setApplications(Array.isArray(remote.applications) ? remote.applications : []);
          setSavedJobs(Array.isArray(remote.saved_jobs) ? remote.saved_jobs : []);
          setInterviewHistory(Array.isArray(remote.interview_history) ? remote.interview_history : []);
        }
      } catch (authInitError) {
        console.warn("Authentication session could not be restored:", authInitError);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthUser(null);
      } finally {
        if (!cancelled) {
          authHydratingRef.current = false;
          setAuthReady(true);
        }
      }
    };

    initializeAuthentication();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authUser || !authReady || authHydratingRef.current) return undefined;
    if (authSyncTimerRef.current) clearTimeout(authSyncTimerRef.current);
    authSyncTimerRef.current = setTimeout(() => { saveCareerStateToDatabase(); }, 700);
    return () => {
      if (authSyncTimerRef.current) clearTimeout(authSyncTimerRef.current);
    };
  }, [authUser, authReady, resumeText, resumeAnalysis, resumeFileName, resumeUploadedAt, targetRole, jobDescription, jobMatch, careerRecommendations, learningRoadmap, applications, savedJobs, interviewHistory]);

  const completeAuthentication = async (data) => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setAuthUser(data.user);
    setProfileName(data.user?.name || "");
    setProfileEmail(data.user?.email || "");
    setAuthError("");
    setAuthPassword("");

    const remote = data.state || {};
    const remoteHasData = Boolean(
      remote.resume_text ||
      (remote.resume_analysis && Object.keys(remote.resume_analysis).length) ||
      remote.job_description ||
      (remote.job_match && Object.keys(remote.job_match).length) ||
      (remote.career_recommendations && Object.keys(remote.career_recommendations).length) ||
      (remote.learning_roadmap && Object.keys(remote.learning_roadmap).length) ||
      (remote.applications || []).length ||
      (remote.saved_jobs || []).length ||
      (remote.interview_history || []).length
    );

    if (remoteHasData) {
      authHydratingRef.current = true;
      setResumeText(remote.resume_text || "");
      setResumeAnalysis(remote.resume_analysis || null);
      setResumeFileName(remote.resume_file_name || "");
      setResumeUploadedAt(remote.resume_uploaded_at || "");
      setTargetRole(remote.target_role || "AI Engineer");
      setJobDescription(remote.job_description || "");
      setJobMatch(remote.job_match || null);
      setCareerRecommendations(remote.career_recommendations || null);
      setLearningRoadmap(remote.learning_roadmap || null);
      setApplications(Array.isArray(remote.applications) ? remote.applications : []);
      setSavedJobs(Array.isArray(remote.saved_jobs) ? remote.saved_jobs : []);
      setInterviewHistory(Array.isArray(remote.interview_history) ? remote.interview_history : []);
      authHydratingRef.current = false;
    } else if (hasLegacyCareerData()) {
      // One-time migration from the old browser-only storage.
      // After the data is written successfully, the legacy localStorage
      // entries are deleted so SQLite becomes the source of truth.
      const legacy = getLegacyCareerData();

      authHydratingRef.current = true;

      setApplications(legacy.applications);
      setSavedJobs(legacy.saved_jobs);
      setInterviewHistory(legacy.interview_history);

      const migratedState = {
        ...buildCareerState(),
        applications: legacy.applications,
        saved_jobs: legacy.saved_jobs,
        interview_history: legacy.interview_history,
      };

      const migrationResponse = await fetch(`${API_URL}/auth/state`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.token}`,
        },
        body: JSON.stringify(migratedState),
      });

      if (!migrationResponse.ok) {
        throw new Error("Unable to migrate existing career data to your account.");
      }

      clearLegacyCareerData();
      authHydratingRef.current = false;
    } else {
      // New/empty account: start with the database state only.
      setApplications([]);
      setSavedJobs([]);
      setInterviewHistory([]);
    }

    setActivePage("dashboard");
    showMessage(`Welcome, ${data.user.name}. Your CareerPilot workspace is ready.`);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const endpoint = authMode === "signup" ? "/auth/signup" : "/auth/login";
      const payload = authMode === "signup"
        ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
        : { email: authEmail.trim(), password: authPassword };
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Authentication failed.");
      await completeAuthentication(data);
    } catch (authSubmitError) {
      console.error("Authentication error:", authSubmitError);
      setAuthError(authSubmitError.message || "Unable to authenticate.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try { await authFetch("/auth/logout", { method: "POST" }); } catch (logoutError) { console.warn("Logout request failed:", logoutError); }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(APPLICATIONS_STORAGE_KEY);
    localStorage.removeItem(SAVED_JOBS_STORAGE_KEY);
    localStorage.removeItem(INTERVIEW_HISTORY_STORAGE_KEY);
    setAuthUser(null);
    setProfileName("");
    setResumeFile(null);
    setResumeText("");
    setResumeAnalysis(null);
    setJobDescription("");
    setJobMatch(null);
    setCareerRecommendations(null);
    setLearningRoadmap(null);
    setApplications([]);
    setSavedJobs([]);
    setInterviewHistory([]);
    setSelectedHistoryItem(null);
    setActivePage("dashboard");
    setMessage("");
    setError("");
  };

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
      id: "resume-builder",
      label: "AI Resume Builder",
      icon: "▰",
    },
    {
      id: "job-match",
      label: "Job Match",
      icon: "◇",
    },
    {
      id: "career-recommendations",
      label: "Career Recommendations",
      icon: "✦",
    },
    {
      id: "learning-roadmap",
      label: "Learning Roadmap",
      icon: "▦",
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
    {
      id: "profile",
      label: "Profile",
      icon: "◎",
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
     STAGE 15 - AI CAREER RECOMMENDATIONS
  ======================================================= */

  const generateCareerRecommendations = async () => {
    clearMessages();

    if (resumeText.trim().length < 20) {
      showError(
        "Please analyze your resume first so CareerPilot AI can personalize your career recommendations."
      );
      return;
    }

    if (!targetRole.trim()) {
      showError("Please enter your target job role first.");
      return;
    }

    setCareerRecommendationsLoading(true);

    try {
      const response = await authFetch("/career/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          target_role: targetRole.trim(),
          resume_analysis: resumeAnalysis || {},
          job_match: jobMatch || {},
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to generate career recommendations."
        );
      }

      setCareerRecommendations(data.recommendations || data);
      showMessage("Personalized career recommendations generated successfully.");
    } catch (err) {
      console.error("Career recommendations error:", err);
      showError(
        err.message || "Unable to generate career recommendations."
      );
    } finally {
      setCareerRecommendationsLoading(false);
    }
  };

  const renderCareerRecommendationsPage = () => {
    const recommendations = careerRecommendations || {};
    const strengths = getArray(recommendations.current_strengths);
    const skillsToLearn = getArray(recommendations.skills_to_learn);
    const projects = getArray(recommendations.recommended_projects);
    const interviewFocus = getArray(recommendations.interview_focus_areas);
    const nextSteps = getArray(recommendations.next_steps);

    return (
      <div className="page-content">
        <div className="page-heading">
          <span className="eyebrow">AI CAREER INTELLIGENCE</span>
          <h1>Career Recommendations</h1>
          <p>
            Get personalized career guidance based on your resume, target role,
            and latest job-match information.
          </p>
        </div>

        <div className="panel">
          <div className="job-results-toolbar">
            <div>
              <span className="eyebrow">TARGET ROLE</span>
              <h2 style={{ marginTop: "6px" }}>{targetRole || "Not set"}</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={generateCareerRecommendations}
              disabled={careerRecommendationsLoading}
            >
              {careerRecommendationsLoading
                ? "Analyzing your profile..."
                : careerRecommendations
                  ? "Refresh recommendations →"
                  : "Generate recommendations →"}
            </button>
          </div>

          {!resumeText.trim() ? (
            <div className="empty-panel" style={{ marginTop: "20px" }}>
              <div className="empty-icon">✦</div>
              <h2>Analyze your resume first</h2>
              <p>Career recommendations need your resume as the primary source.</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigateTo("resume")}
              >
                Open Resume Analyzer
              </button>
            </div>
          ) : !careerRecommendations ? (
            <div className="empty-panel" style={{ marginTop: "20px" }}>
              <div className="empty-icon">✦</div>
              <h2>Ready for personalized guidance</h2>
              <p>
                CareerPilot will identify your current strengths, practical skill
                gaps, project ideas, interview focus areas, and next actions.
              </p>
            </div>
          ) : (
            <>
              <div className="analysis-section" style={{ marginTop: "20px" }}>
                <h3>Career summary</h3>
                <p>{safeText(recommendations.career_summary) || "No summary available."}</p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "20px",
                  marginTop: "20px",
                }}
              >
                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">CURRENT STRENGTHS</span>
                  <h2>What you already demonstrate</h2>
                  {strengths.length === 0 ? (
                    <p className="muted">No supported strengths were returned.</p>
                  ) : (
                    strengths.map((item, index) => (
                      <div key={index} className="analysis-section">
                        <h3>{safeText(item?.skill) || safeText(item)}</h3>
                        <p>{safeText(item?.evidence) || "Supported by your resume."}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">SKILLS TO LEARN</span>
                  <h2>Recommended next skills</h2>
                  {skillsToLearn.length === 0 ? (
                    <p className="muted">No additional skills were identified.</p>
                  ) : (
                    skillsToLearn.map((item, index) => (
                      <div key={index} className="analysis-section">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                          <h3 style={{ marginBottom: 0 }}>{safeText(item?.skill) || safeText(item)}</h3>
                          {item?.priority && <span className="job-detail-tag">{safeText(item.priority)}</span>}
                        </div>
                        <p>{safeText(item?.reason) || "Relevant to the target role."}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "20px",
                  marginTop: "20px",
                }}
              >
                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">PROJECT IDEAS</span>
                  <h2>Projects to strengthen your profile</h2>
                  {projects.length === 0 ? (
                    <p className="muted">No project recommendations were returned.</p>
                  ) : (
                    projects.map((item, index) => (
                      <div key={index} className="analysis-section">
                        <h3>{safeText(item?.project) || safeText(item)}</h3>
                        <p>{safeText(item?.reason) || "Build evidence for the target role."}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">INTERVIEW FOCUS</span>
                  <h2>Topics to prepare</h2>
                  {interviewFocus.length === 0 ? (
                    <p className="muted">No interview focus areas were returned.</p>
                  ) : (
                    <ul>
                      {interviewFocus.map((item, index) => (
                        <li key={index} style={{ marginBottom: "10px" }}>{safeText(item)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="panel" style={{ marginTop: "20px" }}>
                <span className="eyebrow">NEXT ACTIONS</span>
                <h2>What to do next</h2>
                {nextSteps.length === 0 ? (
                  <p className="muted">No next steps were returned.</p>
                ) : (
                  <ol>
                    {nextSteps.map((item, index) => (
                      <li key={index} style={{ marginBottom: "10px" }}>{safeText(item)}</li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* =======================================================
     STAGE 16 - PERSONALIZED LEARNING ROADMAP
  ======================================================= */

  const normalizeLearningRoadmap = (roadmap) => {
    if (!roadmap || typeof roadmap !== "object") return null;

    const stages = getArray(roadmap.learning_stages).map((stage, stageIndex) => ({
      ...stage,
      stage: stage.stage ?? stageIndex + 1,
      topics: getArray(stage.topics).map((topic) => ({
        ...topic,
        completed: Boolean(topic.completed),
      })),
    }));

    return {
      ...roadmap,
      learning_stages: stages,
      weekly_action_plan: getArray(roadmap.weekly_action_plan),
    };
  };

  const generateLearningRoadmap = async () => {
    clearMessages();

    if (resumeText.trim().length < 20) {
      showError("Please analyze your resume first so CareerPilot AI can build a personalized learning roadmap.");
      return;
    }

    if (!targetRole.trim()) {
      showError("Please enter your target job role first.");
      return;
    }

    setLearningRoadmapLoading(true);

    try {
      const response = await authFetch("/learning/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          target_role: targetRole.trim(),
          career_recommendations: careerRecommendations || {},
          resume_analysis: resumeAnalysis || {},
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to generate the learning roadmap.");
      }

      setLearningRoadmap(normalizeLearningRoadmap(data.roadmap || data));
      showMessage("Personalized learning roadmap generated successfully.");
    } catch (err) {
      console.error("Learning roadmap error:", err);
      showError(err.message || "Unable to generate the learning roadmap.");
    } finally {
      setLearningRoadmapLoading(false);
    }
  };

  const toggleRoadmapTopic = (stageIndex, topicIndex) => {
    setLearningRoadmap((current) => {
      if (!current) return current;

      const stages = getArray(current.learning_stages).map((stage, currentStageIndex) => {
        if (currentStageIndex !== stageIndex) return stage;

        return {
          ...stage,
          topics: getArray(stage.topics).map((topic, currentTopicIndex) => (
            currentTopicIndex === topicIndex
              ? { ...topic, completed: !Boolean(topic.completed) }
              : topic
          )),
        };
      });

      return { ...current, learning_stages: stages };
    });
  };

  const renderLearningRoadmapPage = () => {
    const roadmap = learningRoadmap || {};
    const stages = getArray(roadmap.learning_stages);
    const weeklyPlan = getArray(roadmap.weekly_action_plan);

    const allTopics = stages.flatMap((stage) => getArray(stage.topics));
    const completedTopics = allTopics.filter((topic) => topic.completed).length;
    const progress = allTopics.length
      ? Math.round((completedTopics / allTopics.length) * 100)
      : 0;

    return (
      <div className="page-content">
        <div className="page-heading">
          <span className="eyebrow">AI LEARNING INTELLIGENCE</span>
          <h1>Personalized Learning Roadmap</h1>
          <p>
            Turn your career recommendations into a practical step-by-step learning plan.
          </p>
        </div>

        <div className="panel">
          <div className="job-results-toolbar">
            <div>
              <span className="eyebrow">TARGET ROLE</span>
              <h2 style={{ marginTop: "6px" }}>{targetRole || "Not set"}</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={generateLearningRoadmap}
              disabled={learningRoadmapLoading}
            >
              {learningRoadmapLoading
                ? "Building roadmap..."
                : learningRoadmap
                  ? "Refresh roadmap →"
                  : "Generate roadmap →"}
            </button>
          </div>

          {!resumeText.trim() ? (
            <div className="empty-panel" style={{ marginTop: "20px" }}>
              <div className="empty-icon">▦</div>
              <h2>Analyze your resume first</h2>
              <p>Your resume gives CareerPilot the evidence needed to personalize the roadmap.</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigateTo("resume")}
              >
                Open Resume Analyzer
              </button>
            </div>
          ) : !learningRoadmap ? (
            <div className="empty-panel" style={{ marginTop: "20px" }}>
              <div className="empty-icon">▦</div>
              <h2>Ready to build your roadmap</h2>
              <p>
                CareerPilot will convert your current profile and career recommendations into an ordered learning plan with topics, projects, and interview preparation.
              </p>
              {!careerRecommendations && (
                <p className="muted" style={{ marginTop: "12px" }}>
                  Tip: generate Career Recommendations first for more personalized guidance.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="analysis-section" style={{ marginTop: "20px" }}>
                <h3>Roadmap summary</h3>
                <p>{safeText(roadmap.roadmap_summary) || "Your personalized learning roadmap is ready."}</p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                  marginTop: "20px",
                }}
              >
                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">PROGRESS</span>
                  <h2>{progress}% complete</h2>
                  <p>{completedTopics} of {allTopics.length} topics completed.</p>
                  <div style={{ height: "8px", borderRadius: "999px", background: "#e7e9f2", overflow: "hidden", marginTop: "12px" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "#4b5563", borderRadius: "999px", transition: "width 0.2s ease" }} />
                  </div>
                </div>

                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">MILESTONE</span>
                  <h2>Target outcome</h2>
                  <p>{safeText(roadmap.milestone) || "Build demonstrable skills for your target role."}</p>
                </div>
              </div>

              <div style={{ display: "grid", gap: "20px", marginTop: "20px" }}>
                {stages.map((stage, stageIndex) => {
                  const topics = getArray(stage.topics);
                  const stageCompleted = topics.filter((topic) => topic.completed).length;

                  return (
                    <div className="panel" style={{ margin: 0 }} key={`${stage.stage}-${stageIndex}`}>
                      <div className="job-results-toolbar">
                        <div>
                          <span className="eyebrow">STAGE {stage.stage ?? stageIndex + 1}</span>
                          <h2>{safeText(stage.title) || `Learning Stage ${stageIndex + 1}`}</h2>
                          <p>{safeText(stage.objective) || "Build practical capability for the target role."}</p>
                        </div>
                        <span className="muted">
                          {stageCompleted}/{topics.length} topics
                        </span>
                      </div>

                      {safeText(stage.estimated_time) && (
                        <p style={{ marginTop: "10px" }}><strong>Estimated time:</strong> {safeText(stage.estimated_time)}</p>
                      )}

                      <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
                        {topics.map((topic, topicIndex) => (
                          <button
                            key={topicIndex}
                            type="button"
                            onClick={() => toggleRoadmapTopic(stageIndex, topicIndex)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "28px 1fr auto",
                              gap: "12px",
                              alignItems: "start",
                              width: "100%",
                              textAlign: "left",
                              border: "1px solid #e5e7eb",
                              borderRadius: "12px",
                              background: topic.completed ? "#f4f7f5" : "#fff",
                              padding: "14px",
                              cursor: "pointer",
                            }}
                          >
                            <span style={{ fontSize: "18px" }}>{topic.completed ? "✓" : "○"}</span>
                            <span>
                              <strong style={{ display: "block", textDecoration: topic.completed ? "line-through" : "none" }}>
                                {safeText(topic.topic) || "Learning topic"}
                              </strong>
                              <span className="muted" style={{ display: "block", marginTop: "4px" }}>
                                {safeText(topic.why) || "Relevant to your target role."}
                              </span>
                            </span>
                            <span className="eyebrow">{safeText(topic.priority) || "Recommended"}</span>
                          </button>
                        ))}
                      </div>

                      <div className="analysis-section" style={{ marginTop: "18px" }}>
                        <h3>Practice project</h3>
                        <p>{safeText(stage.practice_project) || "Apply the topics in a small practical project."}</p>
                      </div>

                      <div className="analysis-section" style={{ marginTop: "14px" }}>
                        <h3>Interview focus</h3>
                        <p>{safeText(stage.interview_focus) || "Practice explaining the concepts and project clearly."}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="panel" style={{ marginTop: "20px" }}>
                <span className="eyebrow">WEEKLY ACTION PLAN</span>
                <h2>Keep moving forward</h2>
                {weeklyPlan.length === 0 ? (
                  <p className="muted">No weekly actions were returned.</p>
                ) : (
                  <ol>
                    {weeklyPlan.map((item, index) => (
                      <li key={index} style={{ marginBottom: "10px" }}>{safeText(item)}</li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* =======================================================
     STAGE 17 - AI ATS RESUME BUILDER
  ======================================================= */

  const generateATSResume = async () => {
    clearMessages();

    if (resumeText.trim().length < 20) {
      showError("Please analyze your resume first so CareerPilot AI can build your ATS-friendly resume.");
      return;
    }

    if (!resumeBuilderTargetRole.trim()) {
      showError("Please enter the target job role.");
      return;
    }

    setResumeBuilderLoading(true);

    try {
      const response = await authFetch("/resume-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          target_role: resumeBuilderTargetRole.trim(),
          job_description: resumeBuilderJobDescription.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Unable to generate the ATS-friendly resume.");
      }

      setResumeBuilderResult(data);
      showMessage("ATS-friendly resume generated successfully.");
    } catch (err) {
      console.error("ATS resume builder error:", err);
      showError(err.message || "Unable to generate the ATS-friendly resume.");
    } finally {
      setResumeBuilderLoading(false);
    }
  };

  const downloadResumeBuilderText = (content, fileName) => {
    if (!content) {
      showError("No generated resume content is available.");
      return;
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  /* =======================================================
     STAGE 17 - PDF DOWNLOAD
  ======================================================= */

  const downloadATSResumePDF = async () => {
    clearMessages();

    const latex = resumeBuilderResult?.latex;

    if (!latex) {
      showError("Please generate your ATS resume first.");
      return;
    }

    setResumeBuilderPdfLoading(true);

    try {
      const response = await authFetch("/resume-builder/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latex: latex,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Unable to generate the PDF.";

        try {
          const errorData = await response.json();
          errorMessage =
            errorData.detail ||
            errorData.message ||
            errorMessage;
        } catch {
          // Backend returned a non-JSON error.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error("The PDF generated by the backend is empty.");
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = "CareerPilot_ATS_Resume.pdf";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(downloadUrl);

      showMessage("ATS resume PDF downloaded successfully.");
    } catch (error) {
      console.error("ATS resume PDF download error:", error);
      showError(
        error.message ||
        "Unable to generate the ATS resume PDF."
      );
    } finally {
      setResumeBuilderPdfLoading(false);
    }
  };

  const renderResumeBuilderPage = () => {
    const result = resumeBuilderResult || {};
    const resume = result.resume || result.data || {};
    const skills = resume.skills || {};
    const projects = getArray(resume.projects);
    const experience = getArray(resume.experience);
    const education = getArray(resume.education);
    const certifications = getArray(resume.certifications);
    const atsKeywords = getArray(resume.ats_keywords_used);
    const jdKeywords = getArray(resume.keywords_from_job_description);
    const latex = result.latex || "";
    const keywordCoverage = Number(resume.keyword_coverage ?? result.keyword_coverage ?? 0) || 0;

    return (
      <div className="page-content">
        <div className="page-heading">
          <span className="eyebrow">AI RESUME INTELLIGENCE</span>
          <h1>AI ATS Resume Builder</h1>
          <p>Build an ATS-friendly resume from your analyzed resume using your CareerPilot template and optionally tailor it to a specific job description.</p>
        </div>

        <div className="panel">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "18px" }}>
            <div>
              <label className="form-label">Target Job Role</label>
              <input className="form-input" type="text" value={resumeBuilderTargetRole} onChange={(e) => setResumeBuilderTargetRole(e.target.value)} placeholder="Example: AI Engineer" />
            </div>
            <div>
              <label className="form-label">Source Resume</label>
              <p className="muted">{resumeFileName || "Use the resume already analyzed in Resume Analyzer."}</p>
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <label className="form-label">Job Description <span className="muted">(optional)</span></label>
            <textarea className="form-textarea" rows="8" value={resumeBuilderJobDescription} onChange={(e) => setResumeBuilderJobDescription(e.target.value)} placeholder="Paste the job description here for job-specific ATS optimization. Leave blank for a general ATS-friendly resume." />
          </div>

          <div style={{ marginTop: "18px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button type="button" className="primary-button" onClick={generateATSResume} disabled={resumeBuilderLoading}>
              {resumeBuilderLoading ? "Building ATS resume..." : resumeBuilderResult ? "Regenerate ATS Resume →" : "Generate ATS Resume →"}
            </button>
            <button type="button" className="secondary-button" onClick={() => navigateTo("resume")}>Open Resume Analyzer</button>
          </div>

          {!resumeText.trim() && (
            <div className="empty-panel" style={{ marginTop: "20px" }}>
              <div className="empty-icon">▰</div>
              <h2>Analyze your resume first</h2>
              <p>The builder uses your analyzed resume as the source and is instructed not to invent experience, skills, education, projects, certifications, or achievements.</p>
              <button type="button" className="primary-button" onClick={() => navigateTo("resume")}>Go to Resume Analyzer</button>
            </div>
          )}
        </div>

        {resumeBuilderResult && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "16px", marginTop: "20px" }}>
              <div className="panel" style={{ margin: 0 }}><span className="eyebrow">ATS KEYWORD COVERAGE</span><h2>{keywordCoverage}%</h2><p>CareerPilot heuristic based on the supplied job description. It is not a guarantee of any ATS result.</p></div>
              <div className="panel" style={{ margin: 0 }}><span className="eyebrow">TARGET ROLE</span><h2>{safeText(resume.target_role) || resumeBuilderTargetRole}</h2><p>Generated from the career evidence in your resume.</p></div>
            </div>

            <div className="panel" style={{ marginTop: "20px" }}>
              <div className="analysis-section"><h3>Professional Summary</h3><p>{safeText(resume.summary) || "No professional summary was generated."}</p></div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "20px", marginTop: "20px" }}>
                <div className="panel" style={{ margin: 0 }}>
                  <span className="eyebrow">TECHNICAL SKILLS</span><h2>Skills</h2>
                  {[["Programming Languages", skills.programming], ["AI", skills.ai], ["Machine Learning", skills.machine_learning], ["Backend Development", skills.backend], ["Databases", skills.databases], ["Cloud & DevOps", skills.cloud_devops]].map(([label, values]) => <div key={label} className="analysis-section" style={{ marginBottom: "12px" }}><h3>{label}</h3><p>{getArray(values).map(safeText).join(", ") || "Not provided"}</p></div>)}
                </div>
                <div className="panel" style={{ margin: 0 }}><span className="eyebrow">CERTIFICATIONS</span><h2>Certifications</h2>{certifications.length ? <ul>{certifications.map((x, i) => <li key={i} style={{ marginBottom: "8px" }}>{safeText(x)}</li>)}</ul> : <p className="muted">No certifications were returned.</p>}</div>
              </div>

              <div className="analysis-section" style={{ marginTop: "24px" }}><h3>Projects</h3>{projects.length ? projects.map((p, i) => <div key={i} className="panel" style={{ margin: "12px 0 0" }}><h3>{safeText(p?.title) || `Project ${i + 1}`}</h3>{getArray(p?.technologies).length > 0 && <p><strong>Technologies:</strong> {getArray(p.technologies).map(safeText).join(", ")}</p>}{safeText(p?.year) && <p><strong>Year:</strong> {safeText(p.year)}</p>}{getArray(p?.bullets).length > 0 && <ul>{getArray(p.bullets).map((b, j) => <li key={j} style={{ marginBottom: "8px" }}>{safeText(b)}</li>)}</ul>}</div>) : <p className="muted">No projects were returned.</p>}</div>

              <div className="analysis-section" style={{ marginTop: "24px" }}><h3>Experience</h3>{experience.length ? experience.map((x, i) => <div key={i} className="panel" style={{ margin: "12px 0 0" }}><h3>{safeText(x?.role) || "Experience"}</h3><p><strong>{safeText(x?.company)}</strong>{safeText(x?.period) ? ` • ${safeText(x.period)}` : ""}{safeText(x?.location) ? ` • ${safeText(x.location)}` : ""}</p>{getArray(x?.bullets).length > 0 && <ul>{getArray(x.bullets).map((b, j) => <li key={j} style={{ marginBottom: "8px" }}>{safeText(b)}</li>)}</ul>}</div>) : <p className="muted">No experience was returned.</p>}</div>

              <div className="analysis-section" style={{ marginTop: "24px" }}><h3>Education</h3>{education.length ? education.map((x, i) => <div key={i} className="panel" style={{ margin: "12px 0 0" }}><h3>{safeText(x?.degree) || "Education"}</h3><p>{safeText(x?.institution)}{safeText(x?.period) ? ` • ${safeText(x.period)}` : ""}{safeText(x?.location) ? ` • ${safeText(x.location)}` : ""}</p></div>) : <p className="muted">No education entries were returned.</p>}</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "20px", marginTop: "24px" }}>
                <div className="panel" style={{ margin: 0 }}><span className="eyebrow">JOB DESCRIPTION KEYWORDS</span><h2>Keywords detected</h2>{jdKeywords.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{jdKeywords.map((x, i) => <span key={i} className="job-detail-tag">{safeText(x)}</span>)}</div> : <p className="muted">No job description was supplied.</p>}</div>
                <div className="panel" style={{ margin: 0 }}><span className="eyebrow">KEYWORDS USED</span><h2>ATS terms included</h2>{atsKeywords.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{atsKeywords.map((x, i) => <span key={i} className="job-detail-tag">{safeText(x)}</span>)}</div> : <p className="muted">No ATS keywords were returned.</p>}</div>
              </div>

              {latex && (
                <div className="panel" style={{ marginTop: "24px" }}>
                  <div className="job-results-toolbar">
                    <div>
                      <span className="eyebrow">RESUME OUTPUT</span>
                      <h2>Download your ATS resume</h2>
                      <p className="muted">
                        Download the editable LaTeX source or compile the same
                        template into a PDF.
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          downloadResumeBuilderText(
                            latex,
                            "careerpilot_ats_resume.tex"
                          )
                        }
                      >
                        Download LaTeX →
                      </button>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={downloadATSResumePDF}
                        disabled={resumeBuilderPdfLoading}
                      >
                        {resumeBuilderPdfLoading
                          ? "Generating PDF..."
                          : "Download PDF →"}
                      </button>
                    </div>
                  </div>

                  <pre
                    style={{
                      marginTop: "18px",
                      maxHeight: "520px",
                      overflow: "auto",
                      padding: "18px",
                      borderRadius: "12px",
                      background: "#111827",
                      color: "#f9fafb",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: "12px",
                      lineHeight: 1.55,
                    }}
                  >
                    {latex}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
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

      setJobSearchResults(jobs);
      setJobSearchTotal(Number(data.total) || 0);
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
      setResumeFileName(resumeFile.name);
      setResumeUploadedAt(new Date().toISOString());

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
     FACE-TO-FACE CAMERA + MICROPHONE CONTROLS
  ======================================================= */

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraEnabled(false);
  };

  const startCamera = async () => {
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is not supported by this browser. Please use Chrome or Edge."
      );
      return;
    }

    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setCameraEnabled(true);
    } catch (err) {
      console.error("Camera access error:", err);

      if (err?.name === "NotAllowedError") {
        setCameraError(
          "Camera permission was denied. Click the camera icon in the browser address bar and allow camera access."
        );
      } else if (err?.name === "NotFoundError") {
        setCameraError("No camera was detected on this device.");
      } else {
        setCameraError(err?.message || "Unable to access the camera.");
      }

      setCameraEnabled(false);
    }
  };

  const stopMicrophone = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) { }
      speechRecognitionRef.current = null;
    }

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }

    setIsListening(false);
    setMicEnabled(false);
  };

  const startMicrophone = async () => {
    setMicError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "Microphone access is not supported by this browser. Please use Chrome or Edge."
      );
      return;
    }

    try {
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      microphoneStreamRef.current = stream;
      setMicEnabled(true);
    } catch (err) {
      console.error("Microphone access error:", err);

      if (err?.name === "NotAllowedError") {
        setMicError(
          "Microphone permission was denied. Click the microphone icon in the browser address bar and allow microphone access."
        );
      } else if (err?.name === "NotFoundError") {
        setMicError("No microphone was detected on this device.");
      } else {
        setMicError(err?.message || "Unable to access the microphone.");
      }

      setMicEnabled(false);
    }
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  const toggleMicrophone = async () => {
    if (micEnabled) {
      stopMicrophone();
    } else {
      await startMicrophone();
    }
  };

  const toggleSpeechInput = async () => {
    setMicError("");

    if (!speechSupported) {
      setMicError(
        "Speech-to-text is not supported in this browser. Use Chrome or Edge, or type your answer manually."
      );
      return;
    }

    if (isListening) {
      try {
        speechRecognitionRef.current?.stop();
      } catch (_) { }
      setIsListening(false);
      return;
    }

    if (!micEnabled) {
      await startMicrophone();
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
        setMicError("Speech-to-text is not available in this browser.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        setMicError("");
      };

      recognition.onresult = (event) => {
        let transcript = "";

        for (
          let i = event.resultIndex;
          i < event.results.length;
          i += 1
        ) {
          transcript += event.results[i][0]?.transcript || "";
        }

        if (transcript.trim()) {
          setAnswer((previous) => {
            const base = previous.trim();
            const addition = transcript.trim();
            if (!base) return addition;
            return `${base} ${addition}`.replace(/\s+/g, " ").trim();
          });
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);

        if (event.error === "not-allowed") {
          setMicError(
            "Speech recognition permission was denied. Allow microphone access in the browser."
          );
        } else if (event.error === "no-speech") {
          setMicError("No speech detected. Click Speak Answer and try again.");
        } else {
          setMicError(
            `Speech recognition stopped: ${event.error || "unknown error"}`
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Unable to start speech recognition:", err);
      setIsListening(false);
      setMicError(err?.message || "Unable to start speech recognition.");
    }
  };

  const speakCurrentQuestion = () => {
    if (!("speechSynthesis" in window)) {
      showError("Text-to-speech is not supported by this browser.");
      return;
    }

    const questionText = getQuestionText(
      interviewQuestions[currentQuestionIndex]
    );

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(questionText);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    setSpeechSupported(
      Boolean(
        window.SpeechRecognition ||
        window.webkitSpeechRecognition
      )
    );
  }, []);

  useEffect(() => {
    if (
      cameraEnabled &&
      cameraStreamRef.current &&
      videoRef.current
    ) {
      videoRef.current.srcObject = cameraStreamRef.current;

      const playPromise = videoRef.current.play?.();
      if (playPromise?.catch) {
        playPromise.catch((err) => {
          console.warn("Camera preview play was blocked:", err);
        });
      }
    }
  }, [cameraEnabled]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) { }
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
        const completedEvaluations = [
          ...evaluations,
          newEvaluation,
        ];

        showMessage(
          "Final answer evaluated. Generating your interview report..."
        );

        // Generate the report immediately with the fifth answer.
        // We pass the completed list explicitly because React state
        // updates are asynchronous and `evaluations` still contains
        // only the first four answers during this function call.
        await handleGenerateFinalReport(
          completedEvaluations
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

  const handleGenerateFinalReport = async (evaluationList = evaluations) => {
    clearMessages();

    if (evaluationList.length === 0) {
      showError(
        "Please evaluate at least one interview answer first."
      );
      return;
    }

    setReportLoading(true);

    try {
      const answers = evaluationList.map(
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

      const generatedReport = normalizeInterviewReport(
        data.report ||
        data.final_report ||
        data.result ||
        data,
        evaluationList,
        interviewQuestions.length
      );

      setFinalReport(generatedReport);
      saveInterviewToHistory(generatedReport, evaluationList);

      showMessage(
        "Final interview report generated successfully and saved to Interview History."
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
     SAVE INTERVIEW HISTORY
  ======================================================= */

  const saveInterviewToHistory = (report, evaluationList = evaluations) => {
    const overallScore =
      report?.overall_score ??
      report?.score ??
      report?.total_score ??
      null;

    const historyItem = {
      id: `interview-${Date.now()}`,
      jobRole: targetRole || "Interview",
      mode: interviewMode,
      difficulty,
      questionCount: interviewQuestions.length,
      evaluatedCount: evaluationList.length,
      atsScore: Number(jobMatch?.match_percentage) || 0,
      overallScore,
      evaluations: evaluationList,
      finalReport: report,
      completedAt: new Date().toISOString(),
    };

    setInterviewHistory((previous) => [historyItem, ...previous]);
    setSelectedHistoryItem(historyItem);
  };

  const deleteInterviewHistory = (historyId) => {
    setInterviewHistory((previous) =>
      previous.filter((item) => item.id !== historyId)
    );

    if (selectedHistoryItem?.id === historyId) {
      setSelectedHistoryItem(null);
    }

    showMessage("Interview history item deleted.");
  };

  /* =======================================================
     RESET INTERVIEW
  ======================================================= */

  const handleResetInterview = () => {
    stopCamera();
    stopMicrophone();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setInterviewStarted(false);
    setInterviewQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswer("");
    setEvaluations([]);
    setFinalReport(null);
    setCameraError("");
    setMicError("");

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
                Saved to your account
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
              Saved to your account
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
     JOB MATCH → JOB SEARCH
  ======================================================= */

  const findJobsFromMatch = () => {
    clearMessages();

    const role = targetRole.trim();

    if (!role) {
      showError(
        "Enter a target job title first, then analyze the job match."
      );
      return;
    }

    setJobSearchKeyword(role);
    setJobSearchPage(1);
    setJobSearchSearched(false);
    setJobSearchResults([]);
    setJobSearchTotal(0);
    navigateTo("job-search");

    showMessage(
      `Job Search prepared for "${role}". Add a location if needed and click Search jobs.`
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

            <div className="analysis-section">
              <h3>
                Find matching live jobs
              </h3>

              <p>
                Use your target role from this analysis to search the live
                job listings in CareerPilot AI.
              </p>

              <div className="job-details">
                <span className="job-detail-tag">
                  {targetRole || "Target role not set"}
                </span>

                {getArray(jobMatch.matching_skills)
                  .slice(0, 4)
                  .map((skill, index) => (
                    <span
                      className="job-detail-tag"
                      key={index}
                    >
                      {safeText(skill)}
                    </span>
                  ))}
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={findJobsFromMatch}
                style={{ marginTop: "16px" }}
              >
                Find live jobs for this role →
              </button>
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
              {!finalReport && (
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

                    {/* =================================================
                         FACE-TO-FACE INTERVIEW CONTROLS
                    ================================================== */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(280px, 1.05fr) minmax(260px, 0.95fr)",
                        gap: "18px",
                        marginTop: "20px",
                        marginBottom: "20px",
                      }}
                    >
                      <div
                        style={{
                          border: "1px solid #dbe3ef",
                          borderRadius: "16px",
                          overflow: "hidden",
                          background: "#0f172a",
                          minHeight: "300px",
                          position: "relative",
                        }}
                      >
                        {cameraEnabled ? (
                          <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{
                              width: "100%",
                              height: "300px",
                              display: "block",
                              objectFit: "cover",
                              transform: "scaleX(-1)",
                              background: "#020617",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              height: "300px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#cbd5e1",
                              padding: "24px",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "72px",
                                height: "72px",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "#1e293b",
                                fontSize: "32px",
                                marginBottom: "12px",
                              }}
                            >
                              📷
                            </div>
                            <strong
                              style={{
                                color: "#ffffff",
                                fontSize: "16px",
                              }}
                            >
                              Camera is off
                            </strong>
                            <span
                              style={{
                                fontSize: "13px",
                                marginTop: "6px",
                              }}
                            >
                              Turn on your camera for the face-to-face interview.
                            </span>
                          </div>
                        )}

                        <div
                          style={{
                            position: "absolute",
                            left: "12px",
                            bottom: "12px",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: "rgba(15, 23, 42, 0.82)",
                            color: "#ffffff",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {cameraEnabled ? "● CAMERA LIVE" : "○ CAMERA OFF"}
                        </div>
                      </div>

                      <div
                        style={{
                          border: "1px solid #dbe3ef",
                          borderRadius: "16px",
                          padding: "20px",
                          background:
                            "linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: "300px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              marginBottom: "12px",
                            }}
                          >
                            <div
                              style={{
                                width: "42px",
                                height: "42px",
                                borderRadius: "50%",
                                background: "#172554",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "20px",
                              }}
                            >
                              AI
                            </div>

                            <div>
                              <strong
                                style={{
                                  display: "block",
                                  color: "#0f172a",
                                }}
                              >
                                AI Interviewer
                              </strong>
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#64748b",
                                }}
                              >
                                Face-to-face interview mode
                              </span>
                            </div>
                          </div>

                          <p
                            style={{
                              margin: "0 0 14px",
                              color: "#334155",
                              lineHeight: 1.55,
                              fontSize: "14px",
                            }}
                          >
                            Speak naturally. Your answer will be converted to
                            text and sent to the AI evaluator.
                          </p>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "10px 12px",
                              borderRadius: "10px",
                              background: "#ffffff",
                              border: "1px solid #dbe3ef",
                              color: isListening ? "#b91c1c" : "#475569",
                              fontSize: "13px",
                              fontWeight: 700,
                            }}
                          >
                            <span>{isListening ? "●" : "○"}</span>
                            {isListening
                              ? "Listening to your answer..."
                              : micEnabled
                                ? "Microphone ready"
                                : "Microphone off"}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(2, minmax(0, 1fr))",
                            gap: "10px",
                            marginTop: "18px",
                          }}
                        >
                          <button
                            type="button"
                            className={
                              cameraEnabled
                                ? "primary-button"
                                : "secondary-button"
                            }
                            onClick={toggleCamera}
                          >
                            {cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
                          </button>

                          <button
                            type="button"
                            className={
                              micEnabled
                                ? "primary-button"
                                : "secondary-button"
                            }
                            onClick={toggleMicrophone}
                          >
                            {micEnabled ? "Turn Mic Off" : "Turn Mic On"}
                          </button>

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={toggleSpeechInput}
                          >
                            {isListening ? "Stop Speaking" : "🎙 Speak Answer"}
                          </button>

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={speakCurrentQuestion}
                          >
                            🔊 Read Question
                          </button>
                        </div>

                        {cameraError && (
                          <p
                            style={{
                              color: "#b91c1c",
                              fontSize: "12px",
                              margin: "10px 0 0",
                              lineHeight: 1.4,
                            }}
                          >
                            {cameraError}
                          </p>
                        )}

                        {micError && (
                          <p
                            style={{
                              color: "#b91c1c",
                              fontSize: "12px",
                              margin: "10px 0 0",
                              lineHeight: 1.4,
                            }}
                          >
                            {micError}
                          </p>
                        )}
                      </div>
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

                </>
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
    const toNumber = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const match = String(value).match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };

    const resumeScore = toNumber(
      resumeAnalysis?.ats_score ??
      resumeAnalysis?.atsScore ??
      resumeAnalysis?.resume_score ??
      resumeAnalysis?.resumeScore ??
      resumeAnalysis?.score
    );
    const matchScore = toNumber(jobMatch?.match_percentage);

    const interviewScores = interviewHistory
      .map((item) => toNumber(item.overallScore))
      .filter((score) => score !== null);

    const averageInterviewScore = interviewScores.length
      ? Math.round(
        interviewScores.reduce((total, score) => total + score, 0) /
        interviewScores.length
      )
      : null;

    const applicationStatusCounts = {
      Saved: applications.filter((item) => item.status === "Saved").length,
      Applied: applications.filter((item) => item.status === "Applied").length,
      Assessment: applications.filter((item) => item.status === "Assessment").length,
      Interview: applications.filter((item) => item.status === "Interview").length,
      Selected: applications.filter((item) => item.status === "Selected").length,
      Rejected: applications.filter((item) => item.status === "Rejected").length,
    };

    const activeApplications =
      applicationStatusCounts.Applied +
      applicationStatusCounts.Assessment +
      applicationStatusCounts.Interview;

    const applicationProgress = applications.length
      ? Math.round(
        ((activeApplications + applicationStatusCounts.Selected) /
          applications.length) *
        100
      )
      : 0;

    const checklist = [
      { label: "Resume analyzed", complete: Boolean(resumeAnalysis), page: "resume" },
      { label: "Job match analyzed", complete: Boolean(jobMatch), page: "job-match" },
      { label: "Jobs saved", complete: savedJobs.length > 0, page: "saved-jobs" },
      { label: "Application tracked", complete: applications.length > 0, page: "applications" },
      { label: "Interview completed", complete: interviewHistory.length > 0, page: "interview" },
    ];

    const readiness = Math.round(
      (checklist.filter((item) => item.complete).length / checklist.length) * 100
    );

    const skillsToImprove = [
      ...getArray(resumeAnalysis?.missing_skills),
      ...getArray(resumeAnalysis?.missing_keywords),
    ]
      .map((item) => safeText(item).trim())
      .filter(Boolean)
      .filter(
        (skill, index, array) =>
          array.findIndex(
            (candidate) => candidate.toLowerCase() === skill.toLowerCase()
          ) === index
      )
      .slice(0, 5);

    const displayName = profileName || authUser?.name || "Career Explorer";
    const firstName = displayName.split(" ")[0] || "there";
    const currentHour = new Date().getHours();
    const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
    const greetingIcon = currentHour < 12 ? "☀️" : currentHour < 17 ? "👋" : "🌙";
    const dashboardJobs = (jobSearchResults?.length ? jobSearchResults : savedJobs).slice(0, 3);
    const initials = displayName.charAt(0).toUpperCase();

    const scoreLabel = (value, suffix = "") =>
      value === null || value === undefined ? "—" : `${value}${suffix}`;

    const scoreCard = (icon, label, value, suffix, tone, helper, action) => (
      <button
        type="button"
        className={`dash-kpi dash-kpi-${tone}`}
        onClick={action}
      >
        <div className="dash-kpi-top">
          <span className="dash-kpi-icon">{icon}</span>
          <span className="dash-kpi-arrow">↗</span>
        </div>
        <span className="dash-kpi-label">{label}</span>
        <strong>{scoreLabel(value, suffix)}</strong>
        <small>{helper}</small>
      </button>
    );

    return (
      <div className="dashboard-v2">
        <section className="dash-hero">
          <div className="dash-hero-copy">
            <span className="dash-ai-badge">✦ AI CAREER WORKSPACE</span>
            <h1>{greeting}, {firstName} <span>{greetingIcon}</span></h1>
            <p>Your AI career workspace is ready. Analyze, improve, prepare and get hired faster.</p>
            <div className="dash-hero-actions">
              <button type="button" className="dash-primary-action" onClick={() => navigateTo("resume")}>Analyze Resume <span>→</span></button>
              <button type="button" className="dash-secondary-action" onClick={() => navigateTo("job-search")}>Find Jobs <span>→</span></button>
            </div>
          </div>
          <div className="dash-hero-orbit" aria-hidden="true">
            <div className="orbit-glow" />
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core">✦</div>
            <span className="orbit-chip chip-one">AI</span>
            <span className="orbit-chip chip-two">CV</span>
            <span className="orbit-chip chip-three">Jobs</span>
          </div>
        </section>

        <section className="dash-kpi-grid">
          {scoreCard("▤", "ATS SCORE", resumeScore, "/100", "purple", resumeScore === null ? "Upload a resume to analyze" : "Resume health", () => navigateTo("resume"))}
          {scoreCard("◇", "JOB MATCH", matchScore, "%", "blue", matchScore === null ? "Run a job match analysis" : "Latest match", () => navigateTo("job-match"))}
          {scoreCard("◉", "INTERVIEW SCORE", averageInterviewScore, "/100", "orange", averageInterviewScore === null ? "Complete an AI interview" : "Average performance", () => navigateTo("interview"))}
          {scoreCard("▣", "APPLICATIONS", applications.length, "", "violet", `${activeApplications} active`, () => navigateTo("applications"))}
        </section>

        <section className="dash-quick-grid">
          {[
            ["▤", "Analyze Resume", "Get ATS insights", "resume", "purple"],
            ["✦", "Build Resume", "Create ATS-ready resume", "resume-builder", "blue"],
            ["⌕", "Find Jobs", "Explore opportunities", "job-search", "green"],
            ["◉", "Practice Interview", "Improve with AI", "interview", "orange"],
          ].map(([icon, title, text, page, tone]) => (
            <button key={page} type="button" className={`dash-quick-card quick-${tone}`} onClick={() => navigateTo(page)}>
              <span className="dash-quick-icon">{icon}</span>
              <span><strong>{title}</strong><small>{text}</small></span>
              <b>→</b>
            </button>
          ))}
        </section>

        <section className="dash-main-grid">
          <div className="dash-panel readiness-panel">
            <div className="dash-panel-heading">
              <div><span className="dash-eyebrow">CAREER READINESS</span><h2>Your progress</h2></div>
              <span className="dash-readiness-number">{readiness}%</span>
            </div>
            <div className="dash-progress-large"><span style={{ width: `${readiness}%` }} /></div>
            <p className="dash-muted">Complete the key steps below to strengthen your career profile.</p>
            <div className="dash-checklist">
              {checklist.map((item) => (
                <button type="button" key={item.label} onClick={() => navigateTo(item.page)} className="dash-check-item">
                  <span className={item.complete ? "check-done" : "check-open"}>{item.complete ? "✓" : "○"}</span>
                  <span>{item.label}</span>
                  <b>{item.complete ? "Done" : "Open"}</b>
                </button>
              ))}
            </div>
          </div>

          <div className="dash-panel pipeline-panel">
            <div className="dash-panel-heading">
              <div><span className="dash-eyebrow">APPLICATION PIPELINE</span><h2>Job search activity</h2></div>
              <button type="button" className="dash-link" onClick={() => navigateTo("applications")}>View tracker →</button>
            </div>
            <div className="dash-pipeline-list">
              {[
                ["Saved", applicationStatusCounts.Saved, "purple"],
                ["Applied", applicationStatusCounts.Applied, "blue"],
                ["Assessment", applicationStatusCounts.Assessment, "green"],
                ["Interview", applicationStatusCounts.Interview, "orange"],
                ["Selected", applicationStatusCounts.Selected, "violet"],
              ].map(([label, count, tone]) => {
                const width = applications.length ? Math.max(4, Math.round((count / applications.length) * 100)) : 4;
                return <div className="dash-pipeline-row" key={label}><span>{label}</span><div><i className={`pipeline-${tone}`} style={{ width: `${width}%` }} /></div><b>{count}</b></div>;
              })}
            </div>
            <div className="dash-pipeline-foot"><span>Active pipeline</span><strong>{applicationProgress}%</strong></div>
          </div>
        </section>

        <section className="dash-bottom-grid">
          <div className="dash-panel jobs-panel">
            <div className="dash-panel-heading">
              <div><span className="dash-eyebrow">OPPORTUNITIES</span><h2>{jobSearchResults?.length ? "Job opportunities" : "Saved jobs"}</h2></div>
              <button type="button" className="dash-link" onClick={() => navigateTo("job-search")}>View all →</button>
            </div>
            {dashboardJobs.length === 0 ? (
              <div className="dash-empty"><span>⌕</span><strong>Discover your next opportunity</strong><p>Search jobs and save the roles that interest you.</p><button type="button" className="dash-outline-button" onClick={() => navigateTo("job-search")}>Search jobs</button></div>
            ) : (
              <div className="dash-job-list">
                {dashboardJobs.map((job, index) => (
                  <div className="dash-job-row" key={job.id || `${job.title}-${index}`}>
                    <div className="dash-company-avatar">{safeText(job.company || "C").charAt(0).toUpperCase()}</div>
                    <div className="dash-job-info"><strong>{job.title || "Untitled position"}</strong><span>{job.company || "Company"} · {job.location || "Location"}</span><div>{safeText(job.contract_type || job.contract_time || "Opportunity")}</div></div>
                    <button type="button" className="dash-small-button" onClick={() => navigateTo("job-search")}>View job</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dash-panel activity-panel">
            <div className="dash-panel-heading"><div><span className="dash-eyebrow">RECENT ACTIVITY</span><h2>Your latest progress</h2></div><button type="button" className="dash-link" onClick={() => navigateTo("history")}>History →</button></div>
            <div className="dash-activity-list">
              <button type="button" onClick={() => navigateTo("resume")} className="dash-activity-item"><span className="activity-icon purple">▤</span><span><strong>{resumeAnalysis ? "Resume analyzed" : "Analyze your resume"}</strong><small>{resumeAnalysis ? "ATS analysis is available" : "Start with your resume"}</small></span><b>→</b></button>
              <button type="button" onClick={() => navigateTo("job-match")} className="dash-activity-item"><span className="activity-icon blue">◇</span><span><strong>{jobMatch ? "Job match completed" : "Run a job match"}</strong><small>{jobMatch ? `${matchScore ?? "—"}% latest match` : "Compare your profile to a role"}</small></span><b>→</b></button>
              <button type="button" onClick={() => navigateTo("interview")} className="dash-activity-item"><span className="activity-icon orange">◉</span><span><strong>{interviewHistory.length ? "Interview practice completed" : "Practice an interview"}</strong><small>{interviewHistory.length ? `${interviewHistory.length} interview${interviewHistory.length === 1 ? "" : "s"} completed` : "Practice with the AI interviewer"}</small></span><b>→</b></button>
            </div>
          </div>
        </section>

        <section className="dash-insight-strip">
          <div className="dash-insight-icon">✦</div>
          <div><span className="dash-eyebrow">AI CAREER INSIGHT</span><h3>{skillsToImprove.length ? `Focus next on ${skillsToImprove.slice(0, 2).join(" and ")}.` : "Keep building your career profile step by step."}</h3><p>{skillsToImprove.length ? "These areas were identified from your resume analysis and can improve your job readiness." : "Analyze your resume, match it to jobs, and practice interviews to build a stronger profile."}</p></div>
          <button type="button" onClick={() => navigateTo(skillsToImprove.length ? "resume" : "career-recommendations")}>Explore insights →</button>
        </section>
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

            {jobSearchKeyword && jobMatch && (
              <p className="muted" style={{ marginTop: "8px" }}>
                Suggested from Job Match: <strong>{jobSearchKeyword}</strong>
              </p>
            )}
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
          <span className="eyebrow">CAREER HISTORY</span>
          <h1>Interview History</h1>
          <p>
            Review completed AI interviews, scores, feedback, and recommendations.
            Your history is stored securely in your CareerPilot account.
          </p>
        </div>

        {interviewHistory.length === 0 ? (
          <div className="panel job-empty-panel">
            <div className="empty-icon">◷</div>
            <h2>No interview history yet</h2>
            <p>
              Complete an AI interview and generate the final report.
              The report will automatically appear here.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => navigateTo("interview")}
            >
              Start an interview →
            </button>
          </div>
        ) : (
          <>
            <div className="job-results-toolbar">
              <div>
                <strong>{interviewHistory.length}</strong>{" "}
                <span>completed interviews</span>
              </div>
              <span className="job-page-label">Saved in this browser</span>
            </div>

            <div className="job-results-list">
              {interviewHistory.map((item) => (
                <article className="job-card" key={item.id}>
                  <div className="job-card-main">
                    <span className="job-source">AI INTERVIEW</span>
                    <h2 className="job-card-title">{item.jobRole}</h2>

                    <div className="job-meta">
                      <span>◉ {String(item.mode || "full").toUpperCase()}</span>
                      <span>⌖ {String(item.difficulty || "fresher").toUpperCase()}</span>
                    </div>

                    <div className="job-details">
                      <span className="job-detail-tag">
                        Overall: {safeText(item.overallScore) || "N/A"}
                      </span>
                      <span className="job-detail-tag">
                        ATS: {item.atsScore}%
                      </span>
                      <span className="job-detail-tag">
                        {item.evaluatedCount}/{item.questionCount} answers
                      </span>
                    </div>

                    <div className="job-posted">
                      Completed {formatJobDate(item.completedAt)}
                    </div>
                  </div>

                  <div className="job-card-action">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setSelectedHistoryItem(item)}
                    >
                      View Report
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => deleteInterviewHistory(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {selectedHistoryItem && (
          <div className="panel final-report" style={{ marginTop: "24px" }}>
            <div className="interview-header">
              <div>
                <span className="eyebrow">SAVED FINAL REPORT</span>
                <h2>{selectedHistoryItem.jobRole}</h2>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedHistoryItem(null)}
              >
                Close
              </button>
            </div>

            <div className="interview-meta">
              <span>{String(selectedHistoryItem.mode || "full").toUpperCase()}</span>
              <span>{String(selectedHistoryItem.difficulty || "fresher").toUpperCase()}</span>
              <span>ATS {selectedHistoryItem.atsScore}%</span>
            </div>

            <div className="score-box">
              <strong>{safeText(selectedHistoryItem.overallScore) || "N/A"}</strong>
              <span>Overall interview score</span>
            </div>

            <div className="analysis-section">
              <h3>Summary</h3>
              <p>
                {safeText(
                  selectedHistoryItem.finalReport?.summary ||
                  selectedHistoryItem.finalReport?.overall_feedback
                ) || "No summary available."}
              </p>
            </div>

            <div className="analysis-section">
              <h3>Strengths</h3>
              <p>
                {safeText(selectedHistoryItem.finalReport?.strengths) ||
                  "No strengths available."}
              </p>
            </div>

            <div className="analysis-section">
              <h3>Areas for improvement</h3>
              <p>
                {safeText(
                  selectedHistoryItem.finalReport?.improvements ||
                  selectedHistoryItem.finalReport?.areas_for_improvement ||
                  selectedHistoryItem.finalReport?.areas_to_improve
                ) || "No improvement areas available."}
              </p>
            </div>

            <div className="analysis-section">
              <h3>Recommendations</h3>
              <p>
                {safeText(selectedHistoryItem.finalReport?.recommendations) ||
                  "No recommendations available."}
              </p>
            </div>

            <div className="analysis-section">
              <h3>Question-by-question results</h3>
              {getArray(selectedHistoryItem.evaluations).map((item, index) => (
                <div className="evaluation-card" key={`${selectedHistoryItem.id}-${index}`}>
                  <div className="evaluation-heading">
                    <span>Question {item.questionNumber || index + 1}</span>
                    <strong>
                      Score: {safeText(item.score ?? item.evaluation?.score) || "N/A"}
                    </strong>
                  </div>
                  <h3>{safeText(item.question)}</h3>
                  <p><strong>Your answer:</strong> {safeText(item.answer)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* =======================================================
     STAGE 10 - AUTH SCREEN
  ======================================================= */

  const renderAuthScreen = () => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", background: "#f4f6fb" }}>
      <div style={{ width: "100%", maxWidth: "460px", background: "#fff", borderRadius: "24px", padding: "36px", boxShadow: "0 20px 60px rgba(31,41,55,.12)" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: ".12em", color: "#5b5bf7" }}>CAREERPILOT AI</div>
          <h1 style={{ margin: "8px 0", fontSize: "32px", color: "#172033" }}>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p style={{ margin: 0, color: "#667085" }}>{authMode === "login" ? "Sign in to access your saved career workspace." : "Create an account to keep your CareerPilot data across sessions."}</p>
        </div>
        {authError && <div className="error-message" style={{ marginBottom: "18px" }}>{authError}</div>}
        <form onSubmit={handleAuthSubmit}>
          {authMode === "signup" && (
            <label style={{ display: "block", marginBottom: "16px", color: "#172033", fontWeight: 700 }}>Full name
              <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" minLength={2} required style={{ width: "100%", marginTop: "8px", padding: "13px 14px", border: "1px solid #d9deea", borderRadius: "12px", boxSizing: "border-box" }} />
            </label>
          )}
          <label style={{ display: "block", marginBottom: "16px", color: "#172033", fontWeight: 700 }}>Email
            <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required style={{ width: "100%", marginTop: "8px", padding: "13px 14px", border: "1px solid #d9deea", borderRadius: "12px", boxSizing: "border-box" }} />
          </label>
          <label style={{ display: "block", marginBottom: "20px", color: "#172033", fontWeight: 700 }}>Password
            <input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" minLength={authMode === "signup" ? 8 : 1} required style={{ width: "100%", marginTop: "8px", padding: "13px 14px", border: "1px solid #d9deea", borderRadius: "12px", boxSizing: "border-box" }} />
          </label>
          <button type="submit" disabled={authBusy} style={{ width: "100%", padding: "14px", border: 0, borderRadius: "12px", background: "#5b5bf7", color: "white", fontWeight: 800, cursor: authBusy ? "wait" : "pointer" }}>{authBusy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button type="button" onClick={() => { setAuthMode((mode) => mode === "login" ? "signup" : "login"); setAuthError(""); }} style={{ width: "100%", marginTop: "16px", padding: "12px", border: 0, background: "transparent", color: "#5b5bf7", fontWeight: 700, cursor: "pointer" }}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      </div>
    </div>
  );

  /* =======================================================
     STAGE 11 - PROFILE + RESUME MANAGEMENT
  ======================================================= */

  const saveProfile = async () => {
    const name = profileName.trim();
    const email = profileEmail.trim().toLowerCase();

    if (name.length < 2) {
      showError("Name must contain at least 2 characters.");
      return;
    }

    if (!email || !email.includes("@") || !email.includes(".")) {
      showError("Please enter a valid email address.");
      return;
    }

    setProfileBusy(true);
    clearMessages();

    try {
      const response = await authFetch("/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to update profile.");
      }

      setAuthUser(data.user);
      setProfileName(data.user?.name || name);
      setProfileEmail(data.user?.email || email);
      showMessage("Profile updated successfully.");
    } catch (profileError) {
      console.error("Profile update error:", profileError);
      showError(profileError.message || "Unable to update profile.");
    } finally {
      setProfileBusy(false);
    }
  };

  const clearResumeData = async () => {
    const confirmed = window.confirm(
      "Remove your stored resume text and resume analysis from CareerPilot?"
    );

    if (!confirmed) return;

    setResumeFile(null);
    setResumeText("");
    setResumeAnalysis(null);
    setResumeFileName("");
    setResumeUploadedAt("");
    clearMessages();
    showMessage("Resume data cleared from your CareerPilot workspace.");
  };

  const renderProfilePage = () => {
    const displayName = authUser?.name || "Career Explorer";
    const displayEmail = authUser?.email || "";
    const joinedDate = authUser?.created_at
      ? formatDate(authUser.created_at)
      : "Not available";

    return (
      <div className="page-content">
        <div className="page-header">
          <div>
            <span className="eyebrow">ACCOUNT</span>
            <h1>Profile & Resume</h1>
            <p>Manage your CareerPilot account and stored resume information.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, .9fr)", gap: "20px", alignItems: "start" }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Profile information</h2>
                <p>Update the name shown throughout your CareerPilot workspace.</p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
                Full name
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Your full name"
                  style={{ padding: "13px 14px", border: "1px solid #d9deea", borderRadius: "12px", fontSize: "15px" }}
                />
              </label>

              <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
                Email
                <input
                  value={profileEmail}
                  onChange={(event) => setProfileEmail(event.target.value)}
                  placeholder="your@email.com"
                  type="email"
                  style={{ padding: "13px 14px", border: "1px solid #d9deea", borderRadius: "12px", fontSize: "15px", background: "#ffffff", color: "#172033" }}
                />
              </label>

              <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", color: "#667085", fontSize: "14px" }}>
                <span><strong style={{ color: "#172033" }}>Account created:</strong> {joinedDate}</span>
                <span><strong style={{ color: "#172033" }}>Status:</strong> Active</span>
              </div>

              <button
                type="button"
                onClick={saveProfile}
                disabled={profileBusy}
                className="primary-button"
              >
                {profileBusy ? "Saving..." : "Save profile"}
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Resume management</h2>
                <p>Your extracted resume information is stored with your account.</p>
              </div>
            </div>

            {resumeText.trim() ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ padding: "16px", border: "1px solid #e5e7ef", borderRadius: "14px", background: "#fafbff" }}>
                  <strong>{resumeFileName || "Resume"}</strong>
                  <div style={{ marginTop: "7px", color: "#667085", fontSize: "14px" }}>
                    Uploaded: {resumeUploadedAt ? formatDate(resumeUploadedAt) : "Previously uploaded"}
                  </div>
                  <div style={{ marginTop: "7px", color: "#667085", fontSize: "14px" }}>
                    Extracted text: {resumeText.length.toLocaleString()} characters
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" className="secondary-button" onClick={() => navigateTo("resume")}>
                    Open Resume Analyzer
                  </button>
                  <button
                    type="button"
                    onClick={clearResumeData}
                    style={{ padding: "11px 14px", border: "1px solid #f0b4b4", borderRadius: "10px", background: "#fff7f7", color: "#b42318", fontWeight: 700, cursor: "pointer" }}
                  >
                    Remove resume data
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <h3>No resume stored</h3>
                <p>Upload and analyze your resume to keep its extracted information in your account.</p>
                <button type="button" className="primary-button" onClick={() => navigateTo("resume")}>
                  Upload resume
                </button>
              </div>
            )}
          </section>
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

    if (activePage === "resume-builder") {
      return renderResumeBuilderPage();
    }

    if (activePage === "job-match") {
      return renderJobMatchPage();
    }

    if (activePage === "career-recommendations") {
      return renderCareerRecommendationsPage();
    }

    if (activePage === "learning-roadmap") {
      return renderLearningRoadmapPage();
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

    if (activePage === "profile") {
      return renderProfilePage();
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
            <div className="workspace-user-card">
              <div className="user-avatar">
                {(profileName || authUser?.name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="workspace-user-info">
                <strong>{profileName || authUser?.name || "Career Explorer"}</strong>
                <span>{profileEmail || authUser?.email || "Free workspace"}</span>
              </div>
              <button
                type="button"
                className="profile-edit-button"
                onClick={() => navigateTo("profile")}
                aria-label="Edit profile"
                title="Edit profile"
              >
                ✎
              </button>
            </div>
            <button type="button" className="sidebar-signout" onClick={handleLogout}>
              Sign out
            </button>
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
            {(profileName || authUser?.name || "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
    );
  };

  /* =======================================================
     FINAL APP
  ======================================================= */

  if (!authReady) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f6fb", color: "#172033", fontWeight: 700 }}>Loading your CareerPilot workspace...</div>;
  }

  if (!authUser) {
    return renderAuthScreen();
  }

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