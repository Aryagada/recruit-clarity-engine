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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          knockout_answers: Json
          needs_human_screen: boolean
          org_id: string
          rejection_reason: string | null
          role_id: string
          rubric_version_id: string | null
          source: string | null
          stage: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at: string
          status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          knockout_answers?: Json
          needs_human_screen?: boolean
          org_id: string
          rejection_reason?: string | null
          role_id: string
          rubric_version_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          knockout_answers?: Json
          needs_human_screen?: boolean
          org_id?: string
          rejection_reason?: string | null
          role_id?: string
          rubric_version_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "rubric_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: Json
          entity: string | null
          entity_id: string | null
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_files: {
        Row: {
          application_id: string | null
          candidate_id: string
          created_at: string
          id: string
          kind: string
          mime: string | null
          org_id: string
          parse_version: number | null
          parsed_at: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          application_id?: string | null
          candidate_id: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string | null
          org_id: string
          parse_version?: number | null
          parsed_at?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          application_id?: string | null
          candidate_id?: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string | null
          org_id?: string
          parse_version?: number | null
          parsed_at?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_files_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_files_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          consent_at: string | null
          consent_pool: boolean
          created_at: string
          email: string
          full_name: string
          headline: string | null
          id: string
          last_active_at: string | null
          location: string | null
          org_id: string
          phone: string | null
          resume_summary: string | null
          skills: string[]
          years_exp: number | null
        }
        Insert: {
          consent_at?: string | null
          consent_pool?: boolean
          created_at?: string
          email: string
          full_name: string
          headline?: string | null
          id?: string
          last_active_at?: string | null
          location?: string | null
          org_id: string
          phone?: string | null
          resume_summary?: string | null
          skills?: string[]
          years_exp?: number | null
        }
        Update: {
          consent_at?: string | null
          consent_pool?: boolean
          created_at?: string
          email?: string
          full_name?: string
          headline?: string | null
          id?: string
          last_active_at?: string | null
          location?: string | null
          org_id?: string
          phone?: string | null
          resume_summary?: string | null
          skills?: string[]
          years_exp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          candidate_id: string
          created_at: string
          decided_by: string
          from_stage: Database["public"]["Enums"]["candidate_stage"] | null
          id: string
          reason: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Insert: {
          candidate_id: string
          created_at?: string
          decided_by: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          reason?: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Update: {
          candidate_id?: string
          created_at?: string
          decided_by?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          reason?: string | null
          to_stage?: Database["public"]["Enums"]["candidate_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "legacy_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          application_id: string
          competency_key: string
          completeness: string | null
          created_at: string
          extraction_id: string
          flags: string[]
          id: string
          model_version: string | null
          org_id: string
          quotes: Json
          rubric_version_id: string | null
          source: string
          summary: string | null
        }
        Insert: {
          application_id: string
          competency_key: string
          completeness?: string | null
          created_at?: string
          extraction_id?: string
          flags?: string[]
          id?: string
          model_version?: string | null
          org_id: string
          quotes?: Json
          rubric_version_id?: string | null
          source?: string
          summary?: string | null
        }
        Update: {
          application_id?: string
          competency_key?: string
          completeness?: string | null
          created_at?: string
          extraction_id?: string
          flags?: string[]
          id?: string
          model_version?: string | null
          org_id?: string
          quotes?: Json
          rubric_version_id?: string | null
          source?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "rubric_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          org_id: string | null
          payload: Json
          priority: number
          run_after: string
          status: Database["public"]["Enums"]["job_state"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          org_id?: string | null
          payload?: Json
          priority?: number
          run_after?: string
          status?: Database["public"]["Enums"]["job_state"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          org_id?: string | null
          payload?: Json
          priority?: number
          run_after?: string
          status?: Database["public"]["Enums"]["job_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_candidates: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          job_id: string
          knockout_answers: Json
          phone: string | null
          rejection_reason: string | null
          resume_path: string | null
          resume_text: string | null
          stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          job_id: string
          knockout_answers?: Json
          phone?: string | null
          rejection_reason?: string | null
          resume_path?: string | null
          resume_text?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          job_id?: string
          knockout_answers?: Json
          phone?: string | null
          rejection_reason?: string | null
          resume_path?: string | null
          resume_text?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          retention_months: number
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          retention_months?: number
          settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          retention_months?: number
          settings?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          closed_at: string | null
          created_at: string
          dept: string | null
          description: string
          id: string
          knockout_rules: Json
          location: string | null
          opened_at: string | null
          org_id: string
          recruiter_id: string
          status: Database["public"]["Enums"]["role_status"]
          title: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          dept?: string | null
          description: string
          id?: string
          knockout_rules?: Json
          location?: string | null
          opened_at?: string | null
          org_id: string
          recruiter_id: string
          status?: Database["public"]["Enums"]["role_status"]
          title: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          dept?: string | null
          description?: string
          id?: string
          knockout_rules?: Json
          location?: string | null
          opened_at?: string | null
          org_id?: string
          recruiter_id?: string
          status?: Database["public"]["Enums"]["role_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_versions: {
        Row: {
          competencies: Json
          created_at: string
          id: string
          knockout_rules: Json
          locked_at: string | null
          locked_by: string | null
          org_id: string
          role_id: string
          screening_questions: Json
          version: number
        }
        Insert: {
          competencies?: Json
          created_at?: string
          id?: string
          knockout_rules?: Json
          locked_at?: string | null
          locked_by?: string | null
          org_id: string
          role_id: string
          screening_questions?: Json
          version: number
        }
        Update: {
          competencies?: Json
          created_at?: string
          id?: string
          knockout_rules?: Json
          locked_at?: string | null
          locked_by?: string | null
          org_id?: string
          role_id?: string
          screening_questions?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_versions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_sessions: {
        Row: {
          application_id: string
          completed_at: string | null
          completeness: number | null
          created_at: string
          flags: Json
          id: string
          mode: Database["public"]["Enums"]["screen_mode"]
          org_id: string
          started_at: string | null
          state: Json
          status: Database["public"]["Enums"]["screening_status"]
          transcript: Json
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          completeness?: number | null
          created_at?: string
          flags?: Json
          id?: string
          mode?: Database["public"]["Enums"]["screen_mode"]
          org_id: string
          started_at?: string | null
          state?: Json
          status?: Database["public"]["Enums"]["screening_status"]
          transcript?: Json
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          completeness?: number | null
          created_at?: string
          flags?: Json
          id?: string
          mode?: Database["public"]["Enums"]["screen_mode"]
          org_id?: string
          started_at?: string | null
          state?: Json
          status?: Database["public"]["Enums"]["screening_status"]
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "screen_sessions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_interviews: {
        Row: {
          candidate_id: string
          completed_at: string | null
          completeness_score: number | null
          created_at: string
          evidence: Json | null
          flags: Json
          id: string
          status: Database["public"]["Enums"]["screening_status"]
          transcript: Json
        }
        Insert: {
          candidate_id: string
          completed_at?: string | null
          completeness_score?: number | null
          created_at?: string
          evidence?: Json | null
          flags?: Json
          id?: string
          status?: Database["public"]["Enums"]["screening_status"]
          transcript?: Json
        }
        Update: {
          candidate_id?: string
          completed_at?: string | null
          completeness_score?: number | null
          created_at?: string
          evidence?: Json | null
          flags?: Json
          id?: string
          status?: Database["public"]["Enums"]["screening_status"]
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "screening_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "legacy_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          application_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["candidate_stage"] | null
          id: string
          org_id: string
          reason: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          application_id: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          org_id: string
          reason?: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          application_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          org_id?: string
          reason?: string | null
          to_stage?: Database["public"]["Enums"]["candidate_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
    }
    Enums: {
      actor_type: "human" | "system"
      app_role: "recruiter" | "admin"
      application_status:
        | "active"
        | "rejected"
        | "hired"
        | "pooled"
        | "withdrawn"
      candidate_stage:
        | "applied"
        | "knocked_out"
        | "screening"
        | "screened"
        | "shortlisted"
        | "rejected"
        | "hired"
      job_state: "queued" | "running" | "done" | "failed"
      org_member_role:
        | "owner"
        | "admin"
        | "recruiter"
        | "hm"
        | "interviewer"
        | "viewer"
      role_status: "draft" | "open" | "closed"
      screen_mode: "chat" | "voice"
      screening_status: "pending" | "in_progress" | "completed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      actor_type: ["human", "system"],
      app_role: ["recruiter", "admin"],
      application_status: [
        "active",
        "rejected",
        "hired",
        "pooled",
        "withdrawn",
      ],
      candidate_stage: [
        "applied",
        "knocked_out",
        "screening",
        "screened",
        "shortlisted",
        "rejected",
        "hired",
      ],
      job_state: ["queued", "running", "done", "failed"],
      org_member_role: [
        "owner",
        "admin",
        "recruiter",
        "hm",
        "interviewer",
        "viewer",
      ],
      role_status: ["draft", "open", "closed"],
      screen_mode: ["chat", "voice"],
      screening_status: ["pending", "in_progress", "completed"],
    },
  },
} as const
