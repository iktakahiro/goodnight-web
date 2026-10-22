CREATE TABLE `form_definitions` (
	`version` integer PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`restored_from` integer
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `form_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_submissions_version_created` ON `submissions` (`form_version`,`created_at`);