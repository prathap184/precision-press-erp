import re

with open('src/components/dashboard/create-drawer.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any `<SheetContent className="sm:max-w-something ` with `<SheetContent className="sm:max-w-[80vw] `
content = re.sub(
    r'<SheetContent className="sm:max-w-[a-zA-Z0-9\[\]]+',
    '<SheetContent className="sm:max-w-[80vw]',
    content
)

with open('src/components/dashboard/create-drawer.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
