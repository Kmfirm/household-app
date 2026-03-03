-- Add source URL to recipes (for URL import feature)
alter table recipes add column if not exists source_url text;
