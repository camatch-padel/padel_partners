-- Migration pour ajouter la géolocalisation (latitude/longitude)
-- À exécuter dans la console SQL de Supabase

-- 1. Ajouter latitude/longitude à la table courts
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- 2. Créer la table cities avec les principales villes françaises
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  population INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. Ajouter la colonne population si elle n'existe pas (pour les tables existantes)
ALTER TABLE cities
ADD COLUMN IF NOT EXISTS population INTEGER;

-- 3. Activer RLS pour la table cities
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

-- Supprimer la policy si elle existe déjà
DROP POLICY IF EXISTS "Anyone can view cities" ON cities;

-- Créer la policy
CREATE POLICY "Anyone can view cities" ON cities FOR SELECT USING (true);

-- 4. Créer un index sur le nom de ville pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);

-- 5. Remplir avec les 100 plus grandes villes de France
INSERT INTO cities (name, latitude, longitude, population) VALUES
  -- Top 20
  ('Paris', 48.8566, 2.3522, 2165423),
  ('Marseille', 43.2965, 5.3698, 869815),
  ('Lyon', 45.7640, 4.8357, 513275),
  ('Toulouse', 43.6047, 1.4442, 471941),
  ('Nice', 43.7102, 7.2620, 341522),
  ('Nantes', 47.2184, -1.5536, 303382),
  ('Strasbourg', 48.5734, 7.7521, 277270),
  ('Montpellier', 43.6108, 3.8767, 277639),
  ('Bordeaux', 44.8378, -0.5792, 249712),
  ('Lille', 50.6292, 3.0573, 231491),
  ('Rennes', 48.1173, -1.6778, 216268),
  ('Reims', 49.2583, 4.0317, 182460),
  ('Le Havre', 49.4944, 0.1079, 170352),
  ('Saint-Étienne', 45.4397, 4.3872, 172565),
  ('Toulon', 43.1242, 5.9280, 171953),
  ('Grenoble', 45.1885, 5.7245, 158454),
  ('Dijon', 47.3220, 5.0415, 155090),
  ('Angers', 47.4784, -0.5632, 151520),
  ('Nîmes', 43.8367, 4.3601, 150610),
  ('Villeurbanne', 45.7667, 4.8833, 148543),

  -- Villes 21-50
  ('Le Mans', 48.0077, 0.1984, 143599),
  ('Aix-en-Provence', 43.5297, 5.4474, 142482),
  ('Clermont-Ferrand', 45.7772, 3.0870, 141569),
  ('Brest', 48.3905, -4.4860, 139163),
  ('Limoges', 45.8336, 1.2611, 133627),
  ('Tours', 47.3941, 0.6848, 136463),
  ('Amiens', 49.8941, 2.2958, 133755),
  ('Perpignan', 42.6886, 2.8948, 121934),
  ('Metz', 49.1193, 6.1757, 116429),
  ('Besançon', 47.2380, 6.0243, 116914),
  ('Boulogne-Billancourt', 48.8352, 2.2400, 117931),
  ('Orléans', 47.9029, 1.9093, 114644),
  ('Mulhouse', 47.7508, 7.3359, 108942),
  ('Rouen', 49.4432, 1.0993, 110145),
  ('Caen', 49.1829, -0.3707, 105512),
  ('Nancy', 48.6921, 6.1844, 104885),
  ('Argenteuil', 48.9474, 2.2466, 110210),
  ('Montreuil', 48.8634, 2.4432, 105351),
  ('Saint-Denis', 48.9362, 2.3574, 109983),
  ('Roubaix', 50.6942, 3.1746, 96412),

  -- Villes 51-80
  ('Tourcoing', 50.7236, 3.1609, 97476),
  ('Nanterre', 48.8925, 2.2069, 93509),
  ('Vitry-sur-Seine', 48.7873, 2.3933, 92124),
  ('Créteil', 48.7906, 2.4555, 90590),
  ('Avignon', 43.9493, 4.8055, 91143),
  ('Poitiers', 46.5802, 0.3404, 88665),
  ('Aubervilliers', 48.9146, 2.3838, 86501),
  ('Asnières-sur-Seine', 48.9145, 2.2852, 86512),
  ('Colombes', 48.9226, 2.2539, 85199),
  ('Aulnay-sous-Bois', 48.9534, 2.4994, 85740),
  ('La Rochelle', 46.1591, -1.1520, 76711),
  ('Rueil-Malmaison', 48.8773, 2.1799, 78794),
  ('Antibes', 43.5808, 7.1239, 73794),
  ('Saint-Maur-des-Fossés', 48.8007, 2.4979, 75008),
  ('Champigny-sur-Marne', 48.8173, 2.4995, 76726),
  ('Dunkerque', 51.0343, 2.3768, 87353),
  ('Beziers', 43.3440, 3.2150, 76493),
  ('Cannes', 43.5528, 7.0174, 73868),
  ('Saint-Nazaire', 47.2737, -2.2135, 70675),
  ('Colmar', 48.0790, 7.3581, 69105),

  -- Villes 81-100
  ('Calais', 50.9513, 1.8587, 72509),
  ('Bourges', 47.0844, 2.3964, 65787),
  ('Pau', 43.2951, -0.3708, 77130),
  ('La Seyne-sur-Mer', 43.1009, 5.8783, 63713),
  ('Mérignac', 44.8411, -0.6463, 69202),
  ('Saint-Quentin', 49.8484, 3.2874, 54788),
  ('Valence', 44.9334, 4.8924, 62481),
  ('Troyes', 48.2973, 4.0744, 61996),
  ('Niort', 46.3236, -0.4650, 58707),
  ('Chambéry', 45.5646, 5.9178, 58919),
  ('Lorient', 47.7482, -3.3700, 57662),
  ('Sarcelles', 48.9983, 2.3781, 57979),
  ('Saint-Brieuc', 48.5145, -2.7608, 45207),
  ('Villejuif', 48.7893, 2.3654, 54793),
  ('Le Blanc-Mesnil', 48.9357, 2.4608, 55028),
  ('Beauvais', 49.4295, 2.0807, 54881),
  ('Épinay-sur-Seine', 48.9545, 2.3091, 54279),
  ('Maisons-Alfort', 48.8054, 2.4389, 54817),
  ('Cholet', 47.0621, -0.8792, 54204),
  ('Évry-Courcouronnes', 48.6289, 2.4272, 69709)
ON CONFLICT (name) DO NOTHING;

-- 6. Mettre à jour les coordonnées des courts existants
UPDATE courts SET latitude = 48.8445, longitude = 2.2945 WHERE name = 'Padel Club Paris 15';
UPDATE courts SET latitude = 45.7640, longitude = 4.8357 WHERE name = 'Green Padel Lyon';
UPDATE courts SET latitude = 43.7102, longitude = 7.2620 WHERE name = 'Padel Riviera Nice';
UPDATE courts SET latitude = 43.6047, longitude = 1.4442 WHERE name = 'Urban Padel Toulouse';
UPDATE courts SET latitude = 43.2965, longitude = 5.3698 WHERE name = 'Padel Nation Marseille';
UPDATE courts SET latitude = 44.8378, longitude = -0.5792 WHERE name = 'Padel Center Bordeaux';
UPDATE courts SET latitude = 50.6292, longitude = 3.0573 WHERE name = 'Padel Arena Lille';
UPDATE courts SET latitude = 47.2184, longitude = -1.5536 WHERE name = 'Padel Sport Nantes';

-- 7. Créer une fonction pour calculer la distance entre deux points (formule de Haversine)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DECIMAL, lon1 DECIMAL,
  lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  r DECIMAL := 6371; -- Rayon de la Terre en km
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);

  a := sin(dlat/2) * sin(dlat/2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlon/2) * sin(dlon/2);

  c := 2 * atan2(sqrt(a), sqrt(1-a));

  RETURN r * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
