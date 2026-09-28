export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string;
          admin_user_id: string | null;
          created_at: string;
          details: Json | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
        };
        Insert: {
          action: string;
          admin_user_id?: string | null;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
        };
        Update: {
          action?: string;
          admin_user_id?: string | null;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          auth_user_id: string;
          created_at: string;
          email: string;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          color: string;
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          icon_name: string | null;
          icon_path: string | null;
          is_active: boolean;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          icon_name?: string | null;
          icon_path?: string | null;
          is_active?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          icon_name?: string | null;
          icon_path?: string | null;
          is_active?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      category_models: {
        Row: {
          category_id: string;
          created_at: string;
          display_order: number;
          is_featured: boolean;
          model_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          display_order?: number;
          is_featured?: boolean;
          model_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          display_order?: number;
          is_featured?: boolean;
          model_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_models_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
        ];
      };
      cpf_access_attempts: {
        Row: {
          attempted_at: string;
          cpf_hash: string;
          id: string;
          success: boolean;
        };
        Insert: {
          attempted_at?: string;
          cpf_hash: string;
          id?: string;
          success?: boolean;
        };
        Update: {
          attempted_at?: string;
          cpf_hash?: string;
          id?: string;
          success?: boolean;
        };
        Relationships: [];
      };
      customer_access: {
        Row: {
          access_status: Database["public"]["Enums"]["access_status"];
          customer_id: string;
          expires_at: string | null;
          granted_at: string;
          id: string;
          model_id: string;
          order_id: string | null;
          plan_id: string | null;
          revocation_reason: string | null;
          revoked_at: string | null;
        };
        Insert: {
          access_status?: Database["public"]["Enums"]["access_status"];
          customer_id: string;
          expires_at?: string | null;
          granted_at?: string;
          id?: string;
          model_id: string;
          order_id?: string | null;
          plan_id?: string | null;
          revocation_reason?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          access_status?: Database["public"]["Enums"]["access_status"];
          customer_id?: string;
          expires_at?: string | null;
          granted_at?: string;
          id?: string;
          model_id?: string;
          order_id?: string | null;
          plan_id?: string | null;
          revocation_reason?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_access_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_access_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_access_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_access_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_access_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_sessions: {
        Row: {
          created_at: string;
          customer_id: string;
          expires_at: string;
          id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          expires_at?: string;
          id?: string;
          token: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          expires_at?: string;
          id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_sessions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          cpf: string;
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          name: string;
          normalized_phone: string | null;
          phone: string | null;
          message_opt_in: boolean;
          message_opt_in_updated_at: string | null;
          password_created_at: string | null;
          password_hash: string | null;
          password_salt: string | null;
        };
        Insert: {
          cpf: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          normalized_phone?: string | null;
          phone?: string | null;
          message_opt_in?: boolean;
          message_opt_in_updated_at?: string | null;
          password_created_at?: string | null;
          password_hash?: string | null;
          password_salt?: string | null;
        };
        Update: {
          cpf?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          normalized_phone?: string | null;
          phone?: string | null;
          message_opt_in?: boolean;
          message_opt_in_updated_at?: string | null;
          password_created_at?: string | null;
          password_hash?: string | null;
          password_salt?: string | null;
        };
        Relationships: [];
      };
      customer_phone_identities: {
        Row: { normalized_phone: string; customer_id: string; created_at: string };
        Insert: { normalized_phone: string; customer_id: string; created_at?: string };
        Update: { normalized_phone?: string; customer_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "customer_phone_identities_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_access_attempts: {
        Row: { id: string; phone_hash: string; attempted_at: string; success: boolean };
        Insert: { id?: string; phone_hash: string; attempted_at?: string; success?: boolean };
        Update: { id?: string; phone_hash?: string; attempted_at?: string; success?: boolean };
        Relationships: [];
      };
      free_demonstrations: {
        Row: {
          created_at: string;
          demonstration_type: Database["public"]["Enums"]["demonstration_type"];
          display_order: number;
          file_path: string;
          id: string;
          is_active: boolean;
          thumbnail_path: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          demonstration_type: Database["public"]["Enums"]["demonstration_type"];
          display_order?: number;
          file_path: string;
          id?: string;
          is_active?: boolean;
          thumbnail_path?: string | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          demonstration_type?: Database["public"]["Enums"]["demonstration_type"];
          display_order?: number;
          file_path?: string;
          id?: string;
          is_active?: boolean;
          thumbnail_path?: string | null;
          title?: string | null;
        };
        Relationships: [];
      };
      media_likes: {
        Row: {
          created_at: string;
          customer_id?: string | null;
          id: string;
          media_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          id?: string;
          media_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          id?: string;
          media_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_likes_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_likes_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "model_media";
            referencedColumns: ["id"];
          },
        ];
      };
      model_media: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          file_path: string;
          id: string;
          is_free_preview: boolean;
          like_count: number;
          comment_count: number;
          media_type: Database["public"]["Enums"]["media_type"];
          model_id: string;
          preview_path: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          file_path: string;
          id?: string;
          is_free_preview?: boolean;
          like_count?: number;
          comment_count?: number;
          media_type: Database["public"]["Enums"]["media_type"];
          model_id: string;
          preview_path?: string | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          file_path?: string;
          id?: string;
          is_free_preview?: boolean;
          like_count?: number;
          comment_count?: number;
          media_type?: Database["public"]["Enums"]["media_type"];
          model_id?: string;
          preview_path?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "model_media_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "model_media_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
        ];
      };
      model_previews: {
        Row: {
          comment_count: number;
          created_at: string;
          display_order: number;
          file_path: string;
          id: string;
          like_count: number;
          media_type: Database["public"]["Enums"]["media_type"];
          model_id: string;
          title: string | null;
        };
        Insert: {
          comment_count?: number;
          created_at?: string;
          display_order?: number;
          file_path: string;
          id?: string;
          like_count?: number;
          media_type: Database["public"]["Enums"]["media_type"];
          model_id: string;
          title?: string | null;
        };
        Update: {
          comment_count?: number;
          created_at?: string;
          display_order?: number;
          file_path?: string;
          id?: string;
          like_count?: number;
          media_type?: Database["public"]["Enums"]["media_type"];
          model_id?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "model_previews_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "model_previews_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
        ];
      };
      models: {
        Row: {
          authorization_document_path: string | null;
          consent_notes: string | null;
          community_button_text: string | null;
          community_description: string | null;
          community_enabled: boolean;
          community_telegram_url: string | null;
          community_title: string | null;
          cover_image_path: string | null;
          created_at: string;
          display_order: number;
          full_description: string | null;
          id: string;
          id_document_path: string | null;
          image_authorization_signed: boolean;
          instagram_enabled: boolean;
          instagram_profile_image_url: string | null;
          instagram_url: string | null;
          is_active: boolean;
          is_age_verified: boolean;
          is_featured: boolean;
          show_in_library: boolean;
          name: string;
          photo_count: number;
          paid_audio_enabled: boolean;
          paid_audio_path: string | null;
          paid_audio_title: string | null;
          price: number;
          public_audio_enabled: boolean;
          public_audio_path: string | null;
          public_audio_title: string | null;
          profile_cover_image_path: string | null;
          profile_image_path: string | null;
          short_description: string | null;
          slug: string;
          updated_at: string;
          username: string;
          video_count: number;
        };
        Insert: {
          authorization_document_path?: string | null;
          consent_notes?: string | null;
          community_button_text?: string | null;
          community_description?: string | null;
          community_enabled?: boolean;
          community_telegram_url?: string | null;
          community_title?: string | null;
          cover_image_path?: string | null;
          created_at?: string;
          display_order?: number;
          full_description?: string | null;
          id?: string;
          id_document_path?: string | null;
          image_authorization_signed?: boolean;
          instagram_enabled?: boolean;
          instagram_profile_image_url?: string | null;
          instagram_url?: string | null;
          is_active?: boolean;
          is_age_verified?: boolean;
          is_featured?: boolean;
          show_in_library?: boolean;
          name: string;
          photo_count?: number;
          paid_audio_enabled?: boolean;
          paid_audio_path?: string | null;
          paid_audio_title?: string | null;
          price?: number;
          public_audio_enabled?: boolean;
          public_audio_path?: string | null;
          public_audio_title?: string | null;
          profile_cover_image_path?: string | null;
          profile_image_path?: string | null;
          short_description?: string | null;
          slug: string;
          updated_at?: string;
          username: string;
          video_count?: number;
        };
        Update: {
          authorization_document_path?: string | null;
          consent_notes?: string | null;
          community_button_text?: string | null;
          community_description?: string | null;
          community_enabled?: boolean;
          community_telegram_url?: string | null;
          community_title?: string | null;
          cover_image_path?: string | null;
          created_at?: string;
          display_order?: number;
          full_description?: string | null;
          id?: string;
          id_document_path?: string | null;
          image_authorization_signed?: boolean;
          instagram_enabled?: boolean;
          instagram_profile_image_url?: string | null;
          instagram_url?: string | null;
          is_active?: boolean;
          is_age_verified?: boolean;
          is_featured?: boolean;
          show_in_library?: boolean;
          name?: string;
          photo_count?: number;
          paid_audio_enabled?: boolean;
          paid_audio_path?: string | null;
          paid_audio_title?: string | null;
          price?: number;
          public_audio_enabled?: boolean;
          public_audio_path?: string | null;
          public_audio_title?: string | null;
          profile_cover_image_path?: string | null;
          profile_image_path?: string | null;
          short_description?: string | null;
          slug?: string;
          updated_at?: string;
          username?: string;
          video_count?: number;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          is_order_bump: boolean;
          model_id: string;
          order_id: string;
          unit_price: number;
        };
        Insert: {
          id?: string;
          is_order_bump?: boolean;
          model_id: string;
          order_id: string;
          unit_price: number;
        };
        Update: {
          id?: string;
          is_order_bump?: boolean;
          model_id?: string;
          order_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_attributions: {
        Row: {
          ad_id: string | null;
          adset_id: string | null;
          campaign_id: string | null;
          created_at: string;
          fbc: string | null;
          fbclid: string | null;
          fbp: string | null;
          id: string;
          order_id: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
        };
        Insert: {
          ad_id?: string | null;
          adset_id?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          fbc?: string | null;
          fbclid?: string | null;
          fbp?: string | null;
          id?: string;
          order_id: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Update: {
          ad_id?: string | null;
          adset_id?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          fbc?: string | null;
          fbclid?: string | null;
          fbp?: string | null;
          id?: string;
          order_id?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_attributions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_models: {
        Row: {
          created_at: string;
          id: string;
          model_id: string;
          promotion_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          model_id: string;
          promotion_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          model_id?: string;
          promotion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_models_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_order_bump_models: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          model_id: string;
          price_override: number | null;
          promotion_id: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          model_id: string;
          price_override?: number | null;
          promotion_id: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          model_id?: string;
          price_override?: number | null;
          promotion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_order_bump_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_order_bump_models_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      promotions: {
        Row: {
          access_type: string;
          badge_color: string | null;
          badge_text: string | null;
          benefits_color: string | null;
          benefits_text: string | null;
          button_color: string | null;
          button_text_color: string | null;
          card_border_color: string | null;
          complementary_color: string | null;
          created_at: string;
          cta_text: string;
          description: string | null;
          urgency_text: string | null;
          complementary_text: string | null;
          countdown_bg_color: string | null;
          countdown_text_color: string | null;
          show_countdown: boolean;
          duration_days: number | null;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          name: string;
          original_price: number | null;
          price_color: string | null;
          order_bump_default_price: number;
          order_bump_description: string;
          order_bump_enabled: boolean;
          order_bump_max_visible: number;
          order_bump_title: string;
          promotional_price: number;
          starts_at: string;
          title: string;
          title_color: string | null;
          subtitle_color: string | null;
          updated_at: string;
        };
        Insert: {
          access_type?: string;
          badge_color?: string | null;
          badge_text?: string | null;
          benefits_color?: string | null;
          benefits_text?: string | null;
          button_color?: string | null;
          button_text_color?: string | null;
          card_border_color?: string | null;
          complementary_color?: string | null;
          created_at?: string;
          cta_text?: string;
          description?: string | null;
          urgency_text?: string | null;
          complementary_text?: string | null;
          countdown_bg_color?: string | null;
          countdown_text_color?: string | null;
          show_countdown?: boolean;
          duration_days?: number | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          original_price?: number | null;
          price_color?: string | null;
          order_bump_default_price?: number;
          order_bump_description?: string;
          order_bump_enabled?: boolean;
          order_bump_max_visible?: number;
          order_bump_title?: string;
          promotional_price: number;
          starts_at: string;
          title: string;
          title_color?: string | null;
          subtitle_color?: string | null;
          updated_at?: string;
        };
        Update: {
          access_type?: string;
          badge_color?: string | null;
          badge_text?: string | null;
          benefits_color?: string | null;
          benefits_text?: string | null;
          button_color?: string | null;
          button_text_color?: string | null;
          card_border_color?: string | null;
          complementary_color?: string | null;
          created_at?: string;
          cta_text?: string;
          description?: string | null;
          urgency_text?: string | null;
          complementary_text?: string | null;
          countdown_bg_color?: string | null;
          countdown_text_color?: string | null;
          show_countdown?: boolean;
          duration_days?: number | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          original_price?: number | null;
          price_color?: string | null;
          order_bump_default_price?: number;
          order_bump_description?: string;
          order_bump_enabled?: boolean;
          order_bump_max_visible?: number;
          order_bump_title?: string;
          promotional_price?: number;
          starts_at?: string;
          title?: string;
          title_color?: string | null;
          subtitle_color?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          created_at: string;
          customer_id: string | null;
          id: string;
          paid_at: string | null;
          plan_id: string | null;
          plan_offer_id: string | null;
          promotion_id: string | null;
          payment_method: string | null;
          payment_confirmed_by: string | null;
          payment_last_checked_at: string | null;
          payment_provider: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          total_amount: number;
          transaction_identifier: string | null;
          checkout_name: string | null;
          checkout_phone: string | null;
          message_opt_in: boolean;
          normalized_phone: string | null;
          checkout_token: string | null;
          password_setup_consumed_at: string | null;
          password_setup_expires_at: string | null;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          paid_at?: string | null;
          plan_id?: string | null;
          plan_offer_id?: string | null;
          promotion_id?: string | null;
          payment_method?: string | null;
          payment_confirmed_by?: string | null;
          payment_last_checked_at?: string | null;
          payment_provider?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          total_amount: number;
          transaction_identifier?: string | null;
          checkout_name?: string | null;
          checkout_phone?: string | null;
          message_opt_in?: boolean;
          normalized_phone?: string | null;
          checkout_token?: string | null;
          password_setup_consumed_at?: string | null;
          password_setup_expires_at?: string | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          paid_at?: string | null;
          plan_id?: string | null;
          plan_offer_id?: string | null;
          promotion_id?: string | null;
          payment_method?: string | null;
          payment_confirmed_by?: string | null;
          payment_last_checked_at?: string | null;
          payment_provider?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          total_amount?: number;
          transaction_identifier?: string | null;
          checkout_name?: string | null;
          checkout_phone?: string | null;
          message_opt_in?: boolean;
          normalized_phone?: string | null;
          checkout_token?: string | null;
          password_setup_consumed_at?: string | null;
          password_setup_expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_plan_offer_id_fkey";
            columns: ["plan_offer_id"];
            isOneToOne: false;
            referencedRelation: "plan_offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_offers: {
        Row: {
          created_at: string;
          display_order: number;
          duration_days: number;
          id: string;
          is_active: boolean;
          is_highlighted: boolean;
          is_primary: boolean;
          button_color: string | null;
          plan_id: string;
          price: number;
          tag_color: string | null;
          tag_text: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          duration_days: number;
          id?: string;
          is_active?: boolean;
          is_highlighted?: boolean;
          is_primary?: boolean;
          button_color?: string | null;
          plan_id: string;
          price: number;
          tag_color?: string | null;
          tag_text?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          duration_days?: number;
          id?: string;
          is_active?: boolean;
          is_highlighted?: boolean;
          is_primary?: boolean;
          button_color?: string | null;
          plan_id?: string;
          price?: number;
          tag_color?: string | null;
          tag_text?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_offers_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_models: {
        Row: {
          created_at: string;
          model_id: string;
          plan_id: string;
        };
        Insert: {
          created_at?: string;
          model_id: string;
          plan_id: string;
        };
        Update: {
          created_at?: string;
          model_id?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: true;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_models_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: true;
            referencedRelation: "models_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_models_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          access_type: string;
          created_at: string;
          duration_days: number | null;
          eyebrow_text: string | null;
          id: string;
          is_active: boolean;
          is_featured: boolean;
          name: string;
          price: number;
          promo_tag_color: string | null;
          promo_tag_text: string | null;
          updated_at: string;
        };
        Insert: {
          access_type?: string;
          created_at?: string;
          duration_days?: number | null;
          eyebrow_text?: string | null;
          id?: string;
          is_active?: boolean;
          is_featured?: boolean;
          name: string;
          price?: number;
          promo_tag_color?: string | null;
          promo_tag_text?: string | null;
          updated_at?: string;
        };
        Update: {
          access_type?: string;
          created_at?: string;
          duration_days?: number | null;
          eyebrow_text?: string | null;
          id?: string;
          is_active?: boolean;
          is_featured?: boolean;
          name?: string;
          price?: number;
          promo_tag_color?: string | null;
          promo_tag_text?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      meta_conversion_attempts: {
        Row: {
          attempt_number: number;
          attempted_at: string;
          delivery_status: string;
          error_message: string | null;
          event_id: string;
          events_received: number | null;
          http_status: number | null;
          id: string;
          order_id: string;
          response_request_id: string | null;
        };
        Insert: {
          attempt_number: number;
          attempted_at?: string;
          delivery_status: string;
          error_message?: string | null;
          event_id: string;
          events_received?: number | null;
          http_status?: number | null;
          id?: string;
          order_id: string;
          response_request_id?: string | null;
        };
        Update: {
          attempt_number?: number;
          attempted_at?: string;
          delivery_status?: string;
          error_message?: string | null;
          event_id?: string;
          events_received?: number | null;
          http_status?: number | null;
          id?: string;
          order_id?: string;
          response_request_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_conversion_attempts_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_conversion_events: {
        Row: {
          attempts: number;
          created_at: string;
          delivery_status: string;
          error_message: string | null;
          event_id: string;
          event_name: string;
          id: string;
          last_attempt_at: string | null;
          order_id: string;
          provider: string;
          response_payload: Json | null;
          response_request_id: string | null;
          sent_at: string | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          delivery_status?: string;
          error_message?: string | null;
          event_id: string;
          event_name?: string;
          id?: string;
          last_attempt_at?: string | null;
          order_id: string;
          provider?: string;
          response_payload?: Json | null;
          response_request_id?: string | null;
          sent_at?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivery_status?: string;
          error_message?: string | null;
          event_id?: string;
          event_name?: string;
          id?: string;
          last_attempt_at?: string | null;
          order_id?: string;
          provider?: string;
          response_payload?: Json | null;
          response_request_id?: string | null;
          sent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meta_conversion_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_ads_settings: {
        Row: {
          id: boolean;
          test_mode: boolean;
          test_event_code: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          test_mode?: boolean;
          test_event_code?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          test_mode?: boolean;
          test_event_code?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          attempts: number;
          error_message: string | null;
          event_type: string;
          gateway_status: string | null;
          external_event_id: string | null;
          id: string;
          payload: Json;
          processed_at: string | null;
          processing_status: Database["public"]["Enums"]["webhook_processing_status"];
          provider: string;
          received_at: string;
          transaction_identifier: string | null;
        };
        Insert: {
          attempts?: number;
          error_message?: string | null;
          event_type: string;
          gateway_status?: string | null;
          external_event_id?: string | null;
          id?: string;
          payload: Json;
          processed_at?: string | null;
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"];
          provider: string;
          received_at?: string;
          transaction_identifier?: string | null;
        };
        Update: {
          attempts?: number;
          error_message?: string | null;
          event_type?: string;
          gateway_status?: string | null;
          external_event_id?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"];
          provider?: string;
          received_at?: string;
          transaction_identifier?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      models_public: {
        Row: {
          cover_image_path: string | null;
          created_at: string | null;
          custom_photo_count: number | null;
          custom_posts_count: number | null;
          custom_video_count: number | null;
          display_order: number | null;
          full_description: string | null;
          has_community_bonus: boolean | null;
          id: string | null;
          instagram_enabled: boolean | null;
          instagram_profile_image_url: string | null;
          instagram_url: string | null;
          is_featured: boolean | null;
          show_in_library: boolean | null;
          name: string | null;
          photo_count: number | null;
          price: number | null;
          public_audio_enabled: boolean | null;
          public_audio_path: string | null;
          public_audio_title: string | null;
          profile_cover_image_path: string | null;
          profile_image_path: string | null;
          short_description: string | null;
          slug: string | null;
          username: string | null;
          video_count: number | null;
        };
        Insert: {
          cover_image_path?: string | null;
          created_at?: string | null;
          custom_photo_count?: number | null;
          custom_posts_count?: number | null;
          custom_video_count?: number | null;
          display_order?: number | null;
          full_description?: string | null;
          has_community_bonus?: boolean | null;
          id?: string | null;
          instagram_enabled?: boolean | null;
          instagram_profile_image_url?: string | null;
          instagram_url?: string | null;
          is_featured?: boolean | null;
          show_in_library?: boolean | null;
          name?: string | null;
          photo_count?: number | null;
          price?: number | null;
          public_audio_enabled?: boolean | null;
          public_audio_path?: string | null;
          public_audio_title?: string | null;
          profile_cover_image_path?: string | null;
          profile_image_path?: string | null;
          short_description?: string | null;
          slug?: string | null;
          username?: string | null;
          video_count?: number | null;
        };
        Update: {
          cover_image_path?: string | null;
          created_at?: string | null;
          custom_photo_count?: number | null;
          custom_posts_count?: number | null;
          custom_video_count?: number | null;
          display_order?: number | null;
          full_description?: string | null;
          has_community_bonus?: boolean | null;
          id?: string | null;
          instagram_enabled?: boolean | null;
          instagram_profile_image_url?: string | null;
          instagram_url?: string | null;
          is_featured?: boolean | null;
          show_in_library?: boolean | null;
          name?: string | null;
          photo_count?: number | null;
          price?: number | null;
          public_audio_enabled?: boolean | null;
          public_audio_path?: string | null;
          public_audio_title?: string | null;
          profile_cover_image_path?: string | null;
          profile_image_path?: string | null;
          short_description?: string | null;
          slug?: string | null;
          username?: string | null;
          video_count?: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_save_promotion: {
        Args: {
          campaign_name: string;
          participant_model_ids: string[];
          promotion_access_type: string;
          promotion_badge_color: string;
          promotion_badge_text: string;
          promotion_benefits_color: string;
          promotion_benefits_text: string;
          promotion_button_color: string;
          promotion_button_text_color: string;
          promotion_card_border_color: string;
          promotion_complementary_color: string;
          promotion_cta_text: string;
          promotion_description: string;
          promotion_urgency_text: string;
          promotion_complementary_text: string;
          promotion_countdown_bg_color: string;
          promotion_countdown_text_color: string;
          promotion_duration_days: number | null;
          promotion_ends_at: string | null;
          promotion_show_countdown: boolean;
          promotion_is_active: boolean;
          promotion_original_price: number | null;
          promotion_price_color: string;
          promotion_promotional_price: number;
          promotion_starts_at: string;
          promotion_title: string;
          promotion_title_color: string;
          promotion_subtitle_color: string;
          target_promotion_id: string | null;
        };
        Returns: string;
      };
      admin_save_promotion_order_bumps: {
        Args: {
          bump_default_price: number;
          bump_description: string;
          bump_enabled: boolean;
          bump_max_visible: number;
          bump_models: Json;
          bump_title: string;
          target_promotion_id: string;
        };
        Returns: undefined;
      };
      admin_delete_models: { Args: { p_model_ids: string[] }; Returns: number };
      is_admin: { Args: { _auth_user_id: string }; Returns: boolean };
    };
    Enums: {
      access_status: "active" | "revoked" | "expired";
      demonstration_type: "image" | "video";
      media_type: "image" | "video";
      payment_status: "pending" | "paid" | "failed" | "cancelled" | "refunded" | "chargeback";
      webhook_processing_status: "pending" | "processed" | "failed" | "ignored";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      access_status: ["active", "revoked", "expired"],
      demonstration_type: ["image", "video"],
      media_type: ["image", "video"],
      payment_status: ["pending", "paid", "failed", "cancelled", "refunded", "chargeback"],
      webhook_processing_status: ["pending", "processed", "failed", "ignored"],
    },
  },
} as const;
