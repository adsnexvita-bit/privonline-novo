ALTER TABLE public.categories
  ALTER COLUMN color SET DEFAULT '#ff5c00';

UPDATE public.categories
SET color = '#ff5c00'
WHERE lower(color) = '#ff003c';
