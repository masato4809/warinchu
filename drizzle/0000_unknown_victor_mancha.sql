CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_token` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_edit_token_unique` ON `groups` (`edit_token`);