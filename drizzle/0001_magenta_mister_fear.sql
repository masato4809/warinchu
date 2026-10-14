CREATE TABLE `user_groups` (
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`encrypted_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `group_id`)
);
--> statement-breakpoint
CREATE INDEX `user_groups_user_updated_idx` ON `user_groups` (`user_id`,`updated_at`);