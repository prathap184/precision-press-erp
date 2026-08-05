import glob

def replace_in_files(pattern, old_str, new_str):
    files = glob.glob(pattern, recursive=True)
    for f in files:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        if old_str in content:
            content = content.replace(old_str, new_str)
            with open(f, 'w', encoding='utf-8') as file:
                file.write(content)
            print(f'Updated {f}')

banking_dir = r'C:\Users\jprat\OneDrive\Desktop\Hindustan Enterprices\precision-press-erp\src\app\(dashboard)\accounting\banking\[id]\(detail)\**\*.tsx'
replace_in_files(banking_dir, 'from "../layout"', 'from "../bank-account-context"')
replace_in_files(banking_dir, 'from "./layout"', 'from "./bank-account-context"')

contacts_dir = r'C:\Users\jprat\OneDrive\Desktop\Hindustan Enterprices\precision-press-erp\src\app\(dashboard)\accounting\contacts\[id]\**\*.tsx'
replace_in_files(contacts_dir, 'from "../layout"', 'from "../contact-context"')
replace_in_files(contacts_dir, 'from "./layout"', 'from "./contact-context"')
