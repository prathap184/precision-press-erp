import os

files = [
    r'src\app\(dashboard)\accounting\banking\[id]\(detail)\imports\page.tsx',
    r'src\app\(dashboard)\accounting\banking\[id]\(detail)\ledger\page.tsx',
    r'src\app\(dashboard)\accounting\banking\[id]\(detail)\page.tsx',
    r'src\app\(dashboard)\accounting\banking\[id]\(detail)\settings\page.tsx',
    r'src\app\(dashboard)\accounting\banking\[id]\(detail)\transactions\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\activity\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\bookkeeping\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\files\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\people\page.tsx',
    r'src\app\(dashboard)\accounting\contacts\[id]\statement\page.tsx',
]

for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        old = content
        if 'banking' in f:
            content = content.replace('from "../layout"', 'from "../bank-account-context"')
            content = content.replace('from "./layout"', 'from "./bank-account-context"')
        else:
            content = content.replace('from "../layout"', 'from "../contact-context"')
            content = content.replace('from "./layout"', 'from "./contact-context"')
            
        if old != content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(content)
            print(f'Updated {f}')
    except Exception as e:
        print(f'Error processing {f}: {e}')
