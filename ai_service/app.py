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

# --- Static Hotel Information ---
HOTEL_INFO = {
    "check_in_time": "3:00 PM",
    "check_out_time": "11:00 AM",
    "location": "123 AI Avenue, Tech City, TX 75001",
    "contact_phone": "1-800-555-AIHQ",
    "amenities": ["High-Speed WiFi", "Swimming Pool", "Fine Dining Restaurant", "24/7 Fitness Center", "Business Center", "Free Parking"]
}

# --- Load Local Prediction Model ---
try:
    prediction_model = joblib.load('booking_model.pkl')
    print("Local prediction model loaded successfully.")
except FileNotFoundError:
    prediction_model = None
    print("ERROR: booking_model.pkl not found.")

# --- Helper Function for RAG (Retrieval-Augmented Generation) ---
def _get_general_context():
    """Retrieves general room data and static info from DB to provide context to the AI."""
    if rooms_collection is None: return "Database not connected."
    
    rooms = list(rooms_collection.find({}, {"_id": 0, "type": 1, "price": 1, "amenities": 1, "description": 1}))
    if not rooms: return "No room information available."
    
    context = "Here is the current, real-time information about our hotel:\n"
    context += f"- General Info: Check-in is at {HOTEL_INFO['check_in_time']}, Check-out is at {HOTEL_INFO['check_out_time']}.\n"
    context += f"- General Amenities: {', '.join(HOTEL_INFO['amenities'])}.\n"
    
    for room in rooms:
        context += f"- Room Type: {room.get('type')}, Price: ${room.get('price')} per night. Description: {room.get('description')}.\n"
    
    prices = [r['price'] for r in rooms if 'price' in r]
    if prices: context += f"The most expensive room costs ${max(prices)} and the cheapest costs ${min(prices)}.\n"
    return context

# --- Helper Function for Specific Date/Room Availability ---
def _check_specific_availability(room_number: str = None, check_in_date: str = None, check_out_date: str = None):
    """Precise tool to check availability for a specific room and date range."""
    if bookings_collection is None or rooms_collection is None:
        return "Database connection is not available."

    try:
        query_filter = {"roomNumber": room_number}
        target_room = rooms_collection.find_one(query_filter)

        if not target_room:
            return f"I'm sorry, I could not find a room with the number '{room_number}'."

        if not check_in_date or not check_out_date:
            status = "available for booking" if target_room.get('isAvailable') else "currently occupied or unavailable"
            return f"Room {room_number} is {status} right now."
        
        check_in = parse_date(check_in_date)
        check_out = parse_date(check_out_date)
        if check_in >= check_out: return "The check-in date must be before the check-out date."

        overlapping_booking = bookings_collection.find_one({
            "room": target_room['_id'],
            "status": 'Active',
            "$or": [
                {"checkInDate": {"$lt": check_out, "$gte": check_in}},
                {"checkOutDate": {"$gt": check_in, "$lte": check_out}},
                {"checkInDate": {"$lte": check_in}, "checkOutDate": {"$gte": check_out}}
            ]
        })

        if overlapping_booking:
            return f"Unfortunately, Room {room_number} is **booked** from {check_in.strftime('%B %d')} to {check_out.strftime('%B %d')}."
        else:
            return f"Good news! Room {room_number} is **available** for booking from {check_in.strftime('%B %d')} to {check_out.strftime('%B %d')}."

    except Exception as e:
        print(f"DB Specific Check Error: {e}")
        return "I encountered an error while checking the booking schedule."

# --- Helper function to log chat to Node.js backend ---
def _log_chat_interaction(user_input, ai_response, intent="general"):
    try:
        requests.post("http://localhost:3000/api/log-chat", json={"userInput": user_input, "aiResponse": ai_response, "intent": intent}, timeout=2)
    except requests.exceptions.RequestException as e:
        print(f"Failed to log chat interaction: {e}")

# --- AI Concierge Chat Endpoint (Full Agent Implementation) ---
@app.route('/chat', methods=['POST'])
def chat_concierge():
    json_data = request.get_json()
    user_message, token = json_data.get('message'), json_data.get('token')
    if not user_message or not token: return jsonify({"error": "Missing message or token"}), 400

    api_url = "https://models.github.ai/inference/chat/completions"
    model_to_use = "microsoft/Phi-3-mini-4k-instruct"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    intent_detection_prompt = f"""You are an intent router. Analyze the user's message and determine the correct intent and extract its parameters.
    Respond ONLY with a JSON object.
    Intents are: 'specific_availability' or 'general_question'.
    For 'specific_availability', you MUST extract 'room_number' (as a string), 'check_in_date' (YYYY-MM-DD), and 'check_out_date' (YYYY-MM-DD). If dates are missing, return null.
    Today's date is {datetime.now().strftime('%Y-%m-%d')}.

    Examples:
    User: "is room 301 available from august 10 to august 12 2025"
    Response: {{"intent": "specific_availability", "parameters": {{"room_number": "301", "check_in_date": "2025-08-10", "check_out_date": "2025-08-12"}}}}

    User: "is room 202 available now"
    Response: {{"intent": "specific_availability", "parameters": {{"room_number": "202", "check_in_date": null, "check_out_date": null}}}}
    
    User: "what's the price of a double room"
    Response: {{"intent": "general_question", "parameters": {{}}}}
    
    User: "hi"
    Response: {{"intent": "general_question", "parameters": {{}}}}

    User: "{user_message}"
    Response:
    """
    
    try:
        payload = {"model": model_to_use, "messages": [{"role": "user", "content": intent_detection_prompt}], "temperature": 0.0, "max_tokens": 200}
        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()
        ai_response_text = response.json()['choices'][0]['message']['content']

        final_answer = ""
        intent = "general_question"
        parsed_json = json.loads(ai_response_text)
        intent = parsed_json.get("intent")

        tool_result = ""
        if intent == "specific_availability":
            params = parsed_json.get("parameters", {})
            tool_result = _check_specific_availability(
                room_number=params.get("room_number"),
                check_in_date=params.get("check_in_date"),
                check_out_date=params.get("check_out_date")
            )
        else: # General question
            tool_result = _get_general_context()

        response_generation_prompt = f"""You are 'Al', a helpful AI hotel concierge.
        A user asked: "{user_message}"
        You have used a tool and retrieved the following information: "{tool_result}"
        
        Based ONLY on this retrieved information, provide a direct and friendly answer to the user's question.
        """
        
        final_payload = {"model": model_to_use, "messages": [{"role": "user", "content": response_generation_prompt}], "temperature": 0.7, "max_tokens": 250}
        final_response = requests.post(api_url, headers=headers, json=final_payload)
        final_response.raise_for_status()
        final_answer = final_response.json()['choices'][0]['message']['content']
        
        _log_chat_interaction(user_message, final_answer, intent)
        return jsonify({'reply': final_answer})

    except Exception as e:
        print(f"[AI Chat Service] ERROR: {e}")
        _log_chat_interaction(user_message, f"Error: {e}", "error")
        return jsonify({"error": "Sorry, our AI Concierge had trouble understanding. Please try again."}), 500


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
        if room_number_str.endswith('give me complete updated code for these files: hotel-management-app/views/partials/header.ejs, hotel-management-app/public/css/input.css, hotel-management-app/views/partials/footer.ejs') or room_number_str.endswith('05'): scores[room_id] += 3
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