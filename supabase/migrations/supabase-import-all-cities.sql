-- Script pour importer toutes les communes françaises (36 000+)
-- Sources de données : GeoNames ou data.gouv.fr

-- Option 1 : Via l'API GeoNames (gratuit, pas de clé API nécessaire)
-- Documentation : https://www.geonames.org/export/web-services.html

-- Option 2 : Import CSV depuis data.gouv.fr
-- Télécharger : https://www.data.gouv.fr/fr/datasets/base-officielle-des-codes-postaux/

-- ========================================
-- MÉTHODE 1 : Import CSV manuel via Supabase Dashboard
-- ========================================
-- 1. Téléchargez le fichier CSV des communes françaises
-- 2. Dans Supabase Dashboard > Table Editor > cities > Import data
-- 3. Mappez les colonnes : name, latitude, longitude, population

-- ========================================
-- MÉTHODE 2 : Script SQL avec données GeoNames
-- ========================================

-- 1. Créer une table temporaire pour l'import
CREATE TEMP TABLE IF NOT EXISTS temp_french_cities (
  geoname_id INTEGER,
  name TEXT,
  ascii_name TEXT,
  alternate_names TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  feature_class TEXT,
  feature_code TEXT,
  country_code TEXT,
  cc2 TEXT,
  admin1_code TEXT,
  admin2_code TEXT,
  admin3_code TEXT,
  admin4_code TEXT,
  population BIGINT,
  elevation INTEGER,
  dem INTEGER,
  timezone TEXT,
  modification_date DATE
);

-- 2. Importer les données (exemple avec COPY - nécessite accès superuser)
-- Note: Cette commande ne fonctionnera que si vous avez téléchargé le fichier FR.txt de GeoNames
-- COPY temp_french_cities FROM '/path/to/FR.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER false);

-- 3. Insérer dans la table cities (filtre sur les villes/villages uniquement)
INSERT INTO cities (name, latitude, longitude, population)
SELECT
  name,
  latitude,
  longitude,
  CAST(population AS INTEGER)
FROM temp_french_cities
WHERE
  feature_class = 'P' -- P = Populated place (ville, village, hameau)
  AND country_code = 'FR'
  AND population > 0 -- Optionnel : filtrer les très petits hameaux
ON CONFLICT (name) DO NOTHING;

-- 4. Nettoyer
DROP TABLE IF EXISTS temp_french_cities;

-- ========================================
-- MÉTHODE 3 : Script Python pour peupler automatiquement (Recommandé)
-- ========================================
-- Créez un fichier import_cities.py et exécutez-le en local

/*
import requests
import csv
from supabase import create_client, Client

# Configuration Supabase
SUPABASE_URL = "votre_url_supabase"
SUPABASE_KEY = "votre_cle_service_role"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Télécharger les données GeoNames pour la France
url = "http://download.geonames.org/export/dump/FR.zip"
print("Téléchargement des données GeoNames...")

# Extraire et parser le fichier FR.txt
# Format: geonameid, name, asciiname, alternatenames, latitude, longitude, ...

cities_to_insert = []
with open('FR.txt', 'r', encoding='utf-8') as f:
    reader = csv.reader(f, delimiter='\t')
    for row in reader:
        # row[6] = feature_class, row[7] = feature_code
        if row[6] == 'P' and int(row[14]) > 100:  # Populated place avec population > 100
            cities_to_insert.append({
                'name': row[1],
                'latitude': float(row[4]),
                'longitude': float(row[5]),
                'population': int(row[14]) if row[14] else 0
            })

# Insérer par batch de 1000
print(f"Insertion de {len(cities_to_insert)} villes...")
batch_size = 1000
for i in range(0, len(cities_to_insert), batch_size):
    batch = cities_to_insert[i:i+batch_size]
    try:
        supabase.table('cities').upsert(batch, on_conflict='name').execute()
        print(f"Batch {i//batch_size + 1} inséré")
    except Exception as e:
        print(f"Erreur: {e}")

print("Import terminé!")
*/

-- ========================================
-- ALTERNATIVE : SQL pur avec les 500 plus grandes villes (compromis)
-- ========================================
-- Si l'import complet est trop complexe, voici un script avec 500 villes
-- qui couvre ~90% de la population française

-- Commandes utiles après l'import :
-- Vérifier le nombre de villes importées
SELECT COUNT(*) FROM cities;

-- Vérifier les villes autour de Paris (test)
SELECT name, latitude, longitude, population
FROM cities
WHERE latitude BETWEEN 48.0 AND 49.0
  AND longitude BETWEEN 2.0 AND 3.0
ORDER BY population DESC
LIMIT 20;

-- Créer un index spatial pour optimiser les recherches de distance
CREATE INDEX IF NOT EXISTS idx_cities_location ON cities (latitude, longitude);

-- Créer un index sur la population pour des recherches plus rapides
CREATE INDEX IF NOT EXISTS idx_cities_population ON cities (population DESC);
