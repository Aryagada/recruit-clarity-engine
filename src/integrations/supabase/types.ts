export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// NOTE: hand-maintained to match supabase/migrations/2026061210*.sql (foundation
// refactor). Regenerate with `supabase gen types typescript --linked` once the
// migrations are applied to refresh/extend (e.g. stub tables omitted here).
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string
          name: string
          settings: Json
          retention_months: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          settings?: Json
          retention_months?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          settings?: Json
          retention_months?: number
          created_at?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          created_at?: string
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
      roles: {
        Row: {
          id: string
          org_id: string
          recruiter_id: string
          title: string
          description: string
          status: Database["public"]["Enums"]["role_status"]
          knockout_rules: Json
          dept: string | null
          location: string | null
          opened_at: string | null
          closed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          recruiter_id: string
          title: string
          description: string
          status?: Database["public"]["Enums"]["role_status"]
          knockout_rules?: Json
          dept?: string | null
          location?: string | null
          opened_at?: string | null
          closed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          recruiter_id?: string
          title?: string
          description?: string
          status?: Database["public"]["Enums"]["role_status"]
          knockout_rules?: Json
          dept?: string | null
          location?: string | null
          opened_at?: string | null
          closed_at?: string | null
          created_at?: string
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
          id: string
          org_id: string
          role_id: string
          version: number
          competencies: Json
          screening_questions: Json
          knockout_rules: Json
          locked_at: string | null
          locked_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          role_id: string
          version: number
          competencies?: Json
          screening_questions?: Json
          knockout_rules?: Json
          locked_at?: string | null
          locked_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          role_id?: string
          version?: number
          competencies?: Json
          screening_questions?: Json
          knockout_rules?: Json
          locked_at?: string | null
          locked_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_versions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          id: string
          org_id: string
          full_name: string
          email: string
          phone: string | null
          location: string | null
          headline: string | null
          years_exp: number | null
          skills: string[]
          resume_summary: string | null
          consent_pool: boolean
          consent_at: string | null
          last_active_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          full_name: string
          email: string
          phone?: string | null
          location?: string | null
          headline?: string | null
          years_exp?: number | null
          skills?: string[]
          resume_summary?: string | null
          consent_pool?: boolean
          consent_at?: string | null
          last_active_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          full_name?: string
          email?: string
          phone?: string | null
          location?: string | null
          headline?: string | null
          years_exp?: number | null
          skills?: string[]
          resume_summary?: string | null
          consent_pool?: boolean
          consent_at?: string | null
          last_active_at?: string | null
          created_at?: string
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
      applications: {
        Row: {
          id: string
          org_id: string
          candidate_id: string
          role_id: string
          rubric_version_id: string | null
          stage: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at: string
          status: Database["public"]["Enums"]["application_status"]
          source: string | null
          rejection_reason: string | null
          knockout_answers: Json
          needs_human_screen: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          candidate_id: string
          role_id: string
          rubric_version_id?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
          source?: string | null
          rejection_reason?: string | null
          knockout_answers?: Json
          needs_human_screen?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          candidate_id?: string
          role_id?: string
          rubric_version_id?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
          source?: string | null
          rejection_reason?: string | null
          knockout_answers?: Json
          needs_human_screen?: boolean
          created_at?: string
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
      stage_events: {
        Row: {
          id: string
          org_id: string
          application_id: string
          from_stage: Database["public"]["Enums"]["candidate_stage"] | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          application_id: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          application_id?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          to_stage?: Database["public"]["Enums"]["candidate_stage"]
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_sessions: {
        Row: {
          id: string
          org_id: string
          application_id: string
          mode: Database["public"]["Enums"]["screen_mode"]
          status: Database["public"]["Enums"]["screening_status"]
          state: Json
          transcript: Json
          flags: Json
          completeness: number | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          application_id: string
          mode?: Database["public"]["Enums"]["screen_mode"]
          status?: Database["public"]["Enums"]["screening_status"]
          state?: Json
          transcript?: Json
          flags?: Json
          completeness?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          application_id?: string
          mode?: Database["public"]["Enums"]["screen_mode"]
          status?: Database["public"]["Enums"]["screening_status"]
          state?: Json
          transcript?: Json
          flags?: Json
          completeness?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_sessions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          id: string
          org_id: string
          application_id: string
          rubric_version_id: string | null
          extraction_id: string
          competency_key: string
          source: string
          summary: string | null
          quotes: Json
          flags: string[]
          completeness: string | null
          model_version: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          application_id: string
          rubric_version_id?: string | null
          extraction_id?: string
          competency_key: string
          source?: string
          summary?: string | null
          quotes?: Json
          flags?: string[]
          completeness?: string | null
          model_version?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          application_id?: string
          rubric_version_id?: string | null
          extraction_id?: string
          competency_key?: string
          source?: string
          summary?: string | null
          quotes?: Json
          flags?: string[]
          completeness?: string | null
          model_version?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_files: {
        Row: {
          id: string
          org_id: string
          candidate_id: string
          application_id: string | null
          kind: string
          storage_path: string
          mime: string | null
          size_bytes: number | null
          parsed_at: string | null
          parse_version: number | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          candidate_id: string
          application_id?: string | null
          kind?: string
          storage_path: string
          mime?: string | null
          size_bytes?: number | null
          parsed_at?: string | null
          parse_version?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          candidate_id?: string
          application_id?: string | null
          kind?: string
          storage_path?: string
          mime?: string | null
          size_bytes?: number | null
          parsed_at?: string | null
          parse_version?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_files_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          id: string
          org_id: string
          actor: string | null
          action: string
          entity: string | null
          entity_id: string | null
          detail: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          actor?: string | null
          action: string
          entity?: string | null
          entity_id?: string | null
          detail?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          actor?: string | null
          action?: string
          entity?: string | null
          entity_id?: string | null
          detail?: Json
          created_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          org_id: string | null
          kind: string
          payload: Json
          status: Database["public"]["Enums"]["job_state"]
          priority: number
          attempts: number
          run_after: string
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          kind: string
          payload?: Json
          status?: Database["public"]["Enums"]["job_state"]
          priority?: number
          attempts?: number
          run_after?: string
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          kind?: string
          payload?: Json
          status?: Database["public"]["Enums"]["job_state"]
          priority?: number
          attempts?: number
          run_after?: string
          last_error?: string | null
          created_at?: string
          updated_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      current_org_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_org_member: {
        Args: { _org: string }
        Returns: boolean
      }
      apply_to_role: {
        Args: {
          p_role_id: string
          p_full_name: string
          p_email: string
          p_phone: string | null
          p_resume_summary: string | null
          p_resume_path: string
          p_knockout_answers: Json
          p_knocked_out: boolean
        }
        Returns: string
      }
      claim_jobs: {
        Args: { p_limit?: number }
        Returns: Database["public"]["Tables"]["jobs"]["Row"][]
      }
    }
    Enums: {
      app_role: "recruiter" | "admin"
      org_member_role: "owner" | "admin" | "recruiter" | "hm" | "interviewer" | "viewer"
      role_status: "draft" | "open" | "closed"
      candidate_stage:
        | "applied"
        | "knocked_out"
        | "screening"
        | "screened"
        | "shortlisted"
        | "rejected"
        | "hired"
      application_status: "active" | "rejected" | "hired" | "pooled" | "withdrawn"
      actor_type: "human" | "system"
      screen_mode: "chat" | "voice"
      screening_status: "pending" | "in_progress" | "completed"
      job_state: "queued" | "running" | "done" | "failed"
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
      app_role: ["recruiter", "admin"],
      org_member_role: ["owner", "admin", "recruiter", "hm", "interviewer", "viewer"],
      role_status: ["draft", "open", "closed"],
      candidate_stage: [
        "applied",
        "knocked_out",
        "screening",
        "screened",
        "shortlisted",
        "rejected",
        "hired",
      ],
      application_status: ["active", "rejected", "hired", "pooled", "withdrawn"],
      actor_type: ["human", "system"],
      screen_mode: ["chat", "voice"],
      screening_status: ["pending", "in_progress", "completed"],
      job_state: ["queued", "running", "done", "failed"],
    },
  },
} as const
