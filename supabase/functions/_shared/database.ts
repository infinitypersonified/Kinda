// The API queries tables dynamically and selects different column sets per route.
// This keeps those query results visible to TypeScript while the project moves
// toward generated, table-specific Supabase types.
// deno-lint-ignore no-explicit-any -- Queries use dynamic tables/columns until generated DB types replace this schema.
export type ApiRow = Record<string, any>;

export type ApiDatabase = {
  public: {
    Tables: Record<string, {
      Row: ApiRow;
      Insert: ApiRow;
      Update: ApiRow;
      Relationships: [];
    }>;
    Views: Record<string, never>;
    Functions: Record<string, {
      Args: Record<string, unknown>;
      Returns: unknown;
    }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
