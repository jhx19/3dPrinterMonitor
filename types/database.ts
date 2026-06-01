export type PrinterStatus = "idle" | "printing" | "error";

export interface Database {
  public: {
    Tables: {
      printers: {
        Row: {
          id: string;
          name: string;
          status: PrinterStatus | string | null;
          time_remaining: number | null;
          filament_level: number | null;
          error_code: string | null;
          error_message: string | null;
          active_user_id: string | null;
          updated_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          name?: string;
          status?: PrinterStatus | string | null;
          time_remaining?: number | null;
          filament_level?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          active_user_id?: string | null;
          updated_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          name?: string;
          status?: PrinterStatus | string | null;
          time_remaining?: number | null;
          filament_level?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          active_user_id?: string | null;
          updated_at?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          student_id: string | null;
          role: string | null;
          strikes: number;
          is_banned: boolean;
          created_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          student_id?: string | null;
          role?: string | null;
          strikes?: number;
          is_banned?: boolean;
          created_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          student_id?: string | null;
          role?: string | null;
          strikes?: number;
          is_banned?: boolean;
          created_at?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      queues: {
        Row: {
          id: string;
          printer_id: string | null;
          user_id: string;
          tier: string;
          created_at: string | null;
          notified_at: string | null;
          started_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          printer_id?: string | null;
          user_id: string;
          tier?: string;
          created_at?: string | null;
          notified_at?: string | null;
          started_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          printer_id?: string | null;
          user_id?: string;
          tier?: string;
          created_at?: string | null;
          notified_at?: string | null;
          started_at?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_printer: {
        Args: { p_printer_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
