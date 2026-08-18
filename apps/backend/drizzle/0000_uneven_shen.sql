CREATE TABLE `sessions` (
	`chat_id` integer PRIMARY KEY NOT NULL,
	`telegram_user_id` integer NOT NULL,
	`project` text,
	`workspace` text,
	`claude_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jira_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jira_url` text NOT NULL,
	`jira_key` text NOT NULL,
	`jira_project` text NOT NULL,
	`jira_issue_id` text,
	`title` text,
	`responsible` text,
	`sprint` text,
	`group` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jira_issues_jira_url_unique` ON `jira_issues` (`jira_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `jira_issues_jira_key_unique` ON `jira_issues` (`jira_key`);--> statement-breakpoint
CREATE TABLE `merge_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gitlab_url` text NOT NULL,
	`gitlab_project` text NOT NULL,
	`gitlab_mr_iid` integer NOT NULL,
	`jira_issue_id` integer,
	`author` text,
	`title` text,
	`status` text NOT NULL,
	`error_message` text,
	`current_review_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`jira_issue_id`) REFERENCES `jira_issues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merge_requests_gitlab_url_unique` ON `merge_requests` (`gitlab_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `merge_requests_gitlab_project_gitlab_mr_iid_unique` ON `merge_requests` (`gitlab_project`,`gitlab_mr_iid`);--> statement-breakpoint
CREATE INDEX `idx_merge_requests_status` ON `merge_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_merge_requests_updated_at` ON `merge_requests` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_merge_requests_jira_issue_id` ON `merge_requests` (`jira_issue_id`);--> statement-breakpoint
CREATE TABLE `mr_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merge_request_id` integer NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`business_understanding` text,
	`technical_analysis` text,
	`test_analysis` text,
	`findings_json` text,
	`recommendations_json` text,
	`raw_result` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`merge_request_id`) REFERENCES `merge_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mr_reviews_mr_id` ON `mr_reviews` (`merge_request_id`);--> statement-breakpoint
CREATE TABLE `jira_issues_synced` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jira_key` text NOT NULL,
	`summary` text NOT NULL,
	`labels` text,
	`priority` text NOT NULL,
	`sprint` text,
	`group` text,
	`assignee` text,
	`status` text NOT NULL,
	`jira_updated_at` text,
	`synced_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jira_issues_synced_jira_key_unique` ON `jira_issues_synced` (`jira_key`);--> statement-breakpoint
CREATE TABLE `jira_review_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gitlab_url` text NOT NULL,
	`status` text NOT NULL,
	`verdict` text,
	`summary` text,
	`findings_json` text,
	`exec_by` text NOT NULL,
	`console_log` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_jira_review_runs_gitlab_url` ON `jira_review_runs` (`gitlab_url`);