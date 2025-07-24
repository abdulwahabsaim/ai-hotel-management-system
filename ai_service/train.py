import pandas as pd
from sklearn.linear_model import LinearRegression
import joblib

def train_model():
    print("Starting model training...")
    # Sample data representing a year of bookings.
    data = {
        'month_number': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        'total_bookings': [120, 135, 160, 190, 240, 310, 350, 330, 250, 210, 260, 410]
    }
    df = pd.DataFrame(data)
    X = df[['month_number']]
    y = df['total_bookings']
    model = LinearRegression()
    model.fit(X, y)
    print("Model training completed.")
    joblib.dump(model, 'booking_model.pkl')
    print("Model saved to 'booking_model.pkl'.")

if __name__ == '__main__':
    train_model()