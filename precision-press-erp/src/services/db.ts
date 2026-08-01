import { supabase } from '@/lib/supabase';
import { Order } from '@/types/models';

export const DatabaseService = {
  listenToOrders: (callback: (data: Order[]) => void) => {
    let active = true;

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('createdAt', { ascending: false });

      if (error) {
        console.error('[DatabaseService] Error fetching orders:', error);
        return;
      }
      if (active && data) {
        // Filter out parent proxy orders (orders with no parent but multiple items)
        const filteredData = (data as Order[]).filter(
          o => (o as any).parent_order_id !== null || (Array.isArray(o.items) && o.items.length === 1)
        );
        callback(filteredData);
      }
    };

    void fetchOrders();

    const channel = supabase
      .channel('public:orders:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void fetchOrders();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  },

  listenToRecentOrders: (limit: number, callback: (data: Order[]) => void) => {
    let active = true;

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[DatabaseService] Error fetching recent orders:', error);
        return;
      }
      if (active && data) {
        // Filter out parent proxy orders (orders with no parent but multiple items)
        const filteredData = (data as Order[]).filter(
          o => (o as any).parent_order_id !== null || (Array.isArray(o.items) && o.items.length === 1)
        );
        callback(filteredData);
      }
    };

    void fetchOrders();

    const channel = supabase
      .channel('public:orders:recent')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void fetchOrders();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }
};