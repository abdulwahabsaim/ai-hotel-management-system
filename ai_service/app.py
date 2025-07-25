from flask import Flask, request, jsonify
from flask_cors import CORS  # Import the CORS library
import joblib
import numpy as np

# Initialize the Flask application
app = Flask(__name__)

# Enable CORS for all routes on this app. This is the crucial fix.
CORS(app)

# Load the trained prediction model at startup
try:
    prediction_model = joblib.load('booking_model.pkl')
    print("Prediction model loaded successfully.")
except FileNotFoundError:
    prediction_model = None
    print("ERROR: booking_model.pkl not found. Prediction endpoint will not work.")

# --- AI Prediction Endpoint ---
@app.route('/predict', methods=['POST'])
def predict():
    """Predicts future bookings based on a month number."""
    if prediction_model is None:
        return jsonify({"error": "Prediction model is not loaded on the server"}), 500

    json_data = request.get_json()
    if not json_data or 'month_to_predict' not in json_data:
        return jsonify({"error": "Invalid input. 'month_to_predict' is required."}), 400
    
    try:
        month = int(json_data['month_to_predict'])
    except (ValueError, TypeError):
        return jsonify({"error": "'month_to_predict' must be an integer."}), 400

    features = np.array([[month]])
    prediction = prediction_model.predict(features)
    predicted_value = prediction[0]

    return jsonify({'predicted_bookings': round(predicted_value)})

# --- AI Recommendation Endpoint ---
@app.route('/recommend', methods=['POST'])
def recommend():
    """A simple rule-based AI for recommending a room type."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input. JSON body is required."}), 400
        
    guests = int(data.get('guests', 1))
    trip_type = data.get('trip_type', 'solo')

    # AI Logic: A simple but effective rule-based system
    if trip_type == 'family' or guests >= 3:
        recommendation = 'Suite'
        reason = "Best for families or larger groups, offering more space and luxury."
    elif trip_type == 'business':
        recommendation = 'Single'
        reason = "Perfect for solo business travelers needing a quiet and productive workspace."
    elif trip_type == 'couple' or guests == 2:
        recommendation = 'Double'
        reason = "Ideal for couples or two travelers, providing ample comfort."
    else:  # Default for solo travelers
        recommendation = 'Single'
        reason = "A great and affordable choice for a solo traveler."

    return jsonify({
        'recommended_type': recommendation,
        'reason': reason
    })

if __name__ == '__main__':
    # Run the Flask app on port 5000 with debugging enabled
    app.run(debug=True, port=5000)