import pandas as pd
from sklearn.linear_model import LinearRegression
import joblib
from pymongo import MongoClient
from dotenv import dotenv_values
import os

# --- Configuration ---
# Load environment variables from the .env file in the Node.js project directory
# This allows us to get the MONGO_URI without hardcoding it.
config = dotenv_values(os.path.join(os.path.dirname(__file__), '..', 'hotel-management-app', '.env'))
MONGO_URI = config.get('MONGO_URI')

def train_model():
    """
    Connects to MongoDB, fetches real booking data, trains a prediction model,
    and saves it to a file.
    """
    if not MONGO_URI:
        print("ERROR: MONGO_URI not found in .env file. Cannot connect to database.")
        return

    print("--- Starting AI Model Training ---")
    print("Connecting to MongoDB...")
    try:
        client = MongoClient(MONGO_URI)
        db = client.get_database() # The DB name is part of the URI
        bookings_collection = db.bookings
        print("Connection successful.")
    except Exception as e:
        print(f"ERROR: Could not connect to MongoDB. {e}")
        return

    # --- 1. Fetch and Aggregate Data from MongoDB ---
    print("Fetching and aggregating booking data...")
    pipeline = [
        {
            "$group": {
                "_id": { "$month": "$bookingDate" }, # Group documents by the month of their bookingDate
                "count": { "$sum": 1 }              # Count the number of bookings in each group
            }
        },
        {
            "$sort": { "_id": 1 } # Sort by month (1-12)
        }
    ]

    try:
        monthly_bookings = list(bookings_collection.aggregate(pipeline))
        if not monthly_bookings:
            print("WARNING: No booking data found in the database. Cannot train model.")
            client.close()
            return
            
        print(f"Found data for {len(monthly_bookings)} months.")
        print(monthly_bookings) # Optional: to see the fetched data

    except Exception as e:
        print(f"ERROR: Failed to aggregate data. {e}")
        client.close()
        return

    # --- 2. Prepare Data for Scikit-learn ---
    print("Preparing data for training...")
    # Create a DataFrame with all 12 months, initialized to 0 bookings
    df = pd.DataFrame({'month_number': range(1, 13), 'total_bookings': [0] * 12})
    df.set_index('month_number', inplace=True)

    # Fill the DataFrame with the actual counts from the database
    for month_data in monthly_bookings:
        month_number = month_data['_id']
        count = month_data['count']
        df.loc[month_number, 'total_bookings'] = count

    df.reset_index(inplace=True) # Reset index to get 'month_number' back as a column

    X = df[['month_number']]      # Features (the month)
    y = df['total_bookings']      # Target (the number of bookings)

    # --- 3. Train the Linear Regression Model ---
    print("Training the model...")
    model = LinearRegression()
    model.fit(X, y)
    print("Model training completed successfully.")

    # --- 4. Save the Trained Model ---
    model_filename = 'booking_model.pkl'
    joblib.dump(model, model_filename)
    print(f"Model saved to '{model_filename}'.")

    # Close the database connection
    client.close()
    print("--- Training Process Finished ---")

if __name__ == '__main__':
    train_model()