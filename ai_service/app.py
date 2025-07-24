from flask import Flask, request, jsonify
import joblib
import numpy as np

app = Flask(__name__)

# Load the trained prediction model
try:
    prediction_model = joblib.load('booking_model.pkl')
except FileNotFoundError:
    prediction_model = None

@app.route('/predict', methods=['POST'])
def predict():
    if prediction_model is None:
        return jsonify({"error": "Prediction model not loaded"}), 500

    json_data = request.get_json()
    month = int(json_data.get('month_to_predict'))
    features = np.array([[month]])
    prediction = prediction_model.predict(features)
    predicted_value = prediction[0]

    return jsonify({'predicted_bookings': round(predicted_value)})

# --- NEW AI RECOMMENDATION ENDPOINT ---
@app.route('/recommend', methods=['POST'])
def recommend():
    """A simple rule-based AI for recommending a room type."""
    data = request.get_json()
    guests = int(data.get('guests', 1))
    trip_type = data.get('trip_type', 'solo') # e.g., 'solo', 'couple', 'family', 'business'

    # AI Logic: A simple but effective rule-based system
    if trip_type == 'family' or guests >= 3:
        recommendation = 'Suite'
        reason = "Best for families or larger groups."
    elif trip_type == 'business':
        recommendation = 'Single'
        reason = "Perfect for solo business travelers needing a workspace."
    elif trip_type == 'couple' or guests == 2:
        recommendation = 'Double'
        reason = "Ideal for couples or two travelers."
    else: # Default for solo travelers
        recommendation = 'Single'
        reason = "A great and affordable choice for a solo traveler."

    return jsonify({
        'recommended_type': recommendation,
        'reason': reason
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)