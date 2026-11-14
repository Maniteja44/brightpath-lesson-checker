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
      agent_memory: {
        Row: {
          content: string
          created_at: string
          criterion_key: string | null
          id: string
          memory_type: string
          metadata: Json
          occurrences: number
          run_id: string | null
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          criterion_key?: string | null
          id?: string
          memory_type: string
          metadata?: Json
          occurrences?: number
          run_id?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          criterion_key?: string | null
          id?: string
          memory_type?: string
          metadata?: Json
          occurrences?: number
          run_id?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          created_at: string
          criterion_key: string
          criterion_name: string
          evaluation_id: string
          evidence: string
          id: string
          reason: string
          run_id: string
          suggested_improvement: string
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          criterion_key: string
          criterion_name: string
          evaluation_id: string
          evidence: string
          id?: string
          reason: string
          run_id: string
          suggested_improvement: string
          user_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          criterion_key?: string
          criterion_name?: string
          evaluation_id?: string
          evidence?: string
          id?: string
          reason?: string
          run_id?: string
          suggested_improvement?: string
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criteria_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_criteria_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          attempt_number: number
          created_at: string
          decision: string
          fail_count: number
          id: string
          latency_ms: number | null
          lesson_version_id: string
          model: string
          overall_notes: string | null
          pass_count: number
          rubric_version_id: string | null
          run_id: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          decision: string
          fail_count: number
          id?: string
          latency_ms?: number | null
          lesson_version_id: string
          model: string
          overall_notes?: string | null
          pass_count: number
          rubric_version_id?: string | null
          run_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          decision?: string
          fail_count?: number
          id?: string
          latency_ms?: number | null
          lesson_version_id?: string
          model?: string
          overall_notes?: string | null
          pass_count?: number
          rubric_version_id?: string | null
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_lesson_version_id_fkey"
            columns: ["lesson_version_id"]
            isOneToOne: true
            referencedRelation: "lesson_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "rubric_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_runs: {
        Row: {
          attempts_used: number
          completed_at: string | null
          created_at: string
          current_step: string
          demo_defect: string | null
          difficulty: string
          education_level: string
          error_code: string | null
          error_message: string | null
          evaluator_malformed_count: number
          evaluator_model: string
          evaluator_prompt_version_id: string | null
          final_lesson_version_id: string | null
          generator_model: string
          generator_prompt_version_id: string | null
          id: string
          learning_objectives: string | null
          lock_until: string | null
          max_attempts: number
          memory_context: string | null
          memory_snapshot: Json
          rejection_explanation: string | null
          rubric_version_id: string | null
          status: string
          step_log: Json
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts_used?: number
          completed_at?: string | null
          created_at?: string
          current_step?: string
          demo_defect?: string | null
          difficulty: string
          education_level: string
          error_code?: string | null
          error_message?: string | null
          evaluator_malformed_count?: number
          evaluator_model: string
          evaluator_prompt_version_id?: string | null
          final_lesson_version_id?: string | null
          generator_model: string
          generator_prompt_version_id?: string | null
          id?: string
          learning_objectives?: string | null
          lock_until?: string | null
          max_attempts?: number
          memory_context?: string | null
          memory_snapshot?: Json
          rejection_explanation?: string | null
          rubric_version_id?: string | null
          status?: string
          step_log?: Json
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts_used?: number
          completed_at?: string | null
          created_at?: string
          current_step?: string
          demo_defect?: string | null
          difficulty?: string
          education_level?: string
          error_code?: string | null
          error_message?: string | null
          evaluator_malformed_count?: number
          evaluator_model?: string
          evaluator_prompt_version_id?: string | null
          final_lesson_version_id?: string | null
          generator_model?: string
          generator_prompt_version_id?: string | null
          id?: string
          learning_objectives?: string | null
          lock_until?: string | null
          max_attempts?: number
          memory_context?: string | null
          memory_snapshot?: Json
          rejection_explanation?: string | null
          rubric_version_id?: string | null
          status?: string
          step_log?: Json
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_runs_evaluator_prompt_version_id_fkey"
            columns: ["evaluator_prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_runs_final_lesson_fk"
            columns: ["final_lesson_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_runs_generator_prompt_version_id_fkey"
            columns: ["generator_prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_runs_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "rubric_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_recommendations: {
        Row: {
          created_at: string
          criterion_key: string
          decided_at: string | null
          evidence: Json
          failures_after: number
          failures_before: number | null
          id: string
          occurrences: number
          proposed_change: string
          rationale: string
          runs_after: number
          runs_before: number | null
          status: string
          target: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criterion_key: string
          decided_at?: string | null
          evidence?: Json
          failures_after?: number
          failures_before?: number | null
          id?: string
          occurrences?: number
          proposed_change: string
          rationale: string
          runs_after?: number
          runs_before?: number | null
          status?: string
          target: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criterion_key?: string
          decided_at?: string | null
          evidence?: Json
          failures_after?: number
          failures_before?: number | null
          id?: string
          occurrences?: number
          proposed_change?: string
          rationale?: string
          runs_after?: number
          runs_before?: number | null
          status?: string
          target?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_versions: {
        Row: {
          attempt_number: number
          content: Json
          created_at: string
          feedback_received: string | null
          id: string
          injected_defect: string | null
          latency_ms: number | null
          markdown: string
          model: string
          revision_notes: string[]
          run_id: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          content: Json
          created_at?: string
          feedback_received?: string | null
          id?: string
          injected_defect?: string | null
          latency_ms?: number | null
          markdown: string
          model: string
          revision_notes?: string[]
          run_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          content?: Json
          created_at?: string
          feedback_received?: string | null
          id?: string
          injected_defect?: string | null
          latency_ms?: number | null
          markdown?: string
          model?: string
          revision_notes?: string[]
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          evaluator_model: string
          generator_model: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          evaluator_model?: string
          generator_model?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          evaluator_model?: string
          generator_model?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          change_reason: string
          created_at: string
          id: string
          is_active: boolean
          learned_rules: string[]
          role: string
          source_recommendation_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          change_reason: string
          created_at?: string
          id?: string
          is_active?: boolean
          learned_rules?: string[]
          role: string
          source_recommendation_id?: string | null
          user_id: string
          version: number
        }
        Update: {
          change_reason?: string
          created_at?: string
          id?: string
          is_active?: boolean
          learned_rules?: string[]
          role?: string
          source_recommendation_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_rec_fk"
            columns: ["source_recommendation_id"]
            isOneToOne: false
            referencedRelation: "improvement_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_knowledge: {
        Row: {
          content: string
          created_at: string
          id: string
          keywords: string[]
          source: string | null
          title: string
          topic_key: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          keywords?: string[]
          source?: string | null
          title: string
          topic_key: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          keywords?: string[]
          source?: string | null
          title?: string
          topic_key?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rejection_logs: {
        Row: {
          attempt_number: number
          changes_made: string[] | null
          created_at: string
          evaluation_id: string
          evaluator_reasoning: Json
          failed_criteria: string[]
          feedback_sent: string | null
          id: string
          is_final_rejection: boolean
          lesson_version_id: string
          regenerated_lesson_version_id: string | null
          result_after_regeneration: string | null
          run_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          changes_made?: string[] | null
          created_at?: string
          evaluation_id: string
          evaluator_reasoning: Json
          failed_criteria: string[]
          feedback_sent?: string | null
          id?: string
          is_final_rejection?: boolean
          lesson_version_id: string
          regenerated_lesson_version_id?: string | null
          result_after_regeneration?: string | null
          run_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          changes_made?: string[] | null
          created_at?: string
          evaluation_id?: string
          evaluator_reasoning?: Json
          failed_criteria?: string[]
          feedback_sent?: string | null
          id?: string
          is_final_rejection?: boolean
          lesson_version_id?: string
          regenerated_lesson_version_id?: string | null
          result_after_regeneration?: string | null
          run_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejection_logs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_logs_lesson_version_id_fkey"
            columns: ["lesson_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_logs_regenerated_lesson_version_id_fkey"
            columns: ["regenerated_lesson_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_versions: {
        Row: {
          change_reason: string
          created_at: string
          criteria: Json
          id: string
          is_active: boolean
          source_recommendation_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          change_reason: string
          created_at?: string
          criteria: Json
          id?: string
          is_active?: boolean
          source_recommendation_id?: string | null
          user_id: string
          version: number
        }
        Update: {
          change_reason?: string
          created_at?: string
          criteria?: Json
          id?: string
          is_active?: boolean
          source_recommendation_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_versions_rec_fk"
            columns: ["source_recommendation_id"]
            isOneToOne: false
            referencedRelation: "improvement_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_stats: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
