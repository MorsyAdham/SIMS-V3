from supabase import create_client, Client

# ------------------ CONFIG ------------------
SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjM3Mzk3NCwiZXhwIjoyMDgxOTQ5OTc0fQ.1dncNufSiz-Y7JnkU53FHbWqFtDLJfKEAOkVG-USXgM"  # 🔴 MUST be service_role key
TABLE_NAME = "jan_2026_inspection_boxes"
# --------------------------------------------

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def delete_jan_2026_data():
    try:
        result = supabase.table(TABLE_NAME).delete().eq("shipment", "NOV_2025").execute()
        deleted_count = len(result.data) if result.data else 0
        print(f"✅ Deleted {deleted_count} rows with shipment = 'NOV_2025'")
    except Exception as e:
        print(f"❌ Failed to delete rows: {e}")

if __name__ == "__main__":
    delete_jan_2026_data()
