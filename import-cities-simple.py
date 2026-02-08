#!/usr/bin/env python3
"""
Script simplifié pour importer les communes françaises
Utilise l'API REST de Supabase directement
"""

import requests
import zipfile
import io
import csv

# CONFIGURATION
# IMPORTANT: Replace with your actual Supabase project values
SUPABASE_URL = "https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key-here"

MIN_POPULATION = 50
BATCH_SIZE = 500

def download_geonames():
    """Télécharge les données GeoNames pour la France"""
    print(">> Telechargement des donnees GeoNames...")
    url = "http://download.geonames.org/export/dump/FR.zip"
    response = requests.get(url, stream=True)
    response.raise_for_status()

    print(">> Extraction...")
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        with z.open('FR.txt') as f:
            content = f.read().decode('utf-8')

    return content

def parse_cities(content, min_population):
    """Parse et filtre les villes"""
    print(f">> Parsing (population >= {min_population})...")
    cities = []

    for line in content.split('\n'):
        if not line:
            continue

        fields = line.split('\t')
        if len(fields) < 19:
            continue

        feature_class = fields[6]
        feature_code = fields[7]

        if feature_class == 'P' and feature_code.startswith('PPL'):
            try:
                population = int(fields[14]) if fields[14] else 0
                if population >= min_population:
                    cities.append({
                        'name': fields[1].strip(),
                        'latitude': round(float(fields[4]), 8),
                        'longitude': round(float(fields[5]), 8),
                        'population': population
                    })
            except (ValueError, IndexError):
                continue

    cities.sort(key=lambda x: x['population'], reverse=True)
    print(f"OK - {len(cities)} villes trouvees")
    return cities

def insert_cities(cities, batch_size):
    """Insère les villes dans Supabase via API REST"""
    print(f">> Insertion de {len(cities)} villes...")

    headers = {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'
    }

    url = f"{SUPABASE_URL}/rest/v1/cities"
    total_batches = (len(cities) + batch_size - 1) // batch_size

    for i in range(0, len(cities), batch_size):
        batch = cities[i:i+batch_size]
        batch_num = i // batch_size + 1

        try:
            response = requests.post(url, json=batch, headers=headers)
            # 409 Conflict is OK when using ignore-duplicates
            if response.status_code in [200, 201, 409]:
                print(f"  OK - Batch {batch_num}/{total_batches} ({len(batch)} villes)")
            else:
                response.raise_for_status()
        except Exception as e:
            print(f"  ERREUR batch {batch_num}: {e}")

    print("OK - Import termine!")

def main():
    print("=" * 60)
    print("Import des communes francaises")
    print("=" * 60)
    print()

    try:
        # Télécharger et parser
        content = download_geonames()
        cities = parse_cities(content, MIN_POPULATION)

        # Aperçu
        print("\n>> Top 10:")
        for i, city in enumerate(cities[:10], 1):
            print(f"  {i}. {city['name']:30} - {city['population']:>10,} hab")

        # Confirmation
        print(f"\n!! Insertion de {len(cities)} villes en cours...")

        # Insertion
        insert_cities(cities, BATCH_SIZE)

        # Vérification
        headers = {'apikey': SUPABASE_SERVICE_ROLE_KEY}
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/cities?select=count",
            headers={**headers, 'Prefer': 'count=exact'}
        )
        count = response.headers.get('Content-Range', '0').split('/')[-1]
        print(f"\nOK - Total : {count} villes")

    except KeyboardInterrupt:
        print("\nANNULE")
    except Exception as e:
        print(f"ERREUR: {e}")

if __name__ == "__main__":
    main()
