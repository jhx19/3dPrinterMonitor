export type PrinterStatus = "idle" | "printing" | "error";

export interface Database {
  public: {
    Tables: {
      printers: {
        Row: {
          id: string;
          name: string | null;
          status: PrinterStatus | string | null;
          time_remaining: number | null;
          filament_level: number | null;
          updated_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          name?: string | null;
          status?: PrinterStatus | string | null;
          time_remaining?: number | null;
          filament_level?: number | null;
          updated_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          name?: string | null;
          status?: PrinterStatus | string | null;
          time_remaining?: number | null;
          filament_level?: number | null;
          updated_at?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string | null;
          created_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string | null;
          created_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: string | null;
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
          created_at: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          printer_id?: string | null;
          user_id: string;
          created_at?: string | null;
          [key: string]: unknown;
        };
        Update: {
          id?: string;
          printer_id?: string | null;
          user_id?: string;
          created_at?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
