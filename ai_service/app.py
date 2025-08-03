from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os
import requests
import json

# Initialize the Flask application
app = Flask(__name__)
CORS(app)

# --- Load Local Prediction Model ---
try:
    prediction_model = joblib.load('booking_model.pkl')
    print("Local prediction model loaded successfully.")
except FileNotFoundError:
    prediction_model = None
    print("ERROR: booking_model.pkl not found.")


# --- AI Concierge Chat Endpoint (Refined Production Version) ---
@app.route('/chat', methods=['POST'])
def chat_concierge():
    """
    Handles chat requests using a direct REST call to the GitHub Models API.
    This version is optimized to use the known working model directly.
    """
    json_data = request.get_json()
    user_message = json_data.get('message')
    token = json_data.get('token') # This is your Fine-Grained GitHub PAT

    if not user_message or not token:
        return jsonify({"error": "Missing message or token"}), 400

    try:
        system_prompt = """
        You are 'Al', the friendly and helpful AI Concierge for the 'AI Hotel'.
        Your knowledge is strictly limited to the hotel.
        Our room types are: Single, Double, and Suite.
        Amenities include: High-Speed WiFi, Swimming Pool, Fine Dining, and a Fitness Center.
        If a user asks about anything outside of hotel services (like politics, history, or random trivia),
        politely decline and steer the conversation back to the hotel.
        For example: 'I'm an expert on the AI Hotel, but I don't have information on that. Can I help you book a room or tell you about our amenities?'
        Keep your answers concise and friendly.
        """
        
        # Define the API endpoint and the confirmed working model
        api_url = "https://models.github.ai/inference/chat/completions"
        model_to_use = "microsoft/Phi-3-mini-4k-instruct"
        
        # Construct the necessary headers for the GitHub API
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
        }
        
        # Construct the payload
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        payload = {
            "model": model_to_use,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 150
        }
        
        # Make the API call
        response = requests.post(api_url, headers=headers, json=payload)
        
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()
        
        response_data = response.json()
        ai_response = response_data['choices'][0]['message']['content']
        
        return jsonify({'reply': ai_response})

    except requests.exceptions.HTTPError as http_err:
        print(f"[AI Chat Service] HTTP ERROR: {http_err}")
        print(f"[AI Chat Service] Response Content: {http_err.response.text}")
        return jsonify({"error": "The AI Concierge is currently unavailable due to an API issue."}), 500
    except Exception as e:
        print(f"[AI Chat Service] UNEXPECTED ERROR: {e}")
        return jsonify({"error": "Sorry, our AI Concierge had trouble understanding. Please try again."}), 500


# --- Existing AI Endpoints (no changes needed below this line) ---
@app.route('/predict', methods=['POST'])
def predict():
    if prediction_model is None:
        return jsonify({"error": "Prediction model is not loaded"}), 500
    json_data = request.get_json()
    month = int(json_data.get('month_to_predict'))
    input_df = pd.DataFrame([[month]], columns=['month_number'])
    prediction = prediction_model.predict(input_df)
    return jsonify({'predicted_bookings': round(prediction[0])})

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

@app.route('/dynamic-price-suggestion', methods=['POST'])
def dynamic_price_suggestion():
    try:
        data = request.get_json()
        predicted_bookings = data.get('predicted_bookings_next_month')
        active_bookings = data.get('active_bookings_next_month')
        total_rooms = data.get('total_rooms')
        if None in [predicted_bookings, active_bookings, total_rooms] or total_rooms == 0:
            return jsonify({"error": "Missing or invalid required data."}), 400
        AVERAGE_BOOKINGS_PER_MONTH = 228 
        demand_factor = predicted_bookings / AVERAGE_BOOKINGS_PER_MONTH
        occupancy_factor = active_bookings / total_rooms
        suggestion_score = 0
        if demand_factor > 1.25: suggestion_score += 10
        elif demand_factor > 1.1: suggestion_score += 5
        elif demand_factor < 0.8: suggestion_score -= 5
        if occupancy_factor > 0.6: suggestion_score += 10
        elif occupancy_factor > 0.4: suggestion_score += 5
        if suggestion_score >= 15:
            percent, reason = 20, "Extremely high demand and booking pace. Capitalize on this peak."
        elif suggestion_score >= 10:
            percent, reason = 15, "Both predicted demand and current bookings are strong."
        elif suggestion_score >= 5:
            percent, reason = 10, "Predicted demand or booking pace is higher than average."
        elif suggestion_score <= -5:
            percent, reason = -10, "Demand is low. A promotion could attract more guests."
        else:
            percent, reason = 0, "Demand and booking pace are within the normal range."
        return jsonify({'suggestion_percent': percent, 'reason': reason})
    except Exception as e:
        print(f"[AI Service] UNEXPECTED ERROR in price suggestion: {e}")
        return jsonify({"error": "Internal AI error."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)