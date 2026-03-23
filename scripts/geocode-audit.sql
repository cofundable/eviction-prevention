-- Geocoding audit: missing geocodes and cases with multiple tenant addresses

-- Cases where no tenant address was successfully matched
SELECT
  'Missing geocode' AS issue,
  COUNT(DISTINCT c.id) AS case_count
FROM cases c
JOIN case_parties cp ON cp.case_id = c.id
JOIN addresses a ON a.id = cp.address_id
WHERE cp.party_type = 'tenant'
  AND a.street IS NOT NULL
  AND a.city IS NOT NULL
AND c.id NOT IN (
    SELECT DISTINCT cp2.case_id
    FROM case_parties cp2
    JOIN addresses a2 ON a2.id = cp2.address_id
    WHERE cp2.party_type = 'tenant'
      AND a2.geocode_match_status = 'Match'
  )

UNION ALL

-- Cases with more than one distinct tenant address
SELECT
  'Multiple tenant addresses' AS issue,
  COUNT(*) AS case_count
FROM (
  SELECT c.id
  FROM cases c
  JOIN case_parties cp ON cp.case_id = c.id
  WHERE cp.party_type = 'tenant'
    AND cp.address_id IS NOT NULL
  GROUP BY c.id
  HAVING COUNT(DISTINCT cp.address_id) > 1
);
