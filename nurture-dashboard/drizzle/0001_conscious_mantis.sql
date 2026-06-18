CREATE TABLE `bot_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`severity` varchar(16) NOT NULL DEFAULT 'info',
	`category` varchar(64) NOT NULL DEFAULT 'healer_run',
	`message` text NOT NULL,
	`detail` text,
	`autoFixable` int NOT NULL DEFAULT 0,
	`runId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_observations_id` PRIMARY KEY(`id`)
);
