-- Add schedulableDays column to rosters table
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS schedulable_days text[] DEFAULT ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

-- Update existing rows to have all days as schedulable
UPDATE rosters SET schedulable_days = ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] WHERE schedulable_days IS NULL; 