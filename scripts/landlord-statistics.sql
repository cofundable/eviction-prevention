-- ============================================
-- Landlord Case Statistics
-- ============================================
-- This file contains SQL queries to analyze cases filed by each landlord
-- Run these queries against your SQLite database

-- ============================================
-- Query 1: Total Cases per Landlord
-- ============================================
-- Shows the count of cases filed by each landlord
SELECT 
  cp.name AS landlord_name,
  COUNT(DISTINCT c.id) AS total_cases
FROM 
  cases c
  INNER JOIN case_parties cp ON c.id = cp.case_id
WHERE 
  cp.party_type = 'landlord'
GROUP BY 
  cp.name
ORDER BY 
  total_cases DESC;

-- ============================================
-- Query 2: Total Cases and Percentage per Landlord
-- ============================================
-- Shows both the count and percentage of total cases for each landlord
WITH landlord_case_counts AS (
  SELECT 
    cp.name AS landlord_name,
    COUNT(DISTINCT c.id) AS case_count
  FROM 
    cases c
    INNER JOIN case_parties cp ON c.id = cp.case_id
  WHERE 
    cp.party_type = 'landlord'
  GROUP BY 
    cp.name
),
total_cases AS (
  SELECT COUNT(DISTINCT id) AS total FROM cases
)
SELECT 
  lcc.landlord_name,
  lcc.case_count AS total_cases,
  ROUND(
    (lcc.case_count * 100.0 / tc.total), 
    2
  ) AS percentage_of_total_cases
FROM 
  landlord_case_counts lcc
  CROSS JOIN total_cases tc
ORDER BY 
  lcc.case_count DESC;

-- ============================================
-- Query 3: Detailed Landlord Statistics
-- ============================================
-- Includes case types and statuses for each landlord
SELECT 
  cp.name AS landlord_name,
  COUNT(DISTINCT c.id) AS total_cases,
  COUNT(DISTINCT ct.name) AS unique_case_types,
  GROUP_CONCAT(DISTINCT ct.name, ', ') AS case_types,
  GROUP_CONCAT(DISTINCT cs.name, ', ') AS case_statuses
FROM 
  cases c
  INNER JOIN case_parties cp ON c.id = cp.case_id
  LEFT JOIN case_types ct ON c.case_type_id = ct.id
  LEFT JOIN case_statuses cs ON c.case_status_id = cs.id
WHERE 
  cp.party_type = 'landlord'
GROUP BY 
  cp.name
ORDER BY 
  total_cases DESC;

-- ============================================
-- Query 4: Landlord Statistics with Address
-- ============================================
-- Includes landlord address information
SELECT 
  cp.name AS landlord_name,
  a.street,
  a.unit,
  a.city,
  a.state,
  a.zip_code,
  COUNT(DISTINCT c.id) AS total_cases,
  ROUND(
    (COUNT(DISTINCT c.id) * 100.0 / (SELECT COUNT(DISTINCT id) FROM cases)), 
    2
  ) AS percentage_of_total_cases
FROM 
  cases c
  INNER JOIN case_parties cp ON c.id = cp.case_id
  LEFT JOIN addresses a ON cp.address_id = a.id
WHERE 
  cp.party_type = 'landlord'
GROUP BY 
  cp.name, a.street, a.unit, a.city, a.state, a.zip_code
ORDER BY 
  total_cases DESC;

-- ============================================
-- Query 5: Top N Landlords (e.g., Top 10)
-- ============================================
-- Shows only the top landlords by case count
WITH landlord_case_counts AS (
  SELECT 
    cp.name AS landlord_name,
    COUNT(DISTINCT c.id) AS case_count
  FROM 
    cases c
    INNER JOIN case_parties cp ON c.id = cp.case_id
  WHERE 
    cp.party_type = 'landlord'
  GROUP BY 
    cp.name
),
total_cases AS (
  SELECT COUNT(DISTINCT id) AS total FROM cases
)
SELECT 
  lcc.landlord_name,
  lcc.case_count AS total_cases,
  ROUND(
    (lcc.case_count * 100.0 / tc.total), 
    2
  ) AS percentage_of_total_cases
FROM 
  landlord_case_counts lcc
  CROSS JOIN total_cases tc
ORDER BY 
  lcc.case_count DESC
LIMIT 10;

