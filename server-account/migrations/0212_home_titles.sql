-- BARDS' GUILD: a home renamed with Favor Tokens (server-account/src/bardServices.js). The title is the owner's own
-- name for the home - the door's plate shows it over "Your home" / "<owner>'s home". NULL: never renamed.
ALTER TABLE homes ADD COLUMN title TEXT;
