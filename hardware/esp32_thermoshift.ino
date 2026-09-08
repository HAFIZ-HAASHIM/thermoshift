/**
 * ThermoShift ESP32 On-Site Safety Indicator
 * Hardware: ESP32 Dev Module, RGB LED (Common Cathode or Anode), Active Buzzer
 * Function: Polls site heat status / current worker alert level from ThermoShift Backend API
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// ThermoShift API Endpoint
const char* serverUrl = "http://192.168.1.100:5000/api/hardware/site-status?siteId=site-demo-01";

// Pin Definitions
#define PIN_RED    25
#define PIN_GREEN  26
#define PIN_BLUE   27
#define PIN_BUZZER 33

void setup() {
  Serial.begin(115200);
  
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BLUE, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Initialize: White LED during boot
  setColor(255, 255, 255);
  digitalWrite(PIN_BUZZER, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! ThermoShift Safety Node Online.");
  setColor(0, 255, 0); // Green on connect
}

void setColor(int r, int g, int b) {
  analogWrite(PIN_RED, r);
  analogWrite(PIN_GREEN, g);
  analogWrite(PIN_BLUE, b);
}

void triggerAlarm(int beeps) {
  for (int i = 0; i < beeps; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(150);
    digitalWrite(PIN_BUZZER, LOW);
    delay(150);
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, payload);

      const char* heatRisk = doc["riskCategory"]; // LOW, MODERATE, HIGH, VERY_HIGH, EXTREME
      bool mandatoryRest = doc["mandatoryRestAlert"];

      if (strcmp(heatRisk, "LOW") == 0) {
        setColor(0, 255, 0); // Green
      } else if (strcmp(heatRisk, "MODERATE") == 0) {
        setColor(255, 200, 0); // Yellow
      } else if (strcmp(heatRisk, "HIGH") == 0) {
        setColor(255, 100, 0); // Orange
      } else if (strcmp(heatRisk, "VERY_HIGH") == 0 || strcmp(heatRisk, "EXTREME") == 0) {
        setColor(255, 0, 0); // Red
        if (mandatoryRest) {
          triggerAlarm(3);
        }
      }
    }
    http.end();
  }
  delay(10000); // Poll every 10 seconds
}
