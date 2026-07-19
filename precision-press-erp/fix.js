const fs = require('fs');
let content = fs.readFileSync('supabase/migrations/20260623030000_fix_place_order_tx_job_queue_name.sql', 'utf8');

content = content.replace(
  /"createdAt", "updatedAt", "shippingAddress", "deliveryChoice",/g,
  '"createdAt", "updatedAt", "shippingAddress", "deliveryChoice",\n      "ref_order_id", "parent_order_id",'
);

content = content.replace(
  /p_parent_order->>'shippingAddress',\n      p_parent_order->>'deliveryChoice',/g,
  `p_parent_order->>'shippingAddress',\n      p_parent_order->>'deliveryChoice',\n      p_parent_order->>'ref_order_id',\n      p_parent_order->>'parent_order_id',`
);

content = content.replace(
  /child_val->>'shippingAddress',\n      child_val->>'deliveryChoice',/g,
  `child_val->>'shippingAddress',\n      child_val->>'deliveryChoice',\n      child_val->>'ref_order_id',\n      child_val->>'parent_order_id',`
);

fs.writeFileSync('supabase/migrations/20260715165500_update_place_order_tx_with_ref.sql', content);
console.log('done');
