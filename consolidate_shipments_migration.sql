-- =====================================================
-- SIMS - CONSOLIDATE ALL SHIPMENTS INTO inspection_boxes
-- Run each numbered section in order, in the Supabase SQL editor.
-- Nothing is dropped: jan_2026_inspection_boxes, mar_2026_inspection_boxes,
-- and jun_2026_inspection_boxes are left untouched as a backup.
-- =====================================================

-- =====================================================
-- 0. SANITY CHECK — confirm RLS state before you start
-- (the app works today via the anon key, so this should already
-- be permissive; just confirming nothing surprises you mid-migration)
-- =====================================================
select relrowsecurity as rls_enabled
from pg_class
where relname = 'inspection_boxes';

-- =====================================================
-- 1. VERIFY / SET shipment ON EXISTING inspection_boxes ROWS
-- =====================================================
-- Run this first to see what's already there:
select shipment, count(*) from public.inspection_boxes group by shipment order by 1;

-- If the output shows blank/NULL for all current rows, they are the
-- original "NOV 2025" shipment — label them:
update public.inspection_boxes
set shipment = 'NOV 2025'
where shipment is null or shipment = '';

-- =====================================================
-- 2. FIX THE UNIQUE CONSTRAINT to be shipment-scoped
-- The existing constraint (BoxNum, ContainerNum) has no shipment
-- scoping, which would reject legitimate box-number reuse across
-- different shipments once we merge them into one table.
-- =====================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'inspection_boxes_boxnum_containernum_key'
    ) THEN
        ALTER TABLE public.inspection_boxes
        DROP CONSTRAINT inspection_boxes_boxnum_containernum_key;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'inspection_boxes_shipment_container_box_key'
    ) THEN
        ALTER TABLE public.inspection_boxes
        ADD CONSTRAINT inspection_boxes_shipment_container_box_key
        UNIQUE (shipment, "ContainerNum", "BoxNum");
    END IF;
END $$;

-- =====================================================
-- 2.5. CHECK FOR DUPLICATE (ContainerNum, BoxNum) WITHIN EACH SHARDED
-- TABLE before migrating. These are likely leftovers from the old
-- upload_to_supabase.py script, whose upsert conflict key included
-- BoxName — so re-running it after a BoxName typo fix would have left
-- both the old and corrected row in place instead of merging them.
-- Run this first and inspect the output before touching step 3.
-- =====================================================
select 'jan_2026' as source_table, "ContainerNum", "BoxNum", count(*), array_agg(id) as ids
from public.jan_2026_inspection_boxes
group by "ContainerNum", "BoxNum"
having count(*) > 1
union all
select 'mar_2026', "ContainerNum", "BoxNum", count(*), array_agg(id)
from public.mar_2026_inspection_boxes
group by "ContainerNum", "BoxNum"
having count(*) > 1
union all
select 'jun_2026', "ContainerNum", "BoxNum", count(*), array_agg(id)
from public.jun_2026_inspection_boxes
group by "ContainerNum", "BoxNum"
having count(*) > 1;

-- For the specific case that already surfaced, look at the actual rows:
select * from public.jan_2026_inspection_boxes
where "ContainerNum" = '36' and "BoxNum" = '36-8';

-- =====================================================
-- 3. MIGRATE THE 3 SHARDED TABLES IN
-- (omit "id" so inspection_boxes generates fresh ids — no collisions)
-- =====================================================
insert into public.inspection_boxes
    (shipment, "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
     "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies")
select
    'JAN 2026', "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
    "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies"
from public.jan_2026_inspection_boxes;

insert into public.inspection_boxes
    (shipment, "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
     "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies")
select
    'MAR 2026', "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
    "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies"
from public.mar_2026_inspection_boxes;

insert into public.inspection_boxes
    (shipment, "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
     "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies")
select
    'JUN 2026', "NO", "ContainerNum", "BoxNum", "Container", "BoxName",
    "ItemCount", "Kits", "Factory", "REMARKS", "CompletionDate", updated_at, "Discrepancies"
from public.jun_2026_inspection_boxes;

-- =====================================================
-- 4. VERIFY — row counts should line up
-- =====================================================
select
    (select count(*) from public.inspection_boxes) as combined_total,
    (select count(*) from public.jan_2026_inspection_boxes)
      + (select count(*) from public.mar_2026_inspection_boxes)
      + (select count(*) from public.jun_2026_inspection_boxes)
      + (select count(*) from public.inspection_boxes where shipment = 'NOV 2025') as expected_total;

select shipment, count(*) from public.inspection_boxes group by shipment order by 1;

-- Spot-check a few rows per shipment:
select * from public.inspection_boxes where shipment = 'JAN 2026' limit 5;
select * from public.inspection_boxes where shipment = 'MAR 2026' limit 5;
select * from public.inspection_boxes where shipment = 'JUN 2026' limit 5;

-- =====================================================
-- The 3 old sharded tables (jan_2026_inspection_boxes,
-- mar_2026_inspection_boxes, jun_2026_inspection_boxes) are left as-is.
-- Once you've confirmed the app works correctly against the
-- consolidated inspection_boxes table for a while, you can drop them
-- manually — this migration does not do that for you.
-- =====================================================
