#!/usr/bin/env python3
"""
Script pour importer toutes les communes françaises dans Supabase
Source de données : GeoNames (gratuit et officiel)
"""

import requests
import zipfile
import io
import csv
from supabase import create_client, Client

# ============================================
# CONFIGURATION - À MODIFIER
# ============================================
SUPABASE_URL = "https://your-project-id.supabase.co"  # Remplacez par votre URL
SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key-here"  # Clé service_role (pas anon!)

# ============================================
# SCRIPT
# ============================================

def download_and_extract_geonames():
    """Télécharge et extrait les données GeoNames pour la France"""
    print("📥 Téléchargement des données GeoNames pour la France...")
    url = "http://download.geonames.org/export/dump/FR.zip"

    response = requests.get(url, stream=True)
    response.raise_for_status()

    print("📦 Extraction du fichier ZIP...")
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        with z.open('FR.txt') as f:
            content = f.read().decode('utf-8')

    return content

def parse_geonames_data(content, min_population=50):
    """Parse les données GeoNames et filtre les villes"""
    print(f"🔍 Parsing des données (population min: {min_population})...")

    cities = []
    reader = csv.reader(content.split('\n'), delimiter='\t')

    for row in reader:
        if len(row) < 19:
            continue

        # Format GeoNames:
        # 0: geonameid, 1: name, 4: latitude, 5: longitude,
        # 6: feature_class, 7: feature_code, 14: population

        feature_class = row[6]
        feature_code = row[7]

        # Filtrer uniquement les lieux habités (P = Populated place)
        # PPL = ville, PPLA = capitale admin, PPLC = capitale pays, etc.
        if feature_class == 'P' and feature_code.startswith('PPL'):
            try:
                population = int(row[14]) if row[14] else 0

                # Filtrer les très petites communes si désiré
                if population >= min_population:
                    cities.append({
                        'name': row[1].strip(),
                        'latitude': round(float(row[4]), 8),
                        'longitude': round(float(row[5]), 8),
                        'population': population
                    })
            except (ValueError, IndexError):
                continue

    # Trier par population (les plus grandes en premier)
    cities.sort(key=lambda x: x['population'], reverse=True)

    print(f"✅ {len(cities)} villes trouvées")
    return cities

def insert_cities_to_supabase(cities, supabase: Client, batch_size=500):
    """Insère les villes dans Supabase par batch"""
    print(f"📤 Insertion de {len(cities)} villes dans Supabase...")

    total_batches = (len(cities) + batch_size - 1) // batch_size

    for i in range(0, len(cities), batch_size):
        batch = cities[i:i+batch_size]
        batch_num = i // batch_size + 1

        try:
            # Utiliser upsert pour éviter les doublons
            supabase.table('cities').upsert(
                batch,
                on_conflict='name'
            ).execute()

            print(f"  ✓ Batch {batch_num}/{total_batches} inséré ({len(batch)} villes)")

        except Exception as e:
            print(f"  ✗ Erreur batch {batch_num}: {e}")
            # Continuer avec le batch suivant

    print("✅ Import terminé!")

def main():
    print("=" * 60)
    print("🇫🇷 Import des communes françaises dans Supabase")
    print("=" * 60)
    print()

    # Vérifier la configuration
    if "votre-projet" in SUPABASE_URL or "votre-service" in SUPABASE_SERVICE_ROLE_KEY:
        print("❌ ERREUR : Veuillez configurer SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY")
        print("   dans le script avant de l'exécuter.")
        return

    # Créer le client Supabase
    print("🔌 Connexion à Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    try:
        # Télécharger les données
        content = download_and_extract_geonames()

        # Parser les données (min_population=0 pour tout importer, ou 100 pour filtrer)
        cities = parse_geonames_data(content, min_population=50)

        # Afficher un aperçu
        print("\n📊 Aperçu des 10 plus grandes villes:")
        for i, city in enumerate(cities[:10], 1):
            print(f"  {i}. {city['name']:30} - {city['population']:>10,} habitants")

        # Confirmation
        print(f"\n⚠️  Prêt à insérer {len(cities)} villes dans Supabase")
        response = input("Continuer ? (oui/non) : ").strip().lower()

        if response in ['oui', 'o', 'y', 'yes']:
            # Insérer dans Supabase
            insert_cities_to_supabase(cities, supabase)

            # Vérification
            result = supabase.table('cities').select('count', count='exact').execute()
            total = result.count if hasattr(result, 'count') else '?'
            print(f"\n✅ Total de villes dans la base : {total}")
        else:
            print("❌ Import annulé")

    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur de téléchargement : {e}")
    except Exception as e:
        print(f"❌ Erreur : {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
