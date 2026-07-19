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
        callback(data as Order[]);
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
        callback(data as Order[]);
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