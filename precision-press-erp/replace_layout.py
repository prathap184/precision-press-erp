import sys, re
file_path = r'c:\Users\jprat\OneDrive\Desktop\Hindustan Enterprices\precision-press-erp\src\components\acdema\ProxyOrderBuilderView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

customer_match = re.search(r'({\s*/\*\s*Customer Card\s*\*/\s*}[\s\S]*?)(?={\s*/\*\s*Logistics Card\s*\*/\s*})', content)
logistics_match = re.search(r'({\s*/\*\s*Logistics Card\s*\*/\s*}[\s\S]*?)(?=\s*</div>\s*</div>\s*</div>\s*</div>\s*{\s*/\*\s*Middle Row: Items Card)', content)

if customer_match and logistics_match:
    customer_html = customer_match.group(1)
    logistics_html = logistics_match.group(1)
    
    top_section = """            {/* Top Row: Image, Customer, Logistics */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1.5fr_2.5fr_2.5fr] xl:grid-cols-[1fr_2fr_2fr] items-stretch mb-2">
              {/* Image Card */}
              <div className="relative z-10 rounded-[2rem] bg-white/50 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center min-h-[200px]">
                <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white">
                  <img src={currentImage || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200'} className="absolute inset-0 w-full h-full object-cover" alt="Product preview" />
                </div>
              </div>

""" + customer_html + logistics_html + """
            </div>"""

    content = re.sub(r'{\s*/\*\s*Dynamic Product Grid\s*\*/\s*}[\s\S]*?(?=\s*</div>\s*</div>\s*</div>\s*</div>\s*{\s*/\*\s*Middle Row: Items Card)', top_section, content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success')
else:
    print('Failed')
