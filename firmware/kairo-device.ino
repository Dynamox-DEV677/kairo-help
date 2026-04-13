// =============================================================================
// Kairo's Help - IoT Wearable Device Firmware
// ESP32 Arduino firmware for the Kairo emergency wearable
//
// Features:
//   - WiFi connection with automatic retry
//   - SOS button with hardware debounce (GPIO4, active LOW)
//   - SSD1306 OLED display (128x64, I2C)
//   - NEO-6M GPS module for location tracking
//   - Battery voltage monitoring via ADC
//   - Periodic heartbeat alerts (every 60 seconds)
//   - HTTP POST to Supabase REST API
//
// Required Libraries (install via Arduino Library Manager):
//   - WiFi.h           (built-in with ESP32 board package)
//   - HTTPClient.h     (built-in with ESP32 board package)
//   - Wire.h           (built-in with ESP32 board package)
//   - Adafruit_GFX.h   (Adafruit GFX Library)
//   - Adafruit_SSD1306.h (Adafruit SSD1306)
//   - TinyGPSPlus.h    (TinyGPSPlus by Mikal Hart)
//   - ArduinoJson.h    (ArduinoJson by Benoit Blanchon)
//
// Board: ESP32 Dev Module
// =============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// =============================================================================
// CONFIGURATION - Edit these values before uploading
// =============================================================================

// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";

// Supabase project settings
const char* SUPABASE_URL = "https://vvhyzveydnheyvygiqen.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2aHl6dmV5ZG5oZXl2eWdpcWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NzkzMDMsImV4cCI6MjA5MTU1NTMwM30.K7IFqzl5qw8bEYIHee_o4LXpv1fTtT0xRGY-v1z9NEk";

// Emergency profile ID (get this from your Kairo's Help dashboard)
const char* PROFILE_ID = "YOUR_PROFILE_ID";

// Unique device identifier
const char* DEVICE_ID = "KAIRO-001";

// =============================================================================
// PIN DEFINITIONS
// =============================================================================

// SOS button: connected between GPIO4 and GND (uses internal pull-up)
#define SOS_BUTTON_PIN    4

// OLED display: I2C pins (ESP32 default I2C bus)
#define OLED_SDA_PIN      21
#define OLED_SCL_PIN      22

// GPS module: connected to HardwareSerial1
#define GPS_RX_PIN        16   // ESP32 RX2 <- GPS TX
#define GPS_TX_PIN        17   // ESP32 TX2 -> GPS RX
#define GPS_BAUD          9600

// Battery voltage: ADC pin with voltage divider
// Voltage divider: Battery+ -> 100k resistor -> GPIO34 -> 100k resistor -> GND
// This halves the battery voltage so it fits within the ESP32 ADC range (0-3.3V)
#define BATTERY_ADC_PIN   34

// =============================================================================
// CONSTANTS
// =============================================================================

// OLED display dimensions
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1    // No reset pin (share ESP32 reset)
#define OLED_I2C_ADDR     0x3C // Common SSD1306 address

// Timing intervals (in milliseconds)
#define HEARTBEAT_INTERVAL  60000  // Send heartbeat every 60 seconds
#define DEBOUNCE_DELAY      500    // 500ms debounce for SOS button
#define WIFI_RETRY_DELAY    5000   // Wait 5 seconds between WiFi retries
#define DISPLAY_REFRESH     1000   // Refresh OLED every 1 second

// Battery voltage mapping (for a single-cell 3.7V LiPo)
// Through the voltage divider (100k/100k), the ADC sees half the battery voltage
#define BATTERY_MIN_V     3.0    // 0% charge (3.0V actual = 1.5V at ADC)
#define BATTERY_MAX_V     4.2    // 100% charge (4.2V actual = 2.1V at ADC)

// =============================================================================
// GLOBAL OBJECTS
// =============================================================================

// OLED display object
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// GPS parser object
TinyGPSPlus gps;

// Hardware serial for GPS (Serial1 on ESP32)
HardwareSerial gpsSerial(1);

// =============================================================================
// STATE VARIABLES
// =============================================================================

// Timing trackers
unsigned long lastHeartbeat = 0;      // Last time a heartbeat was sent
unsigned long lastButtonPress = 0;    // Last time the SOS button was pressed (for debounce)
unsigned long lastDisplayUpdate = 0;  // Last time the OLED was refreshed

// GPS data (stored globally so we can display it even between fixes)
double currentLat = 0.0;
double currentLng = 0.0;
bool hasGPSFix = false;

// Battery percentage (0-100)
int batteryPercent = 0;

// Last alert timestamp string (shown on OLED)
String lastAlertTime = "None";

// WiFi connection status
bool wifiConnected = false;

// =============================================================================
// SETUP - Runs once when the device powers on or resets
// =============================================================================

void setup() {
  // Start serial monitor for debugging (open at 115200 baud in Arduino IDE)
  Serial.begin(115200);
  Serial.println("=================================");
  Serial.println(" Kairo's Help - Wearable Device");
  Serial.println("=================================");

  // ---- SOS Button Setup ----
  // INPUT_PULLUP enables the internal pull-up resistor.
  // The button connects GPIO4 to GND, so pressing it reads LOW.
  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);
  Serial.println("[BUTTON] SOS button configured on GPIO4");

  // ---- Battery ADC Setup ----
  // GPIO34 is input-only on ESP32, perfect for ADC readings
  pinMode(BATTERY_ADC_PIN, INPUT);
  Serial.println("[BATTERY] ADC configured on GPIO34");

  // ---- I2C and OLED Setup ----
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("[OLED] ERROR: SSD1306 allocation failed!");
    // Continue running even if display fails - alerts still work
  } else {
    Serial.println("[OLED] Display initialized (128x64)");
  }

  // Show a startup splash on the OLED
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(20, 10);
  display.println("Kairo's Help");
  display.setCursor(25, 30);
  display.println("Wearable v1");
  display.setCursor(20, 50);
  display.println("Starting up...");
  display.display();

  // ---- GPS Setup ----
  // Start Serial1 on the GPS pins at 9600 baud (NEO-6M default)
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] Serial1 started (RX=16, TX=17, 9600 baud)");

  // ---- WiFi Setup ----
  connectWiFi();

  Serial.println("[SETUP] Initialization complete");
  Serial.println("=================================");
}

// =============================================================================
// MAIN LOOP - Runs continuously after setup()
// =============================================================================

void loop() {
  unsigned long now = millis();

  // ---- 1. Read GPS data ----
  // Feed all available bytes from the GPS module into the TinyGPS++ parser.
  // The parser extracts latitude, longitude, time, etc. from NMEA sentences.
  readGPS();

  // ---- 2. Read battery voltage ----
  batteryPercent = readBatteryPercent();

  // ---- 3. Check SOS button ----
  // The button is active LOW (pressed = LOW) with a 500ms debounce window.
  // This prevents a single press from sending multiple alerts.
  if (digitalRead(SOS_BUTTON_PIN) == LOW) {
    if ((now - lastButtonPress) > DEBOUNCE_DELAY) {
      lastButtonPress = now;
      Serial.println("[SOS] Button pressed! Sending SOS alert...");
      sendAlert("sos");
    }
  }

  // ---- 4. Send periodic heartbeat ----
  // Every 60 seconds, send a heartbeat alert so the dashboard knows
  // the device is alive and can track its latest position.
  if ((now - lastHeartbeat) > HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    Serial.println("[HEARTBEAT] Sending periodic heartbeat...");
    sendAlert("heartbeat");
  }

  // ---- 5. Update OLED display ----
  // Refresh the display every second with current status information.
  if ((now - lastDisplayUpdate) > DISPLAY_REFRESH) {
    lastDisplayUpdate = now;
    updateDisplay();
  }

  // ---- 6. Maintain WiFi connection ----
  // If WiFi drops, try to reconnect automatically.
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    Serial.println("[WIFI] Connection lost, attempting reconnect...");
    connectWiFi();
  }

  // Small delay to prevent watchdog timer issues
  delay(10);
}

// =============================================================================
// WIFI CONNECTION
// Connects to the configured WiFi network with retry logic.
// Will attempt up to 10 times before giving up (device keeps running
// and will retry on next loop iteration).
// =============================================================================

void connectWiFi() {
  Serial.print("[WIFI] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);      // Station mode (client, not access point)
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int retries = 0;
  int maxRetries = 10;

  while (WiFi.status() != WL_CONNECTED && retries < maxRetries) {
    delay(WIFI_RETRY_DELAY);
    retries++;
    Serial.print("[WIFI] Attempt ");
    Serial.print(retries);
    Serial.print("/");
    Serial.println(maxRetries);
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.print("[WIFI] Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiConnected = false;
    Serial.println("[WIFI] Failed to connect. Will retry later.");
  }
}

// =============================================================================
// GPS READING
// Reads all available bytes from the GPS serial port and feeds them
// into the TinyGPS++ parser. If a valid fix is available, updates
// the global latitude/longitude variables.
// =============================================================================

void readGPS() {
  // Read all available bytes from GPS module
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    gps.encode(c);
  }

  // Check if we have a valid GPS fix with updated location data
  if (gps.location.isValid() && gps.location.isUpdated()) {
    currentLat = gps.location.lat();
    currentLng = gps.location.lng();
    hasGPSFix = true;
  }

  // If the GPS has been running for over 5 seconds with no valid data,
  // mark as no fix (the module may not have satellite visibility)
  if (gps.charsProcessed() < 10 && millis() > 5000) {
    hasGPSFix = false;
  }
}

// =============================================================================
// BATTERY READING
// Reads the analog voltage on GPIO34 through a voltage divider and
// maps it to a 0-100% charge level.
//
// The voltage divider (R1=100k, R2=100k) halves the battery voltage:
//   Battery 4.2V -> ADC sees 2.1V -> ~2600 raw (12-bit ADC, 3.3V ref)
//   Battery 3.0V -> ADC sees 1.5V -> ~1860 raw
//
// We convert the raw ADC value back to actual battery voltage, then
// map the range 3.0V-4.2V to 0-100%.
// =============================================================================

int readBatteryPercent() {
  // Read the raw ADC value (0-4095 for 12-bit resolution)
  int rawADC = analogRead(BATTERY_ADC_PIN);

  // Convert raw ADC to voltage at the pin (ESP32 ADC reference is ~3.3V)
  // Note: ESP32 ADC is not perfectly linear; this is an approximation.
  float adcVoltage = (rawADC / 4095.0) * 3.3;

  // The voltage divider halves the battery voltage, so multiply by 2
  // to get the actual battery voltage
  float batteryVoltage = adcVoltage * 2.0;

  // Map battery voltage to percentage (3.0V = 0%, 4.2V = 100%)
  int percent = (int)((batteryVoltage - BATTERY_MIN_V) / (BATTERY_MAX_V - BATTERY_MIN_V) * 100.0);

  // Clamp the value between 0 and 100
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;

  return percent;
}

// =============================================================================
// SEND ALERT TO SUPABASE
// Sends an HTTP POST request to the Supabase REST API with alert data.
//
// Supported alert types:
//   "sos"       - User pressed the SOS button
//   "fall"      - Fall detected (future: accelerometer-based)
//   "geofence"  - Device left a safe zone (future feature)
//   "heartbeat" - Periodic alive signal with location + battery
//
// The JSON body includes:
//   profile_id, device_id, alert_type, latitude, longitude, battery_level
// =============================================================================

void sendAlert(const char* alertType) {
  // Make sure WiFi is connected before attempting HTTP request
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ALERT] Cannot send - WiFi not connected");
    return;
  }

  HTTPClient http;

  // Build the Supabase REST API endpoint URL
  // POST to /rest/v1/device_alerts inserts a new row
  String url = String(SUPABASE_URL) + "/rest/v1/device_alerts";

  http.begin(url);

  // ---- Set required Supabase headers ----
  // apikey: identifies the project (anon key is safe to embed in firmware)
  http.addHeader("apikey", SUPABASE_KEY);
  // Authorization: Bearer token for RLS policy evaluation
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  // Content-Type: we are sending JSON
  http.addHeader("Content-Type", "application/json");
  // Prefer: return=minimal means Supabase returns no body (saves bandwidth)
  http.addHeader("Prefer", "return=minimal");

  // ---- Build JSON body using ArduinoJson ----
  // StaticJsonDocument allocates memory on the stack (fast, no fragmentation)
  StaticJsonDocument<256> doc;

  doc["profile_id"]    = PROFILE_ID;
  doc["device_id"]     = DEVICE_ID;
  doc["alert_type"]    = alertType;
  doc["battery_level"] = batteryPercent;

  // Include GPS coordinates only if we have a valid fix
  if (hasGPSFix) {
    doc["latitude"]  = currentLat;
    doc["longitude"] = currentLng;
  } else {
    // Send null for coordinates when GPS has no fix
    doc["latitude"]  = (char*)NULL;
    doc["longitude"] = (char*)NULL;
  }

  // Serialize the JSON document to a string
  String jsonBody;
  serializeJson(doc, jsonBody);

  Serial.print("[ALERT] Sending ");
  Serial.print(alertType);
  Serial.print(" -> ");
  Serial.println(jsonBody);

  // ---- Send the HTTP POST request ----
  int httpResponseCode = http.POST(jsonBody);

  if (httpResponseCode > 0) {
    Serial.print("[ALERT] Response code: ");
    Serial.println(httpResponseCode);

    if (httpResponseCode == 201) {
      Serial.println("[ALERT] Alert saved successfully!");
      // Update the last alert time string for the OLED display
      lastAlertTime = getTimeString();
    } else {
      Serial.print("[ALERT] Unexpected response: ");
      Serial.println(http.getString());
    }
  } else {
    // Negative values indicate connection errors
    Serial.print("[ALERT] HTTP error: ");
    Serial.println(httpResponseCode);
  }

  // Always free the HTTP connection resources
  http.end();
}

// =============================================================================
// OLED DISPLAY UPDATE
// Draws the current device status on the 128x64 OLED screen.
//
// Layout (each line is ~10px with text size 1):
//   Line 1: Device name (KAIRO-001)
//   Line 2: WiFi status (Connected / Disconnected)
//   Line 3: Battery percentage
//   Line 4: GPS fix status and coordinates
//   Line 5: Last alert time
// =============================================================================

void updateDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // ---- Line 1: Device Name ----
  display.setCursor(0, 0);
  display.print("Device: ");
  display.println(DEVICE_ID);

  // ---- Line 2: WiFi Status ----
  display.setCursor(0, 12);
  display.print("WiFi: ");
  if (wifiConnected) {
    display.println("Connected");
  } else {
    display.println("Disconnected");
  }

  // ---- Line 3: Battery Percentage ----
  display.setCursor(0, 24);
  display.print("Battery: ");
  display.print(batteryPercent);
  display.println("%");

  // ---- Line 4: GPS Status ----
  display.setCursor(0, 36);
  if (hasGPSFix) {
    display.print("GPS: ");
    // Show coordinates with 4 decimal places (about 11m accuracy)
    display.print(currentLat, 4);
    display.print(",");
    display.println(currentLng, 4);
  } else {
    display.println("GPS: No Fix");
  }

  // ---- Line 5: Last Alert Time ----
  display.setCursor(0, 48);
  display.print("Alert: ");
  display.println(lastAlertTime);

  // Push the buffer to the physical display
  display.display();
}

// =============================================================================
// TIME STRING HELPER
// Returns a human-readable time string from the GPS module.
// If GPS time is not available, returns the millis() uptime instead.
// Format: HH:MM:SS
// =============================================================================

String getTimeString() {
  if (gps.time.isValid()) {
    // Build a formatted time string from GPS data
    char timeStr[9];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d",
             gps.time.hour(),
             gps.time.minute(),
             gps.time.second());
    return String(timeStr);
  } else {
    // Fall back to showing uptime in seconds
    unsigned long uptimeSeconds = millis() / 1000;
    return String(uptimeSeconds) + "s ago";
  }
}
