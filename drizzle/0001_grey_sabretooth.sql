CREATE TABLE `class_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`session_code` text NOT NULL,
	`day_of_week` text NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`location` text,
	`capacity` integer NOT NULL,
	`enrolled_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_sessions_course_session_unique` ON `class_sessions` (`course_code`,`session_code`);--> statement-breakpoint
CREATE INDEX `class_sessions_course_code_idx` ON `class_sessions` (`course_code`);--> statement-breakpoint
CREATE TABLE `course_requirements` (
	`requirement_id` integer NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`requirement_id`, `course_code`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_requirements_course_code_idx` ON `course_requirements` (`course_code`);--> statement-breakpoint
CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL,
	`level` integer NOT NULL,
	`is_project_course` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `degrees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`total_units` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `degrees_code_year_unique` ON `degrees` (`code`,`year`);--> statement-breakpoint
CREATE TABLE `planned_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`target_requirement_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_courses_course_code_unique` ON `planned_courses` (`course_code`);--> statement-breakpoint
CREATE INDEX `planned_courses_target_requirement_id_idx` ON `planned_courses` (`target_requirement_id`);--> statement-breakpoint
CREATE TABLE `planned_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_course_id` integer NOT NULL,
	`class_session_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`planned_course_id`) REFERENCES `planned_courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_sessions_planned_course_id_unique` ON `planned_sessions` (`planned_course_id`);--> statement-breakpoint
CREATE INDEX `planned_sessions_class_session_id_idx` ON `planned_sessions` (`class_session_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`degree_id` integer NOT NULL,
	`specialisation_id` integer,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`rule_type` text NOT NULL,
	`required_units` integer,
	FOREIGN KEY (`degree_id`) REFERENCES `degrees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`specialisation_id`) REFERENCES `specialisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_degree_key_unique` ON `requirements` (`degree_id`,`key`);--> statement-breakpoint
CREATE INDEX `requirements_degree_id_idx` ON `requirements` (`degree_id`);--> statement-breakpoint
CREATE INDEX `requirements_specialisation_id_idx` ON `requirements` (`specialisation_id`);--> statement-breakpoint
CREATE TABLE `specialisation_courses` (
	`specialisation_id` integer NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`specialisation_id`, `course_code`),
	FOREIGN KEY (`specialisation_id`) REFERENCES `specialisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `specialisations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`degree_id` integer NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`degree_id`) REFERENCES `degrees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `specialisations_degree_key_unique` ON `specialisations` (`degree_id`,`key`);