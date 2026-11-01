-- Run this ONLY if you already have the earlier CampusFind notifications table.
USE campusfind;
ALTER TABLE notifications ADD COLUMN message TEXT NULL AFTER kind;
ALTER TABLE notifications ADD COLUMN read_at DATETIME NULL AFTER message;
