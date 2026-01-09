talde_pelotari (
  taldea_id INTEGER,
  pelotari_id INTEGER,
  denboraldia_id INTEGER
)
SELECT *
FROM kategoria
WHERE adin_min <= ? AND adin_max >= ?
