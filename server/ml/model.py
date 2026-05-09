import sys
import json
import os
import pickle
import numpy as np
import pandas as pd
try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
except ImportError:
    print(json.dumps({"success": False, "error": "scikit-learn not installed in python env"}))
    sys.exit(1)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")

def train_model(json_path):
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    if not data:
        print(json.dumps({"success": False, "error": "Empty dataset"}))
        return
        
    df = pd.json_normalize(data)
    
    # Check if 'features' dictionary was expanded. If so, rename columns
    # Expected columns: features.rsi, features.ema20, etc.
    feature_cols = [c for c in df.columns if c.startswith('features.')]
    if not feature_cols:
        print(json.dumps({"success": False, "error": "Invalid format, missing features"}))
        return

    X = df[feature_cols]
    y = df['label']
    
    if len(X) < 10:
        print(json.dumps({"success": False, "error": "INSUFFICIENT_DATA"}))
        return

    # Train/Test Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train Model
    clf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    clf.fit(X_train, y_train)
    
    # Evaluate
    preds = clf.predict(X_test)
    acc = accuracy_score(y_test, preds)
    
    # Persist
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(clf, f)
        
    feature_names = [f.replace('features.', '') for f in feature_cols]
    
    print(json.dumps({
        "success": True,
        "accuracy": round(acc, 4),
        "samples_trained": len(X_train),
        "features": feature_names
    }))

def predict(features_json):
    if not os.path.exists(MODEL_PATH):
        print(json.dumps({"success": False, "error": "Model not trained"}))
        return

    features = json.loads(features_json)
    
    # Load model
    with open(MODEL_PATH, 'rb') as f:
        clf = pickle.load(f)
    
    # Format input sequentially dynamically expecting same order as training
    # By default, df expansion creates sorted or defined order. Let's explicitly look at model feature names if possible.
    # We will just pass the values in the expected order: rsi, ema20, ema50, emaDist20, emaDist50, momentum, atr, price
    expected_order = ['rsi', 'ema20', 'ema50', 'emaDist20', 'emaDist50', 'momentum', 'atr', 'price']
    X_input = []
    for key in expected_order:
        if key in features:
             X_input.append(features[key])
        else:
             X_input.append(0) # Fallback

    X_np = np.array([X_input])
    probs = clf.predict_proba(X_np)[0]
    
    # Classes are usually [0 (SELL), 1 (BUY)]
    # We map index 1 to BUY probability
    prob_buy = float(probs[1]) if len(probs) > 1 else (1.0 if clf.predict(X_np)[0] == 1 else 0.0)

    print(json.dumps({
        "success": True,
        "prob": round(prob_buy, 4),
        "model": "RandomForest"
    }))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Missing arguments"}))
        sys.exit(1)
        
    cmd = sys.argv[1]
    arg = sys.argv[2]
    
    if cmd == 'train':
        train_model(arg)
    elif cmd == 'predict':
        predict(arg)
    else:
        print(json.dumps({"success": False, "error": f"Unknown command {cmd}"}))
