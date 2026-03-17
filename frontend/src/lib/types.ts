// ─── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type UserRole = "student" | "admin";

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  role: UserRole;
}

export interface CurrentUser {
  id: number;
  email: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Student ─────────────────────────────────────────────────────────────────

export type SocialCategory = "GEN" | "OBC" | "SC" | "ST";

export interface StudentProfileCreate {
  full_name: string;
  phone?: string | null;
  college?: string | null;
  degree?: string | null;
  branch?: string | null;
  graduation_year?: number | null;
  cgpa?: number | null;
  skills: string[];
  district?: string | null;
  state?: string | null;
  is_rural: boolean;
  social_category?: SocialCategory | null;
  has_previous_internship: boolean;
  resume_path?: string | null;
}

export interface StudentProfileUpdate {
  full_name?: string;
  phone?: string | null;
  college?: string | null;
  degree?: string | null;
  branch?: string | null;
  graduation_year?: number | null;
  cgpa?: number | null;
  skills?: string[];
  district?: string | null;
  state?: string | null;
  is_rural?: boolean;
  social_category?: SocialCategory | null;
  has_previous_internship?: boolean;
  resume_path?: string | null;
}

export interface StudentProfile {
  id: number;
  user_id: number;
  full_name: string;
  phone: string | null;
  college: string | null;
  degree: string | null;
  branch: string | null;
  graduation_year: number | null;
  cgpa: number | null;
  skills: string[];
  district: string | null;
  state: string | null;
  is_rural: boolean;
  social_category: SocialCategory | null;
  has_previous_internship: boolean;
  resume_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeUploadResponse {
  extracted_skills: string[];
  resume_path: string;
}

// ─── Internship ──────────────────────────────────────────────────────────────

export interface Internship {
  id: number;
  title: string;
  company: string;
  sector: string;
  location: string;
  state: string;
  required_skills: string[];
  description: string | null;
  duration_months: number;
  stipend: number;
  total_seats: number;
  filled_seats: number;
  is_active: boolean;
  available_seats: number;
  capacity_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface InternshipCreateRequest {
  title: string;
  company: string;
  sector: string;
  location: string;
  state: string;
  required_skills: string[];
  description?: string | null;
  duration_months: number;
  stipend: number;
  total_seats: number;
  filled_seats: number;
}

export interface InternshipUpdateRequest {
  title?: string;
  company?: string;
  sector?: string;
  location?: string;
  state?: string;
  required_skills?: string[];
  description?: string | null;
  duration_months?: number;
  stipend?: number;
  total_seats?: number;
  filled_seats?: number;
  is_active?: boolean;
}

// ─── Recommendation ──────────────────────────────────────────────────────────

export interface RecommendationExplanation {
  matched_skills: string[];
  missing_skills: string[];
  content_score: number;
}

export interface Recommendation {
  internship_id: number;
  title: string;
  company: string;
  content_score: number;
  collaborative_score: number;
  affirmative_score: number;
  final_score: number;
  explanation: RecommendationExplanation;
}

export interface RecommendationResponse {
  student_id: number;
  recommendations: Recommendation[];
}

export interface ExplanationResult {
  matched_skills: string[];
  missing_skills: string[];
  content_score: number;
}

// ─── Application ─────────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "pending"
  | "under_review"
  | "selected"
  | "rejected";

export interface Application {
  id: number;
  student_id: number;
  internship_id: number;
  status: ApplicationStatus;
  content_score: number;
  collaborative_score: number;
  affirmative_score: number;
  final_score: number;
  score_breakdown: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  applied_at: string;
}

export interface ApplicationApplyRequest {
  internship_id: number;
}

export interface ApplicationWithInternship extends Application {
  internship_title: string;
  internship_company: string;
}

// ─── Admin Analytics ─────────────────────────────────────────────────────────

export interface AdminAnalytics {
  total_students: number;
  total_internships: number;
  total_applications: number;
  applications_by_status: Partial<Record<ApplicationStatus, number>>;
  students_by_category: Record<string, number>;
  rural_student_count: number;
  placement_rate: number;
  district_distribution: Record<string, number>;
  district_coverage_count: number;
  selected_district_coverage_count: number;
  capacity_utilization_rate: number;
  internships_near_capacity: number;
}

export interface AllocateResponse {
  students_processed: number;
  applications_created: number;
}

export interface DemoResetResponse {
  applications_cleared: number;
  applications_preserved: number;
  recommendations_cleared: number;
  message: string;
}

export interface AdminStudentApplication {
  id: number;
  student_id: number;
  student_name: string;
  student_college: string | null;
  student_branch: string | null;
  student_graduation_year: number | null;
  student_cgpa: number | null;
  student_skills: string[];
  student_district: string | null;
  student_state: string | null;
  social_category: SocialCategory | null;
  is_rural: boolean;
  has_previous_internship: boolean;
  internship_id: number;
  internship_title: string;
  company: string;
  internship_location: string;
  internship_state: string;
  internship_sector: string;
  internship_duration_months: number;
  internship_stipend: number;
  internship_required_skills: string[];
  internship_total_seats: number;
  internship_filled_seats: number;
  internship_available_seats: number;
  status: ApplicationStatus;
  content_score: number;
  collaborative_score: number;
  affirmative_score: number;
  final_score: number;
  matched_skills: string[];
  missing_skills: string[];
  applied_at: string;
}

export interface RecentAllocation {
  id: number;
  student_id: number;
  student_name: string;
  student_college: string | null;
  student_branch: string | null;
  student_graduation_year: number | null;
  student_cgpa: number | null;
  student_skills: string[];
  student_district: string | null;
  student_state: string | null;
  social_category: SocialCategory | null;
  is_rural: boolean;
  has_previous_internship: boolean;
  internship_id: number;
  internship_title: string;
  company: string;
  internship_location: string;
  internship_state: string;
  internship_sector: string;
  internship_duration_months: number;
  internship_stipend: number;
  internship_required_skills: string[];
  internship_total_seats: number;
  internship_filled_seats: number;
  internship_available_seats: number;
  status: ApplicationStatus;
  content_score: number;
  collaborative_score: number;
  affirmative_score: number;
  final_score: number;
  matched_skills: string[];
  missing_skills: string[];
  applied_at: string;
}

export interface ManualAllocationOverrideRequest {
  student_id: number;
  internship_id: number;
}
