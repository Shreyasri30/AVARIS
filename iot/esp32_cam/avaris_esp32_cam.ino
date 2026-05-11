#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"

// --- Configuration ---
const char* ssid = "Niya";
const char* password = "RajeshNiya@999";

// STATIC IP CONFIGURATION
IPAddress local_IP(192, 168, 1, 40);
IPAddress gateway(192, 168, 1, 1);    
IPAddress subnet(255, 255, 255, 0);

// Camera Pins (Standard AI-Thinker Model)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t camera_httpd = NULL;
bool is_capturing = false; // Global flag to prioritize high-res capture

// --- Handlers ---

// Utility for quick connectivity check
esp_err_t ping_handler(httpd_req_t *req){
  httpd_resp_set_type(req, "text/plain");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, "PONG", 4);
}

esp_err_t stream_handler(httpd_req_t *req){
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char * part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if(res != ESP_OK) return res;
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");

  while(true){
    // DUAL-PORT HARD SILENCE: Stream is on Port 81.
    // If capture starts on Port 80, we must EXIT this handler completely.
    // This instantly frees the single Port 81 socket so the browser 
    // is guaranteed a successful connection when it requests the stream again.
    if(is_capturing) {
      Serial.println("Port 81 Stream exiting to free socket for resume...");
      return ESP_OK; 
    }

    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed during stream");
      vTaskDelay(100 / portTICK_PERIOD_MS);
      continue;
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }
    
    if(res == ESP_OK){
      size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if(res == ESP_OK){
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if(res == ESP_OK){
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    
    if(fb){
      esp_camera_fb_return(fb);
      fb = NULL;
    }

    if(res != ESP_OK) break;
    
    // Cooperative yielding: allow the network stack to breathe
    vTaskDelay(10 / portTICK_PERIOD_MS); 
  }
  return res;
}

esp_err_t capture_handler(httpd_req_t *req){
  is_capturing = true; 
  vTaskDelay(200 / portTICK_PERIOD_MS); // Wait for stream socket to be fully purged
  
  // HARDWARE BUFFER FLUSH: Clear out any old frames still in DMA
  Serial.println("Flushing stale buffers...");
  for(int i=0; i<3; i++) {
    camera_fb_t * tmp = esp_camera_fb_get();
    if(tmp) esp_camera_fb_return(tmp);
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }

  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;

  Serial.println("High-Priority Capture triggered (Single-Socket Mode).");
  fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Capture failed: No buffer after flush");
    httpd_resp_send_500(req);
    is_capturing = false;
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  
  if(fb){
    esp_camera_fb_return(fb);
    fb = NULL;
  }
  
  is_capturing = false; 
  return res;
}

httpd_handle_t stream_httpd = NULL; // New stream server instance

void startCameraServer(){
  // --- SERVER 1: Control API (Port 80) ---
  httpd_config_t config_api = HTTPD_DEFAULT_CONFIG();
  config_api.server_port = 80;
  config_api.ctrl_port = 32768; // Must be unique for multiple servers
  config_api.max_open_sockets = 1;       
  config_api.lru_purge_enable = true;    
  config_api.uri_match_fn = httpd_uri_match_wildcard; // Allows query params like ?t=123

  httpd_uri_t capture_uri = {
    .uri       = "/capture*",
    .method    = HTTP_GET,
    .handler   = capture_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t ping_uri = {
    .uri       = "/ping*",
    .method    = HTTP_GET,
    .handler   = ping_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&camera_httpd, &config_api) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &ping_uri);
  }

  // --- SERVER 2: Video Stream (Port 81) ---
  httpd_config_t config_stream = HTTPD_DEFAULT_CONFIG();
  config_stream.server_port = 81;
  config_stream.ctrl_port = 32769; // Must be unique
  config_stream.max_open_sockets = 1;
  config_stream.lru_purge_enable = true;
  config_stream.uri_match_fn = httpd_uri_match_wildcard; // Allows query params for stream too

  httpd_uri_t stream_uri = {
    .uri       = "/stream*",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &config_stream) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nAVARIS High-Stability Booting...");

  pinMode(PWDN_GPIO_NUM, OUTPUT);
  digitalWrite(PWDN_GPIO_NUM, LOW); 

  // Config Static IP
  if (!WiFi.config(local_IP, gateway, subnet)) {
    Serial.println("STA Failed to configure Static IP");
  }

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if(psramFound()){
    config.frame_size = FRAMESIZE_SVGA; // Standardize on SVGA for 100% stability
    config.jpeg_quality = 10;
    config.fb_count = 2; 
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  startCameraServer();

  Serial.println("AVARIS High-Stability Camera Ready");
  Serial.print("Locked at: http://");
  Serial.println(WiFi.localIP());
}

void loop() {
  delay(10000);
}
