SELECT category, COUNT(*) as cnt, MIN("errorMessage") as sample_msg
FROM "SyncIssue"
WHERE source='udesc'
GROUP BY category
ORDER BY cnt DESC;
