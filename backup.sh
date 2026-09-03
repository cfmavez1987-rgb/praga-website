#!/bin/bash
# Backup Firebase products to local JSON file
# Usage: ./backup.sh

DIR="$(cd "$(dirname "$0")" && pwd)/backups"
mkdir -p "$DIR"

curl -s "https://firestore.googleapis.com/v1/projects/praga-store/databases/(default)/documents/products" | python3 -c "
import json,sys,os
from datetime import datetime

data=json.load(sys.stdin)
docs=data.get('documents',[])
products=[]

for doc in docs:
    d=doc['fields']
    p={}
    for key, val in d.items():
        if 'stringValue' in val: p[key] = val['stringValue']
        elif 'integerValue' in val: p[key] = int(val['integerValue'])
        elif 'doubleValue' in val: p[key] = val['doubleValue']
        elif 'booleanValue' in val: p[key] = val['booleanValue']
    products.append(p)

products.sort(key=lambda x: int(x.get('id',0)) if str(x.get('id','')).isdigit() else 0)

backup={
    'timestamp': datetime.now().isoformat(),
    'count': len(products),
    'products': products
}

backup_dir='$DIR'
filename='products_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.json'
filepath=os.path.join(backup_dir, filename)

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(backup, f, ensure_ascii=False, indent=2)

latest=os.path.join(backup_dir, 'products_latest.json')
with open(latest, 'w', encoding='utf-8') as f:
    json.dump(backup, f, ensure_ascii=False, indent=2)

print(f'Backup: {filepath}')
print(f'Products: {len(products)}')
"

# Keep only last 10 backups
ls -t "$DIR"/products_2*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
