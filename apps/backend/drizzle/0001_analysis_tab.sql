CREATE TABLE `analysis_thread_jira` (
	`session_id` text NOT NULL,
	`jira_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `jira_key`)
);
--> statement-breakpoint
CREATE TABLE `analysis_threads` (
	`session_id` text PRIMARY KEY NOT NULL,
	`workspace_id` integer NOT NULL,
	`title` text,
	`cwd` text NOT NULL,
	`add_dirs_json` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`started` integer DEFAULT false NOT NULL,
	`turns` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`event_seq` integer DEFAULT 0 NOT NULL,
	`last_branch` text,
	`last_own_activity` integer DEFAULT 0 NOT NULL,
	`turn_entry_count` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_threads_workspace` ON `analysis_threads` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `analysis_workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`context_md` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
