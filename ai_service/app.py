from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os
import requests
import json
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
from pymongo import MongoClient
from dotenv import dotenv_values
from bson import ObjectId

# Initialize the Flask application
app = Flask(__name__)
CORS(app)

# --- Database Connection ---
try:
    config = dotenv_values(os.path.join(os.path.dirname(__file__), '..', 'hotel-management-app', '.env'))
    MONGO_URI = config.get('MONGO_URI')
    client = MongoClient(MONGO_URI)
    db = client.get_database()
    bookings_collection = db.bookings
    rooms_collection = db.rooms
    print("MongoDB connection successful.")
except Exception as e:
    print(f"ERROR: Could not connect to MongoDB. {e}")
    bookings_collection = None
    rooms_collection = None

# --- Load Local Prediction Model ---
try:
    prediction_model = joblib.load('booking_model.pkl')
    print("Local prediction model loaded successfully.")
except FileNotFoundError:
    prediction_model = None
    print("ERROR: booking_model.pkl not found.")

# --- Helper Function for RAG (Retrieval-Augmented Generation) ---
def _get_hotel_context():
    """Retrieves current room data from DB to provide context to the AI."""
    if rooms_collection is None:
        return "Database not connected."
    
    rooms = list(rooms_collection.find({}, {"_id": 0, "type": 1, "price": 1, "amenities": 1, "description": 1}))
    if not rooms:
        return "No room information available."
    
    context = "Here is the current, real-time information about our hotel rooms:\n"
    for room in rooms:
        amenities = ", ".join(room.get('amenities', []))
        context += f"- Room Type: {room.get('type')}, Price: ${room.get('price')} per night. Description: {room.get('description')}. Amenities: {amenities}.\n"
    
    prices = [r['price'] for r in rooms if 'price' in r]
    if prices:
        context += f"The most expensive room costs ${max(prices)} and the cheapest costs ${min(prices)}.\n"
        
    return context

# --- Helper function to log chat to Node.js backend ---
def _log_chat_interaction(user_input, ai_response, intent="general"):
    try:
        requests.post("http://localhost:3000/api/log-chat", json={"userInput": user_input, "aiResponse": ai_response, "intent": intent}, timeout=2)
    except requests.exceptions.RequestException as e:
        print(f"Failed to log chat interaction: {e}")

# --- AI Concierge Chat Endpoint (Using Direct GitHub API Call with RAG) ---
@app.route('/chat', methods=['POST'])
def chat_concierge():
    json_data = request.get_json()
    user_message, token = json_data.get('message'), json_data.get('token')
    if not user_message or not token: return jsonify({"error": "Missing message or token"}), 400

    # ================== THE FIX: Use the Correct, Working Endpoint ==================
    api_url = "https://models.github.ai/inference/chat/completions"
    model_to_use = "microsoft/Phi-3-mini-4k-instruct" # The model we know works
    
    # These specific headers are required by the GitHub API
    headers = {
        "Authorization": f"Bearer {token}", 
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    # ==============================================================================
    
    try:
        hotel_context = _get_hotel_context()

        # A single, powerful RAG prompt that forces the AI to use our data
        system_prompt = f"""You are 'Al', a helpful AI Concierge for the 'AI Hotel'.
        Your knowledge is strictly limited to the information in the CONTEXT below.
        You MUST use this context to answer all questions. Do not make up information.
        If the user's question cannot be answered using the context, you MUST say: "I'm sorry, I only have information about our hotel's rooms and amenities."
        
        CONTEXT:
        {hotel_context}
        """

        payload = {
            "model": model_to_use,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "temperature": 0.5, # Slightly factual
            "max_tokens": 250
        }
        
        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response = response.json()['choices'][0]['message']['content']
        
        _log_chat_interaction(user_message, ai_response, "general_rag")
        return jsonify({'reply': ai_response})

    except requests.exceptions.RequestException as e:
        print(f"[AI Chat Service] NETWORK ERROR: Could not connect to the AI service endpoint. {e}")
        error_message = "I'm sorry, I'm having trouble connecting to my brain right now. Please check your network or try again in a moment."
        _log_chat_interaction(user_message, f"Network Error: {e}", "error")
        return jsonify({"error": error_message}), 500
    except Exception as e:
        print(f"[AI Chat Service] UNEXPECTED ERROR: {e}")
        _log_chat_interaction(user_message, f"Error: {e}", "error")
        return jsonify({"error": "Sorry, our AI Concierge had an unexpected problem. Please try again."}), 500


# --- ALL OTHER AI ENDPOINTS (RESTORED & VERIFIED) ---
@app.route('/predict', methods=['POST'])
def predict():
    if prediction_model is None: return jsonify({"error": "Prediction model is not loaded"}), 500
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
    available_rooms, all_rooms = data.get('available_rooms', []), data.get('all_rooms', [])
    if not available_rooms: return jsonify({"error": "No available rooms to choose from."}), 400
    scores = {}
    occupied_floors = {str(room['roomNumber'])[0] for room in all_rooms if not room['isAvailable']}
    for room in available_rooms:
        room_id, room_number_str = room['_id'], str(room['roomNumber'])
        scores[room_id] = 0
        floor = room_number_str[0]
        if floor in occupied_floors: scores[room_id] += 5
        if room_number_str.endswith('01') or room_number_str.endswith('05'): scores[room_id] += 3
        try: scores[room_id] += int(floor)
        except ValueError: pass
    best_room_id = max(scores, key=scores.get) if scores else available_rooms[0]['_id']
    return jsonify({'best_room_id': best_room_id})

def _get_price_suggestion(predicted_bookings, active_bookings, total_rooms):
    if total_rooms == 0: return {'suggestion_percent': 0, 'reason': 'No rooms available to price.'}
    AVERAGE_BOOKINGS_PER_MONTH = 228 
    demand_factor, occupancy_factor = predicted_bookings / AVERAGE_BOOKINGS_PER_MONTH, active_bookings / total_rooms
    suggestion_score = 0
    if demand_factor > 1.25: suggestion_score += 10
    elif demand_factor > 1.1: suggestion_score += 5
    elif demand_factor < 0.8: suggestion_score -= 5
    if occupancy_factor > 0.6: suggestion_score += 10
    elif occupancy_factor > 0.4: suggestion_score += 5
    if suggestion_score >= 15: percent, reason = 20, "Extremely high demand and booking pace. Capitalize on this peak."
    elif suggestion_score >= 10: percent, reason = 15, "Both predicted demand and current bookings are strong."
    elif suggestion_score >= 5: percent, reason = 10, "Predicted demand or booking pace is higher than average."
    elif suggestion_score <= -5: percent, reason = -10, "Demand is low. A promotion could attract more guests."
    else: percent, reason = 0, "Demand and booking pace are within the normal range."
    return {'suggestion_percent': percent, 'reason': reason}

@app.route('/dashboard-stats', methods=['POST'])
def dashboard_stats():
    try:
        data = request.get_json()
        month_to_predict, active_bookings_next_month, total_rooms = data.get('month_to_predict'), data.get('active_bookings_next_month'), data.get('total_rooms')
        if None in [month_to_predict, active_bookings_next_month, total_rooms]: return jsonify({"error": "Missing required data for stats."}), 400
        predicted_bookings = round(prediction_model.predict(pd.DataFrame([[month_to_predict]], columns=['month_number']))[0]) if prediction_model is not None else 0
        price_suggestion = _get_price_suggestion(predicted_bookings, active_bookings_next_month, total_rooms)
        return jsonify({'predicted_bookings': predicted_bookings, 'price_suggestion': price_suggestion})
    except Exception as e:
        print(f"[AI Service] ERROR in dashboard-stats: {e}")
        return jsonify({"error": "Internal AI error while generating dashboard stats."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)