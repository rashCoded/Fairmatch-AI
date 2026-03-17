import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getToken, clearTokens } from "./auth";
import type {
  RegisterRequest,
  RegisterResponse,
  VerifyOtpRequest,
  TokenPairResponse,
  LoginRequest,
  LoginResponse,
  CurrentUser,
  StudentProfileCreate,
  StudentProfileUpdate,
  StudentProfile,
  ResumeUploadResponse,
  Internship,
  InternshipCreateRequest,
  InternshipUpdateRequest,
  RecommendationResponse,
  ExplanationResult,
  Application,
  ApplicationApplyRequest,
  AdminAnalytics,
  AllocateResponse,
  DemoResetResponse,
  AdminStudentApplication,
  RecentAllocation,
  ApplicationStatus,
  ManualAllocationOverrideRequest,
} from "./types";

const api = axios.create({
  baseURL: "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/auth/register", data);
  return res.data;
}

export async function verifyOtp(data: VerifyOtpRequest): Promise<TokenPairResponse> {
  const res = await api.post<TokenPairResponse>("/auth/verify-otp", data);
  return res.data;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", data);
  return res.data;
}

export async function getMe(): Promise<CurrentUser> {
  const res = await api.get<CurrentUser>("/auth/me");
  return res.data;
}

// ─── Students ────────────────────────────────────────────────────────────────

export async function createProfile(data: StudentProfileCreate): Promise<StudentProfile> {
  const res = await api.post<StudentProfile>("/students/profile", data);
  return res.data;
}

export async function getProfile(): Promise<StudentProfile> {
  const res = await api.get<StudentProfile>("/students/profile");
  return res.data;
}

export async function updateProfile(data: StudentProfileUpdate): Promise<StudentProfile> {
  const res = await api.put<StudentProfile>("/students/profile", data);
  return res.data;
}

export async function uploadResume(file: File): Promise<ResumeUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await api.post<ResumeUploadResponse>("/students/resume", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

// ─── Internships ─────────────────────────────────────────────────────────────

export async function getInternships(params?: {
  skip?: number;
  limit?: number;
  sector?: string;
  state?: string;
}): Promise<Internship[]> {
  const res = await api.get<Internship[]>("/internships/", { params });
  return res.data;
}

export async function getInternship(id: number): Promise<Internship> {
  const res = await api.get<Internship>(`/internships/${id}`);
  return res.data;
}

export async function updateInternship(
  id: number,
  data: InternshipUpdateRequest
): Promise<Internship> {
  const res = await api.put<Internship>(`/internships/${id}`, data);
  return res.data;
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export async function getRecommendations(
  studentId: number,
  params?: {
    top_n?: number;
    force?: boolean;
  }
): Promise<RecommendationResponse> {
  const res = await api.get<RecommendationResponse>(`/recommend/${studentId}`, { params });
  return res.data;
}

export async function getExplanation(
  studentId: number,
  internshipId: number
): Promise<ExplanationResult> {
  const res = await api.get<ExplanationResult>(
    `/recommend/${studentId}/explain/${internshipId}`
  );
  return res.data;
}

// ─── Applications ────────────────────────────────────────────────────────────

export async function applyToInternship(data: ApplicationApplyRequest): Promise<Application> {
  const res = await api.post<Application>("/applications", data);
  return res.data;
}

export async function getMyApplications(): Promise<Application[]> {
  const res = await api.get<Application[]>("/applications/my");
  return res.data;
}

export async function updateApplicationStatus(
  applicationId: number,
  status: Exclude<ApplicationStatus, "pending">
): Promise<Application> {
  const res = await api.put<Application>(`/applications/${applicationId}/status`, { status });
  return res.data;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAnalytics(): Promise<AdminAnalytics> {
  const res = await api.get<AdminAnalytics>("/admin/analytics");
  return res.data;
}

export async function getAdminStudents(params?: {
  skip?: number;
  limit?: number;
  search?: string;
  social_category?: string;
  is_rural?: boolean;
  district?: string;
  has_previous_internship?: boolean;
}): Promise<StudentProfile[]> {
  const res = await api.get<StudentProfile[]>("/admin/students", { params });
  return res.data;
}

export async function getAdminInternships(params?: {
  skip?: number;
  limit?: number;
}): Promise<Internship[]> {
  const res = await api.get<Internship[]>("/admin/internships", { params });
  return res.data;
}

export async function createAdminInternship(
  data: InternshipCreateRequest
): Promise<Internship> {
  const res = await api.post<Internship>("/admin/internships", data);
  return res.data;
}

export async function getAdminStudentApplications(
  studentId: number
): Promise<AdminStudentApplication[]> {
  const res = await api.get<AdminStudentApplication[]>(`/admin/students/${studentId}/applications`);
  return res.data;
}

export async function getRecentAllocations(): Promise<RecentAllocation[]> {
  const res = await api.get<RecentAllocation[]>("/admin/allocations");
  return res.data;
}

export async function manualOverrideAllocation(
  data: ManualAllocationOverrideRequest
): Promise<AdminStudentApplication> {
  const res = await api.post<AdminStudentApplication>("/admin/allocations/override", data);
  return res.data;
}

export async function bulkAllocate(): Promise<AllocateResponse> {
  const res = await api.post<AllocateResponse>("/admin/allocate");
  return res.data;
}

export async function demoReset(): Promise<DemoResetResponse> {
  const res = await api.post<DemoResetResponse>("/admin/demo-reset");
  return res.data;
}

export default api;
