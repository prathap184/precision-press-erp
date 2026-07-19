const fs = require('fs');
const path = require('path');

const orderComponentsDir = path.join(__dirname, '../src/components/orders');
const dashComponentsDir = path.join(__dirname, '../src/components/dashboard');

function updateWorkspace(file, baseSize, isDense) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    if (isDense) {
        // Admin, Manager, ACDEMA, Accountant
        content = content.replace(/text-\[1\dpx\]/g, (m) => {
            if (m === 'text-[12px]' || m === 'text-[13px]' || m === 'text-[14px]' || m === 'text-[16px]') return m;
            return 'text-[13px]';
        });
        content = content.replace(/<table([^>]*)className="([^"]*?)"/gi, (match, p1, p2) => {
            if (!p2.includes('text-')) return `<table${p1}className="${p2} text-[13px]"`;
            return `<table${p1}className="${p2.replace(/text-\[[^\]]+\]|text-sm|text-xs/g, 'text-[13px]')}"`;
        });
    } else if (baseSize === 15) {
        // Printer, Pasting, Dispatch, Delivery
        content = content.replace(/text-\[12px\]/g, 'text-[14px]'); // Headers
        content = content.replace(/text-\[13px\]/g, 'text-[15px]'); // Data
        content = content.replace(/text-\[14px\]/g, 'text-[16px]'); // Large Data
        content = content.replace(/text-sm/g, 'text-[15px]');
        content = content.replace(/text-xs/g, 'text-[14px]');
        
        content = content.replace(/<table([^>]*)className="([^"]*?)"/gi, (match, p1, p2) => {
            if (!p2.includes('text-')) return `<table${p1}className="${p2} text-[15px]"`;
            return match;
        });
    } else if (baseSize === 14) {
        // Designer
        content = content.replace(/text-\[12px\]/g, 'text-[13px]');
        content = content.replace(/text-\[13px\]/g, 'text-[14px]');
        content = content.replace(/text-xs/g, 'text-[13px]');
        content = content.replace(/text-sm/g, 'text-[14px]');
    }

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated role sizes in: ${file}`);
    }
}

// Printer/Pasting
updateWorkspace(path.join(orderComponentsDir, 'PrinterOrderWorkspace.tsx'), 15, false);
updateWorkspace(path.join(orderComponentsDir, 'PastingOrderWorkspace.tsx'), 15, false);
updateWorkspace(path.join(orderComponentsDir, 'FinishingOrderWorkspace.tsx'), 15, false);

// Designer
updateWorkspace(path.join(orderComponentsDir, 'DesignerOrderWorkspace.tsx'), 14, false);

// Manager/Admin
updateWorkspace(path.join(orderComponentsDir, 'ManagerOrderWorkspace.tsx'), 13, true);

// Dashboards (Manager/Delivery)
updateWorkspace(path.join(dashComponentsDir, 'DeliveryGlobalOrders.tsx'), 15, false);
updateWorkspace(path.join(dashComponentsDir, 'DeliveryDeliveredOrders.tsx'), 15, false);
updateWorkspace(path.join(dashComponentsDir, 'DeliveryPendingOrders.tsx'), 15, false);

console.log('Done role updates.');
