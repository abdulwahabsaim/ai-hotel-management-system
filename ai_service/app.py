from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd

# Initialize the Flask application
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

# Load the trained prediction model at startup
try:
    prediction_model = joblib.load('booking_model.pkl')
    print("Prediction model loaded successfully.")
except FileNotFoundError:
    prediction_model = None
    print("ERROR: booking_model.pkl not found.")

# --- AI Prediction Endpoint ---
@app.route('/predict', methods=['POST'])
def predict():
    if prediction_model is None:
        return jsonify({"error": "Prediction model is not loaded"}), 500
    json_data = request.get_json()
    month = int(json_data.get('month_to_predict'))
    input_df = pd.DataFrame([[month]], columns=['month_number'])
    prediction = prediction_model.predict(input_df)
    return jsonify({'predicted_bookings': round(prediction[0])})

# --- AI Recommendation Endpoint ---
@app.route('/recommend', methods=['POST'])
def recommend():
    data = request.get_json()
    guests = int(data.get('guests', 1))
    trip_type = data.get('trip_type', 'solo')
    if trip_type == 'family' or guests >= 3:
        recommendation = 'Suite'
        reason = "Best for families or larger groups."
    else:
        recommendation = 'Double' if trip_type == 'couple' or guests == 2 else 'Single'
        reason = "Ideal for couples." if recommendation == 'Double' else "A great choice for a solo traveler."
    return jsonify({'recommended_type': recommendation, 'reason': reason})

# --- AI Smart Assign Endpoint ---
@app.route('/smart-assign', methods=['POST'])
def smart_assign():
    data = request.get_json()
    available_rooms = data.get('available_rooms', [])
    all_rooms = data.get('all_rooms', [])
    if not available_rooms:
        return jsonify({"error": "No available rooms to choose from."}), 400
    scores = {}
    occupied_floors = {str(room['roomNumber'])[0] for room in all_rooms if not room['isAvailable']}
    for room in available_rooms:
        room_id = room['_id']
        room_number_str = str(room['roomNumber'])
        scores[room_id] = 0
        floor = room_number_str[0]
        if floor in occupied_floors: scores[room_id] += 5
        if room_number_str.endswith('01') or room_number_str.endswith('05'): scores[room_id] += 3
        try: scores[room_id] += int(floor)
        except ValueError: pass
    best_room_id = max(scores, key=scores.get) if scores else available_rooms[0]['_id']
    return jsonify({'best_room_id': best_room_id})

# --- NEW AI DYNAMIC PRICING ENDPOINT ---
@app.route('/dynamic-price-suggestion', methods=['POST'])
def dynamic_price_suggestion():
    """
    A heuristic AI that suggests a price adjustment based on predicted demand
    and current booking pace.
    """
    try:
        data = request.get_json()
        print(f"[AI Service] Received data for price suggestion: {data}")

        predicted_bookings = data.get('predicted_bookings_next_month')
        active_bookings = data.get('active_bookings_next_month')
        total_rooms = data.get('total_rooms')

        if None in [predicted_bookings, active_bookings, total_rooms] or total_rooms == 0:
            return jsonify({"error": "Missing or invalid required data."}), 400

        # This is the average number of bookings per month from our training data.
        # This represents "normal" demand.
        AVERAGE_BOOKINGS_PER_MONTH = 228 

        # Calculate demand and occupancy factors
        demand_factor = predicted_bookings / AVERAGE_BOOKINGS_PER_MONTH
        occupancy_factor = active_bookings / total_rooms

        # Scoring System
        suggestion_score = 0
        if demand_factor > 1.25: suggestion_score += 10 # Very high demand
        elif demand_factor > 1.1: suggestion_score += 5  # High demand
        elif demand_factor < 0.8: suggestion_score -= 5  # Low demand
            
        if occupancy_factor > 0.6: suggestion_score += 10 # High booking pace
        elif occupancy_factor > 0.4: suggestion_score += 5  # Moderate booking pace
        
        # Translate Score into Actionable Advice
        if suggestion_score >= 15:
            percent = 20
            reason = "Extremely high demand and booking pace. Capitalize on this peak."
        elif suggestion_score >= 10:
            percent = 15
            reason = "Both predicted demand and current bookings are strong."
        elif suggestion_score >= 5:
            percent = 10
            reason = "Predicted demand or booking pace is higher than average."
        elif suggestion_score <= -5:
            percent = -10
            reason = "Demand is low. A promotion could attract more guests."
        else:
            percent = 0
            reason = "Demand and booking pace are within the normal range."

        print(f"Demand Factor: {demand_factor:.2f}, Occupancy Factor: {occupancy_factor:.2f}, Score: {suggestion_score}")

        return jsonify({
            'suggestion_percent': percent,
            'reason': reason
        })

    except Exception as e:
        print(f"[AI Service] UNEXPECTED ERROR in price suggestion: {e}")
        return jsonify({"error": "Internal AI error."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)