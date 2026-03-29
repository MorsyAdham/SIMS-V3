import pandas as pd
from supabase import create_client, Client

# ------------------ CONFIG ------------------
SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjM3Mzk3NCwiZXhwIjoyMDgxOTQ5OTc0fQ.1dncNufSiz-Y7JnkU53FHbWqFtDLJfKEAOkVG-USXgM"  # 🔴 MUST be service_role key
TABLE_NAME = "mar_2026_inspection_boxes"
EXCEL_FILE = r"C:\Users\Victus 2\Logistics and Programming\1. Logistics\1. Shipment Files\2. shipment Reports\MAR_2026\MAR_2026_SHIPMENT_BOXES.xlsx"
# --------------------------------------------

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def safe_upload_to_supabase():
    print("📂 Loading Excel file...")
    df = pd.read_excel(EXCEL_FILE, sheet_name="Sheet1")

    # Normalize column names (NO renaming)
    df.columns = [col.strip() for col in df.columns]

    # 🔧 FIX: force updated_at to NULL (Postgres-safe)
    if "updated_at" in df.columns:
        df["updated_at"] = None
    
    # ORIGINAL columns (unchanged)
    text_cols = [
        "shipment", "ContainerNum", "BoxNum", "Container",
        "BoxName", "Kits", "Factory", "REMARKS", "Discrepancies"
    ]
    numeric_cols = ["NO", "ItemCount"]
    date_cols = ["CompletionDate", "updated_at"]

    # Fill text columns
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].fillna("")

    # Fill numeric columns
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # Handle date columns
    for col in date_cols:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: x.isoformat()
                if pd.notnull(x) and hasattr(x, "isoformat")
                else None
            )

    # Remove id if present (DB generates it)
    if "id" in df.columns:
        df = df.drop(columns=["id"])

    records = []

    for _, row in df.iterrows():
        record = row.to_dict()

        # Final cleanup for nulls
        for key, value in record.items():
            if pd.isna(value):
                if key in date_cols:
                    record[key] = None
                elif key in numeric_cols:
                    record[key] = 0
                else:
                    record[key] = ""

        records.append(record)

    print(f"📊 Records prepared: {len(records)}")

    proceed = input("\n⚠️  Proceed with upload? (yes/no): ")
    if proceed.lower() != "yes":
        print("❌ Upload cancelled")
        return

    BATCH_SIZE = 100
    successful = 0
    failed = 0

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            supabase.table(TABLE_NAME).upsert(
                batch,
                on_conflict='"shipment","BoxNum","ContainerNum","BoxName"',
                returning="minimal"
            ).execute()
            successful += len(batch)
            print(f"✅ Batch {i // BATCH_SIZE + 1}: {len(batch)} inserted/skipped")
        except Exception as e:
            failed += len(batch)
            print(f"❌ Batch {i // BATCH_SIZE + 1} failed: {e}")


    print("\n📈 Upload Summary")
    print(f"   ✅ Successful: {successful}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📊 Total: {len(records)}")


if __name__ == "__main__":
    print("=" * 60)
    print("SHIPMENT INSPECTION DATA UPLOAD")
    print("=" * 60)
    safe_upload_to_supabase()
