-- Requête pour trouver et analyser les parties à 2 joueurs
SELECT
  id,
  date,
  time_slot,
  format,
  level_min,
  level_max,
  status,
  visibility,
  court_id,
  created_at,
  -- Vérifier si visible dans recherche (filtres par défaut)
  CASE
    WHEN status != 'open' THEN '❌ Status pas open'
    WHEN level_min > 10.0 THEN '❌ level_min trop élevé'
    WHEN level_max < 1.0 THEN '❌ level_max trop bas'
    WHEN date < CURRENT_DATE THEN '❌ Date passée'
    ELSE '✅ Devrait être visible'
  END as visibilite_diagnostic
FROM matches
WHERE format = 2
ORDER BY created_at DESC
LIMIT 5;

-- Compter les participants
SELECT
  m.id,
  m.format,
  COUNT(mp.user_id) as nb_participants
FROM matches m
LEFT JOIN match_participants mp ON m.id = mp.match_id
WHERE m.format = 2
GROUP BY m.id, m.format
ORDER BY m.created_at DESC
LIMIT 5;
