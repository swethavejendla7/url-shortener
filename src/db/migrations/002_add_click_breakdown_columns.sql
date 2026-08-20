-- Ambiguous scenario: "know where our clicks are coming from" was interpreted
-- as referrer + browser/OS breakdown (not IP geolocation). See
-- docs/scenarios/03-ambiguous.md for the interpretation and its trade-offs.
ALTER TABLE clicks ADD COLUMN browser TEXT;
ALTER TABLE clicks ADD COLUMN os TEXT;
