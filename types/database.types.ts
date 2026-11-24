export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      mentor_availability_rules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          mentor_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          mentor_id?: string
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          mentor_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "mentor_availability_rules_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_profiles: {
        Row: {
          accepting_requests: boolean
          bio: string | null
          created_at: string
          expertise_areas: string[]
          id: string
          max_sessions_per_week: number
          updated_at: string
        }
        Insert: {
          accepting_requests?: boolean
          bio?: string | null
          created_at?: string
          expertise_areas?: string[]
          id?: string
          max_sessions_per_week?: number
          updated_at?: string
        }
        Update: {
          accepting_requests?: boolean
          bio?: string | null
          created_at?: string
          expertise_areas?: string[]
          id?: string
          max_sessions_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_slots: {
        Row: {
          created_at: string
          id: string
          mentor_id: string
          starts_at: string
          status: Database["public"]["Enums"]["slot_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          mentor_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["slot_status"]
        }
        Update: {
          created_at?: string
          id?: string
          mentor_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["slot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "mentor_slots_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_requests: {
        Row: {
          created_at: string
          duration_minutes: number
          expires_at: string
          goal: string
          id: string
          meeting_url: string | null
          mentee_id: string
          mentor_id: string
          question_1: string
          question_2: string | null
          responded_at: string | null
          slot_id: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          expires_at?: string
          goal: string
          id?: string
          meeting_url?: string | null
          mentee_id?: string
          mentor_id?: string
          question_1: string
          question_2?: string | null
          responded_at?: string | null
          slot_id: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          expires_at?: string
          goal?: string
          id?: string
          meeting_url?: string | null
          mentee_id?: string
          mentor_id?: string
          question_1?: string
          question_2?: string | null
          responded_at?: string | null
          slot_id?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_requests_mentee_id_fkey"
            columns: ["mentee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorship_requests_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorship_requests_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "mentor_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      session_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          session_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewee_id?: string
          reviewer_id?: string
          session_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          meeting_url: string
          mentee_id: string
          mentor_id: string
          outcome_at: string | null
          request_id: string
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          meeting_url: string
          mentee_id: string
          mentor_id: string
          outcome_at?: string | null
          request_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_url?: string
          mentee_id?: string
          mentor_id?: string
          outcome_at?: string | null
          request_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_mentee_id_fkey"
            columns: ["mentee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "mentorship_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          created_at: string
          institutional_email: string | null
          personal_email: string | null
          phone: string | null
          student_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          institutional_email?: string | null
          personal_email?: string | null
          phone?: string | null
          student_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          institutional_email?: string | null
          personal_email?: string | null
          phone?: string | null
          student_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliation: Database["public"]["Enums"]["affiliation"] | null
          avatar_path: string | null
          batch: string | null
          bio: string | null
          company: string | null
          created_at: string
          department: string | null
          full_name: string
          graduation_year: number | null
          headline: string | null
          id: string
          industry: string | null
          job_title: string | null
          linkedin_url: string | null
          location: string | null
          onboarded_at: string | null
          reputation_score: number
          role: Database["public"]["Enums"]["user_role"]
          search_text: string
          skills: string[]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          visibility: Database["public"]["Enums"]["profile_visibility"]
        }
        Insert: {
          affiliation?: Database["public"]["Enums"]["affiliation"] | null
          avatar_path?: string | null
          batch?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          graduation_year?: number | null
          headline?: string | null
          id: string
          industry?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          onboarded_at?: string | null
          reputation_score?: number
          role?: Database["public"]["Enums"]["user_role"]
          search_text?: string
          skills?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          visibility?: Database["public"]["Enums"]["profile_visibility"]
        }
        Update: {
          affiliation?: Database["public"]["Enums"]["affiliation"] | null
          avatar_path?: string | null
          batch?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          graduation_year?: number | null
          headline?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          onboarded_at?: string | null
          reputation_score?: number
          role?: Database["public"]["Enums"]["user_role"]
          search_text?: string
          skills?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          visibility?: Database["public"]["Enums"]["profile_visibility"]
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          purged_at: string | null
          request_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          purged_at?: string | null
          request_id: string
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          purged_at?: string | null
          request_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_events: {
        Row: {
          actor_id: string | null
          created_at: string
          evidence_ref: string | null
          from_status: Database["public"]["Enums"]["verification_status"]
          id: string
          notes: string | null
          to_status: Database["public"]["Enums"]["verification_status"]
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          evidence_ref?: string | null
          from_status: Database["public"]["Enums"]["verification_status"]
          id?: string
          notes?: string | null
          to_status: Database["public"]["Enums"]["verification_status"]
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          evidence_ref?: string | null
          from_status?: Database["public"]["Enums"]["verification_status"]
          id?: string
          notes?: string | null
          to_status?: Database["public"]["Enums"]["verification_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          claimed_affiliation: Database["public"]["Enums"]["affiliation"]
          claimed_batch: string | null
          claimed_department: string | null
          claimed_graduation_year: number | null
          claimed_student_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          method: Database["public"]["Enums"]["verification_method"]
          review_notes: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["verification_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_affiliation: Database["public"]["Enums"]["affiliation"]
          claimed_batch?: string | null
          claimed_department?: string | null
          claimed_graduation_year?: number | null
          claimed_student_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          method: Database["public"]["Enums"]["verification_method"]
          review_notes?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["verification_request_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          claimed_affiliation?: Database["public"]["Enums"]["affiliation"]
          claimed_batch?: string | null
          claimed_department?: string | null
          claimed_graduation_year?: number | null
          claimed_student_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["verification_method"]
          review_notes?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["verification_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      evidence_purge_candidates: {
        Args: { p_limit?: number; p_retention_days?: number }
        Returns: {
          document_id: string
          path: string
          reason: string
        }[]
      }
      mark_evidence_purged: {
        Args: { p_document_ids: string[] }
        Returns: number
      }
    }
    Enums: {
      affiliation: "student" | "alumni"
      document_kind: "student_id_card" | "certificate" | "transcript" | "other"
      profile_visibility: "public" | "iiuc_community" | "private"
      request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      session_status: "scheduled" | "completed" | "cancelled" | "no_show"
      slot_status: "open" | "held" | "booked" | "cancelled"
      user_role: "member" | "admin"
      verification_method: "institutional_email" | "document"
      verification_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      verification_status:
        | "unverified"
        | "email_verified"
        | "affiliation_pending"
        | "verified_student"
        | "verified_alumni"
        | "trusted_member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      affiliation: ["student", "alumni"],
      document_kind: ["student_id_card", "certificate", "transcript", "other"],
      profile_visibility: ["public", "iiuc_community", "private"],
      request_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      session_status: ["scheduled", "completed", "cancelled", "no_show"],
      slot_status: ["open", "held", "booked", "cancelled"],
      user_role: ["member", "admin"],
      verification_method: ["institutional_email", "document"],
      verification_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      verification_status: [
        "unverified",
        "email_verified",
        "affiliation_pending",
        "verified_student",
        "verified_alumni",
        "trusted_member",
      ],
    },
  },
} as const
