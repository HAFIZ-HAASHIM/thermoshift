"""
ThermoShift - Virtual ESP32 Hardware Simulator (CLI)
Emulates the physical RGB LED and buzzer on-site device for development & demo testing.
"""

import time
import requests
import sys

def simulate_device(api_url="http://localhost:5000/api/hardware/site-status?siteId=site-demo-01"):
    print("=" * 60)
    print("ThermoShift Virtual ESP32 Hardware Indicator Online")
    print("=" * 60)

    color_map = {
        "LOW": "\033[92m[LED: GREEN]    Normal Conditions\033[0m",
        "MODERATE": "\033[93m[LED: YELLOW]   Caution - Hydration Recommended\033[0m",
        "HIGH": "\033[38;5;208m[LED: ORANGE]   Heat Warning - Rest Cycles Active\033[0m",
        "VERY_HIGH": "\033[91m[LED: RED]      High Risk - Strict Rest Enforcement\033[0m",
        "EXTREME": "\033[41m\033[97m[LED: FLASHING RED] EXTREME DANGER - Work Cease/Misting Active\033[0m"
    }

    while True:
        try:
            resp = requests.get(api_url, timeout=3)
            if resp.status_code == 200:
                data = resp.json()
                risk = data.get("riskCategory", "LOW")
                wbgt = data.get("currentWbgt", 28.0)
                rest_alert = data.get("mandatoryRestAlert", False)

                indicator = color_map.get(risk, color_map["LOW"])
                buzzer_str = " \033[91m[BUZZER BEEP BEEP!]\033[0m" if rest_alert else ""

                print(f"[{time.strftime('%H:%M:%S')}] WBGT: {wbgt:.1f}°C | {indicator}{buzzer_str}")
            else:
                print(f"[{time.strftime('%H:%M:%S')}] Status: {resp.status_code} (Waiting for backend)")
        except requests.exceptions.RequestException:
            # Fallback simulator demo mode
            print(f"[{time.strftime('%H:%M:%S')}] (Offline Demo Mode) WBGT: 31.4°C | {color_map['HIGH']}")
        
        time.sleep(5)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000/api/hardware/site-status?siteId=site-demo-01"
    simulate_device(url)
