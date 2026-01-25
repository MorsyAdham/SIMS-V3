import pandas as pd
from supabase import create_client, Client
from datetime import datetime

# ------------------ CONFIG ------------------
SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU2Mzg5MjQsImV4cCI6MjA1MTIxNDkyNH0.VqOtPGLk2Y6x1rRRqJSJqV5MJn3O-Y0hIz_EW4qBm5M"  # anon/public key
TABLE_NAME = "inspection_boxes"
EXCEL_FILE = r"C:\Users\Victus 2\Logistics and Programming\3. Problem Solution Progrmming Projects\Inspection\Inspection Monitoring System\data\NOV_Shippment_Boxes_R4.xlsx"
# --------------------------------------------

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def safe_upload_to_supabase():
    """
    Safely upload data to Supabase with proper conflict handling.
    Uses upsert to update existing records and insert new ones.
    """
    
    # Load Excel
    print("📂 Loading Excel file...")
    df = pd.read_excel(EXCEL_FILE, sheet_name="Sheet1")
    
    # Normalize column names
    EXPECTED_COLS = ['shipment', 'NO', 'ContainerNum', 'BoxNum', 'Container', 
                     'BoxName', 'ItemCount', 'Kits', 'Factory', 'REMARKS', 
                     'CompletionDate', 'Discrepancies']
    
    df.columns = [col.strip() for col in df.columns]
    
    # Separate text and date columns
    text_cols = ['shipment', 'ContainerNum', 'BoxNum', 'Container', 
                 'BoxName', 'Kits', 'Factory', 'REMARKS', 'Discrepancies']
    numeric_cols = ['NO', 'ItemCount']
    date_cols = ['CompletionDate']
    
    # Fill text columns with empty string
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].fillna("")
    
    # Fill numeric columns
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
    
    # Handle date columns - convert to ISO format or None
    for col in date_cols:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: 
                x.isoformat() if pd.notnull(x) and hasattr(x, 'isoformat') 
                else str(x)[:10] if pd.notnull(x) and len(str(x)) >= 10
                else None
            )
    
    # Don't add updated_at - let database trigger handle it
    # Remove id column if present (database will auto-generate)
    if 'id' in df.columns:
        df = df.drop('id', axis=1)
    
    print(f"📊 Processing {len(df)} rows...")
    
    # Check for existing data
    try:
        existing_data = supabase.table(TABLE_NAME).select("BoxNum, ContainerNum, BoxName, id").execute()
        existing_keys = {(str(row['BoxNum']), str(row['ContainerNum']), str(row['BoxName'])): row['id'] 
                        for row in existing_data.data if row.get('BoxNum') and row.get('ContainerNum') and row.get('BoxName')}
        print(f"✅ Found {len(existing_keys)} existing records in database")
    except Exception as e:
        print(f"⚠️  Could not fetch existing data: {e}")
        existing_keys = {}
    
    # Prepare records for upsert
    new_records = []
    update_records = []
    
    for idx, row in df.iterrows():
        record = row.to_dict()
        
        # Clean up None values - convert to empty string for text fields
        for key, value in record.items():
            if pd.isna(value) or value is None:
                if key in date_cols:
                    record[key] = None
                elif key in numeric_cols:
                    record[key] = 0
                else:
                    record[key] = ""
        
        key = (str(record.get('BoxNum', '')), str(record.get('ContainerNum', '')), str(record.get('BoxName', '')))
        
        if key in existing_keys:
            # Existing record - preserve the original ID
            record['id'] = existing_keys[key]
            update_records.append(record)
        else:
            # New record
            new_records.append(record)
    
    print(f"🆕 New records to insert: {len(new_records)}")
    print(f"🔄 Existing records to update: {len(update_records)}")
    
    # Confirm before proceeding
    proceed = input("\n⚠️  Do you want to proceed? (yes/no): ")
    if proceed.lower() != 'yes':
        print("❌ Upload cancelled")
        return
    
    # Perform upsert in batches
    BATCH_SIZE = 100
    all_records = new_records + update_records
    
    successful = 0
    failed = 0
    
    for i in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[i:i + BATCH_SIZE]
        try:
            # Use upsert with BoxNum, ContainerNum, and BoxName as conflict resolution
            result = supabase.table(TABLE_NAME).upsert(
                batch,
                on_conflict="BoxNum,ContainerNum,BoxName"
            ).execute()
            successful += len(batch)
            print(f"✅ Batch {i//BATCH_SIZE + 1}: {len(batch)} records processed")
        except Exception as e:
            failed += len(batch)
            print(f"❌ Batch {i//BATCH_SIZE + 1} failed: {e}")
    
    print(f"\n📈 Upload Summary:")
    print(f"   ✅ Successful: {successful}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📊 Total: {len(all_records)}")

if __name__ == "__main__":
    print("=" * 60)
    print("SHIPMENT INSPECTION DATA UPLOAD")
    print("=" * 60)
    safe_upload_to_supabase()