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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_bootstrap: {
        Row: {
          id: number
          used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          id?: number
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          id?: number
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      internal_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      match_moves: {
        Row: {
          created_at: string
          id: string
          match_id: string
          move: Json
          ply: number
          seat: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          move: Json
          ply: number
          seat: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          move?: Json
          ply?: number
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_moves_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          bet_cents: number
          created_at: string
          game: string
          id: string
          match_id: string | null
          opponents: Json
          payout_cents: number
          result: string
          user_id: string
        }
        Insert: {
          bet_cents?: number
          created_at?: string
          game: string
          id?: string
          match_id?: string | null
          opponents?: Json
          payout_cents?: number
          result: string
          user_id: string
        }
        Update: {
          bet_cents?: number
          created_at?: string
          game?: string
          id?: string
          match_id?: string | null
          opponents?: Json
          payout_cents?: number
          result?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          bet_cents: number
          created_at: string
          finished_at: string | null
          game: string
          id: string
          ply: number
          pot_cents: number
          room_id: string | null
          seats: Json
          state: Json
          status: string
          turn_deadline: string | null
          turn_seat: number
          winner_seat: number | null
        }
        Insert: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game: string
          id?: string
          ply?: number
          pot_cents?: number
          room_id?: string | null
          seats?: Json
          state: Json
          status?: string
          turn_deadline?: string | null
          turn_seat?: number
          winner_seat?: number | null
        }
        Update: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game?: string
          id?: string
          ply?: number
          pot_cents?: number
          room_id?: string | null
          seats?: Json
          state?: Json
          status?: string
          turn_deadline?: string | null
          turn_seat?: number
          winner_seat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          pushed_at: string | null
          read: boolean
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          pushed_at?: string | null
          read?: boolean
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          pushed_at?: string | null
          read?: boolean
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_number: string
          created_at: string
          id: string
          label: string | null
          method: Database["public"]["Enums"]["wallet_method"]
          user_id: string
        }
        Insert: {
          account_number: string
          created_at?: string
          id?: string
          label?: string | null
          method: Database["public"]["Enums"]["wallet_method"]
          user_id: string
        }
        Update: {
          account_number?: string
          created_at?: string
          id?: string
          label?: string | null
          method?: Database["public"]["Enums"]["wallet_method"]
          user_id?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount_cents: number
          created_at: string
          destination: string
          error: string | null
          id: string
          method: Database["public"]["Enums"]["wallet_method"]
          processed_at: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["tx_status"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          destination: string
          error?: string | null
          id?: string
          method: Database["public"]["Enums"]["wallet_method"]
          processed_at?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          destination?: string
          error?: string | null
          id?: string
          method?: Database["public"]["Enums"]["wallet_method"]
          processed_at?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          house_fee_percent: number
          id: number
          max_bet_cents: number
          methods_enabled: Json
          min_bet_cents: number
          min_deposit_cents: number
          min_withdrawal_cents: number
          real_money_enabled: boolean
          rollover_enabled: boolean
          rollover_multiplier: number
          test_mode_enabled: boolean
          updated_at: string
          withdrawal_fee_fixed_cents: number
          withdrawal_fee_percent: number
        }
        Insert: {
          house_fee_percent?: number
          id?: number
          max_bet_cents?: number
          methods_enabled?: Json
          min_bet_cents?: number
          min_deposit_cents?: number
          min_withdrawal_cents?: number
          real_money_enabled?: boolean
          rollover_enabled?: boolean
          rollover_multiplier?: number
          test_mode_enabled?: boolean
          updated_at?: string
          withdrawal_fee_fixed_cents?: number
          withdrawal_fee_percent?: number
        }
        Update: {
          house_fee_percent?: number
          id?: number
          max_bet_cents?: number
          methods_enabled?: Json
          min_bet_cents?: number
          min_deposit_cents?: number
          min_withdrawal_cents?: number
          real_money_enabled?: boolean
          rollover_enabled?: boolean
          rollover_multiplier?: number
          test_mode_enabled?: boolean
          updated_at?: string
          withdrawal_fee_fixed_cents?: number
          withdrawal_fee_percent?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string
          created_at: string
          display_name: string
          id: string
          is_blocked: boolean
          last_seen_at: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar?: string
          created_at?: string
          display_name?: string
          id: string
          is_blocked?: boolean
          last_seen_at?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar?: string
          created_at?: string
          display_name?: string
          id?: string
          is_blocked?: boolean
          last_seen_at?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reminder_log: {
        Row: {
          id: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      room_escrows: {
        Row: {
          bet_cents: number
          created_at: string
          finished_at: string | null
          game: string
          locked_one: boolean
          locked_two: boolean
          payout_cents: number
          player_one: string
          player_two: string
          rake_cents: number
          report_one: string | null
          report_two: string | null
          room_code: string
          status: string
          winner_id: string | null
        }
        Insert: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game: string
          locked_one?: boolean
          locked_two?: boolean
          payout_cents?: number
          player_one: string
          player_two: string
          rake_cents?: number
          report_one?: string | null
          report_two?: string | null
          room_code: string
          status?: string
          winner_id?: string | null
        }
        Update: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game?: string
          locked_one?: boolean
          locked_two?: boolean
          payout_cents?: number
          player_one?: string
          player_two?: string
          rake_cents?: number
          report_one?: string | null
          report_two?: string | null
          room_code?: string
          status?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      room_players: {
        Row: {
          id: string
          joined_at: string
          room_id: string
          seat: number
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          room_id: string
          seat: number
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          room_id?: string
          seat?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          bet_cents: number
          capacity: number
          code: string
          created_at: string
          game: string
          host_id: string
          id: string
          is_private: boolean
          match_id: string | null
          status: Database["public"]["Enums"]["room_status"]
          timer_seconds: number
        }
        Insert: {
          bet_cents?: number
          capacity?: number
          code: string
          created_at?: string
          game: string
          host_id: string
          id?: string
          is_private?: boolean
          match_id?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          timer_seconds?: number
        }
        Update: {
          bet_cents?: number
          capacity?: number
          code?: string
          created_at?: string
          game?: string
          host_id?: string
          id?: string
          is_private?: boolean
          match_id?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          timer_seconds?: number
        }
        Relationships: []
      }
      solo_matches: {
        Row: {
          bet_cents: number
          created_at: string
          finished_at: string | null
          game: string
          id: string
          payout_cents: number
          rake_cents: number
          result: string | null
          status: string
          user_id: string
        }
        Insert: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game: string
          id?: string
          payout_cents?: number
          rake_cents?: number
          result?: string | null
          status?: string
          user_id: string
        }
        Update: {
          bet_cents?: number
          created_at?: string
          finished_at?: string | null
          game?: string
          id?: string
          payout_cents?: number
          rake_cents?: number
          result?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          method: Database["public"]["Enums"]["wallet_method"] | null
          provider: string
          provider_ref: string | null
          status: Database["public"]["Enums"]["tx_status"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata?: Json
          method?: Database["public"]["Enums"]["wallet_method"] | null
          provider?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["tx_kind"]
          metadata?: Json
          method?: Database["public"]["Enums"]["wallet_method"] | null
          provider?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_cents: number
          currency: string
          locked_cents: number
          rollover_required_cents: number
          updated_at: string
          user_id: string
          wagered_cents: number
        }
        Insert: {
          balance_cents?: number
          currency?: string
          locked_cents?: number
          rollover_required_cents?: number
          updated_at?: string
          user_id: string
          wagered_cents?: number
        }
        Update: {
          balance_cents?: number
          currency?: string
          locked_cents?: number
          rollover_required_cents?: number
          updated_at?: string
          user_id?: string
          wagered_cents?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: { _amount_cents: number; _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_set_blocked: {
        Args: { _blocked: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_test_mode: { Args: { _enabled: boolean }; Returns: undefined }
      admin_settle_payout: {
        Args: {
          _error?: string
          _payout_id: string
          _provider_ref: string
          _status: Database["public"]["Enums"]["tx_status"]
        }
        Returns: undefined
      }
      admin_update_settings: {
        Args: {
          _house_fee_percent: number
          _min_deposit_cents: number
          _min_withdrawal_cents: number
          _rollover_enabled: boolean
          _rollover_multiplier: number
          _withdrawal_fee_fixed_cents: number
          _withdrawal_fee_percent: number
        }
        Returns: undefined
      }
      app_settings: {
        Args: never
        Returns: {
          house_fee_percent: number
          id: number
          max_bet_cents: number
          methods_enabled: Json
          min_bet_cents: number
          min_deposit_cents: number
          min_withdrawal_cents: number
          real_money_enabled: boolean
          rollover_enabled: boolean
          rollover_multiplier: number
          test_mode_enabled: boolean
          updated_at: string
          withdrawal_fee_fixed_cents: number
          withdrawal_fee_percent: number
        }
        SetofOptions: {
          from: "*"
          to: "platform_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_me: {
        Args: { _display_name?: string; _phone?: string }
        Returns: undefined
      }
      cancel_room_escrow: { Args: { _room_code: string }; Returns: Json }
      claim_admin: { Args: { _code: string }; Returns: string }
      claim_push_batch: {
        Args: { _token: string }
        Returns: {
          auth: string
          body: string
          endpoint: string
          notification_id: string
          p256dh: string
          title: string
          url: string
          user_id: string
        }[]
      }
      credit_wallet: {
        Args: {
          _amount_cents: number
          _description: string
          _idempotency_key: string
          _kind: Database["public"]["Enums"]["tx_kind"]
          _metadata?: Json
          _method?: Database["public"]["Enums"]["wallet_method"]
          _provider_ref?: string
          _user_id: string
        }
        Returns: string
      }
      debit_wallet: {
        Args: {
          _amount_cents: number
          _description: string
          _idempotency_key: string
          _kind: Database["public"]["Enums"]["tx_kind"]
          _metadata?: Json
          _method?: Database["public"]["Enums"]["wallet_method"]
          _provider_ref?: string
          _user_id: string
        }
        Returns: string
      }
      drop_push_subscription: {
        Args: { _endpoint: string; _token: string }
        Returns: undefined
      }
      ensure_wallet: { Args: { _user_id: string }; Returns: undefined }
      finish_solo_match: {
        Args: { _match_id: string; _result: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      internal_secret_matches: {
        Args: { _name: string; _value: string }
        Returns: boolean
      }
      lock_room_wager: {
        Args: { _amount_cents: number; _room_code: string }
        Returns: Json
      }
      notify_user: {
        Args: {
          _body: string
          _kind: string
          _title: string
          _uid: string
          _url?: string
        }
        Returns: undefined
      }
      register_room_match: {
        Args: {
          _bet_cents: number
          _game: string
          _player_one_id: string
          _player_two_id: string
          _room_code: string
        }
        Returns: Json
      }
      request_withdrawal: {
        Args: {
          _amount_cents: number
          _destination: string
          _method: Database["public"]["Enums"]["wallet_method"]
        }
        Returns: string
      }
      settle_deposit: {
        Args: {
          _idempotency_key: string
          _provider_ref: string
          _status: Database["public"]["Enums"]["tx_status"]
          _token: string
        }
        Returns: string
      }
      settle_own_test_deposit: {
        Args: { _idempotency_key: string }
        Returns: string
      }
      settle_room_result: {
        Args: { _room_code: string; _winner_id: string }
        Returns: Json
      }
      start_deposit: {
        Args: {
          _amount_cents: number
          _method: Database["public"]["Enums"]["wallet_method"]
          _msisdn: string
        }
        Returns: {
          idempotency_key: string
          transaction_id: string
        }[]
      }
      start_solo_match: {
        Args: { _bet_cents: number; _game: string }
        Returns: string
      }
      touch_last_seen: { Args: never; Returns: undefined }
      wallet_summary: { Args: never; Returns: Json }
      withdrawal_quote: {
        Args: { _amount_cents: number }
        Returns: {
          amount_cents: number
          fee_cents: number
          net_cents: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "player"
      room_status:
        | "WAITING"
        | "READY"
        | "STARTING"
        | "PLAYING"
        | "FINISHED"
        | "CANCELLED"
      tx_kind:
        | "deposit"
        | "withdrawal"
        | "bet"
        | "prize"
        | "refund"
        | "fee"
        | "adjustment"
        | "bonus"
      tx_status: "pending" | "completed" | "failed" | "reversed"
      wallet_method: "mpesa" | "mola" | "mcash" | "bank"
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
      app_role: ["admin", "player"],
      room_status: [
        "WAITING",
        "READY",
        "STARTING",
        "PLAYING",
        "FINISHED",
        "CANCELLED",
      ],
      tx_kind: [
        "deposit",
        "withdrawal",
        "bet",
        "prize",
        "refund",
        "fee",
        "adjustment",
        "bonus",
      ],
      tx_status: ["pending", "completed", "failed", "reversed"],
      wallet_method: ["mpesa", "mola", "mcash", "bank"],
    },
  },
} as const
