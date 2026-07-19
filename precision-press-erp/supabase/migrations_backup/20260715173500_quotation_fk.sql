ALTER TABLE public.quotations 
  ADD CONSTRAINT fk_quotations_customer_id 
  FOREIGN KEY (customer_id) 
  REFERENCES public.profiles(id) 
  ON DELETE RESTRICT;
