CREATE TYPE "public"."border_event_source" AS ENUM('gps', 'manual_admin');--> statement-breakpoint
CREATE TYPE "public"."border_event_type" AS ENUM('entered_buffer', 'crossed_boundary', 're_entered', 'confirmed_exit');--> statement-breakpoint
CREATE TYPE "public"."geofence_type" AS ENUM('country_border', 'port_zone', 'airport_zone', 'checkpoint_buffer');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('electronics', 'textiles', 'machinery', 'agriculture', 'general');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending_export', 'in_transit', 'approaching_exit', 'exited_pending_confirmation', 'export_confirmed', 'exception');--> statement-breakpoint
CREATE TYPE "public"."shipping_method" AS ENUM('sea_freight', 'air_freight', 'land_border', 'courier');--> statement-breakpoint
CREATE TYPE "public"."tracker_status" AS ENUM('active', 'idle', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."tracker_type" AS ENUM('gps', 'iot_ble', 'rfid_gps');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"telegram_chat_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "export_border_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_export_id" uuid NOT NULL,
	"geofence_id" uuid NOT NULL,
	"event_type" "border_event_type" NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"source" "border_event_source" NOT NULL,
	"confirmed_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "export_geofences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "geofence_type" NOT NULL,
	"country_code" text NOT NULL,
	"polygon" jsonb NOT NULL,
	"buffer_meters" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"result" jsonb,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shipment_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_category" "product_category" NOT NULL,
	"product_description" text NOT NULL,
	"quantity" integer,
	"weight_kg" numeric(12, 3),
	"shipment_reference" text,
	"container_number" text,
	"destination_country" text NOT NULL,
	"shipping_method" "shipping_method" NOT NULL,
	"status" "shipment_status" DEFAULT 'pending_export' NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"origin_captured_at" timestamp NOT NULL,
	"expected_export_date" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"title" text,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_chats_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "tracker_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"previous_status" "tracker_status",
	"new_status" "tracker_status" NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_tracker_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"tracker_type" "tracker_type" NOT NULL,
	"status" "tracker_status" DEFAULT 'inactive' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trackers_external_tracker_id_unique" UNIQUE("external_tracker_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_telegram_chats" ADD CONSTRAINT "customer_telegram_chats_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_telegram_chats" ADD CONSTRAINT "customer_telegram_chats_telegram_chat_id_telegram_chats_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_border_events" ADD CONSTRAINT "export_border_events_shipment_export_id_shipment_exports_id_fk" FOREIGN KEY ("shipment_export_id") REFERENCES "public"."shipment_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_border_events" ADD CONSTRAINT "export_border_events_geofence_id_export_geofences_id_fk" FOREIGN KEY ("geofence_id") REFERENCES "public"."export_geofences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_border_events" ADD CONSTRAINT "export_border_events_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_exports" ADD CONSTRAINT "shipment_exports_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_exports" ADD CONSTRAINT "shipment_exports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_exports" ADD CONSTRAINT "shipment_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_events" ADD CONSTRAINT "tracker_events_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_status_history" ADD CONSTRAINT "tracker_status_history_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_telegram_chat_uniq_idx" ON "customer_telegram_chats" USING btree ("customer_id","telegram_chat_id");--> statement-breakpoint
CREATE INDEX "export_border_events_shipment_export_id_idx" ON "export_border_events" USING btree ("shipment_export_id");--> statement-breakpoint
CREATE INDEX "shipment_exports_status_idx" ON "shipment_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipment_exports_tracker_id_idx" ON "shipment_exports" USING btree ("tracker_id");--> statement-breakpoint
CREATE INDEX "tracker_events_tracker_id_idx" ON "tracker_events" USING btree ("tracker_id");--> statement-breakpoint
CREATE INDEX "tracker_events_recorded_at_idx" ON "tracker_events" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "tracker_events_tracker_id_recorded_at_idx" ON "tracker_events" USING btree ("tracker_id","recorded_at");