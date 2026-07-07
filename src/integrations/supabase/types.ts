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
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          amount: number
          commission_month: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          referral_id: string
          status: Database["public"]["Enums"]["commission_status"]
        }
        Insert: {
          affiliate_id: string
          amount: number
          commission_month: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          referral_id: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Update: {
          affiliate_id?: string
          amount?: number
          commission_month?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          referral_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          affiliate_id: string
          business_id: string
          created_at: string
          id: string
        }
        Insert: {
          affiliate_id: string
          business_id: string
          created_at?: string
          id?: string
        }
        Update: {
          affiliate_id?: string
          business_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          affiliate_code: string
          created_at: string
          full_name: string | null
          id: string
          payout_method: string | null
          payout_name: string | null
          payout_number: string | null
          phone: string | null
          status: Database["public"]["Enums"]["affiliate_status"]
          total_earnings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          created_at?: string
          full_name?: string | null
          id?: string
          payout_method?: string | null
          payout_name?: string | null
          payout_number?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_earnings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          created_at?: string
          full_name?: string | null
          id?: string
          payout_method?: string | null
          payout_name?: string | null
          payout_number?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_earnings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          max_offline_days: number
          subscription_price: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          id?: string
          max_offline_days?: number
          subscription_price?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          id?: string
          max_offline_days?: number
          subscription_price?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          business_id: string | null
          changes: Json | null
          created_at: string
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          business_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          business_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      business_cashiers: {
        Row: {
          auth_user_id: string
          business_id: string
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          auth_user_id: string
          business_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          auth_user_id?: string
          business_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          created_at: string
          custom_tax_name: string | null
          custom_tax_rate: number | null
          email: string | null
          id: string
          is_locked: boolean
          last_sync_at: string
          logo_url: string | null
          name: string
          payment_code: string
          phone: string | null
          plan_tier: string | null
          subscription_expires_at: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tax_mode: string
          tpin: string | null
          trial_started_at: string
          updated_at: string
          user_id: string
          vat_number: string | null
          vat_rate: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          custom_tax_name?: string | null
          custom_tax_rate?: number | null
          email?: string | null
          id?: string
          is_locked?: boolean
          last_sync_at?: string
          logo_url?: string | null
          name: string
          payment_code: string
          phone?: string | null
          plan_tier?: string | null
          subscription_expires_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_mode?: string
          tpin?: string | null
          trial_started_at?: string
          updated_at?: string
          user_id: string
          vat_number?: string | null
          vat_rate?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          custom_tax_name?: string | null
          custom_tax_rate?: number | null
          email?: string | null
          id?: string
          is_locked?: boolean
          last_sync_at?: string
          logo_url?: string | null
          name?: string
          payment_code?: string
          phone?: string | null
          plan_tier?: string | null
          subscription_expires_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_mode?: string
          tpin?: string | null
          trial_started_at?: string
          updated_at?: string
          user_id?: string
          vat_number?: string | null
          vat_rate?: number
        }
        Relationships: []
      }
      debtor_payments: {
        Row: {
          amount: number
          created_at: string
          debtor_id: string
          id: string
          notes: string | null
          payment_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          debtor_id: string
          id?: string
          notes?: string | null
          payment_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          debtor_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debtor_payments_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
        ]
      }
      debtors: {
        Row: {
          amount_owed: number
          amount_paid: number
          business_id: string
          created_at: string
          customer_name: string
          customer_phone: string | null
          due_date: string | null
          id: string
          notes: string | null
          sale_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_owed: number
          amount_paid?: number
          business_id: string
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_owed?: number
          amount_paid?: number
          business_id?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debtors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debtors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debtors_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          expense_date: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          is_active: boolean
          message: string
          starts_at: string
          target_business_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          starts_at?: string
          target_business_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          starts_at?: string
          target_business_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_target_business_id_fkey"
            columns: ["target_business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_target_business_id_fkey"
            columns: ["target_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          business_id: string
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          business_id: string
          category: string | null
          cost_price: number | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          item_type: string
          minimum_stock: number
          name: string
          parent_id: string | null
          price: number
          stock: number
          tax_category: string
          updated_at: string
          variant_label: string | null
        }
        Insert: {
          barcode?: string | null
          business_id: string
          category?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          minimum_stock?: number
          name: string
          parent_id?: string | null
          price: number
          stock?: number
          tax_category?: string
          updated_at?: string
          variant_label?: string | null
        }
        Update: {
          barcode?: string | null
          business_id?: string
          category?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          minimum_stock?: number
          name?: string
          parent_id?: string | null
          price?: number
          stock?: number
          tax_category?: string
          updated_at?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          created_at: string
          discount_type: string | null
          discount_value: number
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          quotation_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          business_id: string
          converted_sale_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_tpin: string | null
          deleted_at: string | null
          discount_amount: number
          discount_type: string | null
          discount_value: number
          expiry_date: string | null
          id: string
          notes: string | null
          quotation_number: string
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          converted_sale_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tpin?: string | null
          deleted_at?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quotation_number: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          converted_sale_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tpin?: string | null
          deleted_at?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quotation_number?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_converted_sale_id_fkey"
            columns: ["converted_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          recorded_by: string | null
          sale_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          sale_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          balance_due: number
          business_id: string
          cashier_id: string | null
          cashier_name: string | null
          cashier_username: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          customer_tpin: string | null
          discount_amount: number
          discount_type: string | null
          due_date: string | null
          exempt_amount: number
          id: string
          invoice_number: string | null
          items: Json
          offline_id: string | null
          payment_method: string
          payment_status: Database["public"]["Enums"]["sale_payment_status"]
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          synced: boolean
          tax_amount: number
          taxable_amount: number
          total: number
          zero_rated_amount: number
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          business_id: string
          cashier_id?: string | null
          cashier_name?: string | null
          cashier_username?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          customer_tpin?: string | null
          discount_amount?: number
          discount_type?: string | null
          due_date?: string | null
          exempt_amount?: number
          id?: string
          invoice_number?: string | null
          items: Json
          offline_id?: string | null
          payment_method: string
          payment_status?: Database["public"]["Enums"]["sale_payment_status"]
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          synced?: boolean
          tax_amount?: number
          taxable_amount?: number
          total: number
          zero_rated_amount?: number
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          business_id?: string
          cashier_id?: string | null
          cashier_name?: string | null
          cashier_username?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          customer_tpin?: string | null
          discount_amount?: number
          discount_type?: string | null
          due_date?: string | null
          exempt_amount?: number
          id?: string
          invoice_number?: string | null
          items?: Json
          offline_id?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["sale_payment_status"]
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          synced?: boolean
          tax_amount?: number
          taxable_amount?: number
          total?: number
          zero_rated_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_requests: {
        Row: {
          adjustment_type: string
          business_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          requested_by: string
          requester_name: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          adjustment_type: string
          business_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          requested_by: string
          requester_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          adjustment_type?: string
          business_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          requested_by?: string
          requester_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referred_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_requests_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      affiliate_referred_businesses: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_stock_adjustment: {
        Args: { p_note?: string; p_request_id: string }
        Returns: string
      }
      convert_quotation_to_sale: {
        Args: { p_payment_method?: string; p_quotation_id: string }
        Returns: string
      }
      create_quotation_with_items: {
        Args: { p_business_id: string; p_header: Json; p_items: Json }
        Returns: string
      }
      expire_business_if_due: {
        Args: { _business_id: string }
        Returns: boolean
      }
      generate_affiliate_code: { Args: never; Returns: string }
      generate_payment_code: { Args: never; Returns: string }
      generate_quotation_number: { Args: { biz_id: string }; Returns: string }
      get_affiliate_by_code: { Args: { code: string }; Returns: string }
      get_my_business_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      is_cashier_of_business: {
        Args: { _business_id: string }
        Returns: boolean
      }
      lookup_business_by_code: { Args: { _code: string }; Returns: string }
      owns_business: { Args: { _business_id: string }; Returns: boolean }
      record_sale_payment: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_method?: string
          p_sale_id: string
        }
        Returns: string
      }
      reject_stock_adjustment: {
        Args: { p_note?: string; p_request_id: string }
        Returns: string
      }
      sync_offline_sale: {
        Args: {
          p_amount_paid?: number
          p_business_id: string
          p_created_at?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_customer_tpin?: string
          p_discount_amount?: number
          p_discount_type?: string
          p_due_date?: string
          p_exempt_amount?: number
          p_items: Json
          p_offline_id: string
          p_payment_method?: string
          p_subtotal: number
          p_tax_amount?: number
          p_taxable_amount?: number
          p_total: number
          p_zero_rated_amount?: number
        }
        Returns: string
      }
    }
    Enums: {
      affiliate_status: "pending" | "active" | "suspended"
      app_role: "business_owner" | "super_admin" | "cashier"
      commission_status: "pending" | "paid"
      payment_status: "pending" | "approved" | "rejected"
      quotation_status:
        | "draft"
        | "sent"
        | "approved"
        | "rejected"
        | "expired"
        | "converted"
      sale_payment_status: "paid" | "pending" | "partially_paid" | "overdue"
      sale_status: "completed" | "refunded" | "partially_refunded"
      subscription_status: "trial" | "active" | "expired" | "locked"
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
      affiliate_status: ["pending", "active", "suspended"],
      app_role: ["business_owner", "super_admin", "cashier"],
      commission_status: ["pending", "paid"],
      payment_status: ["pending", "approved", "rejected"],
      quotation_status: [
        "draft",
        "sent",
        "approved",
        "rejected",
        "expired",
        "converted",
      ],
      sale_payment_status: ["paid", "pending", "partially_paid", "overdue"],
      sale_status: ["completed", "refunded", "partially_refunded"],
      subscription_status: ["trial", "active", "expired", "locked"],
    },
  },
} as const
