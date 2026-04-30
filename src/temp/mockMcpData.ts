// TEMPORARY — mock MCP server responses.
// Replace with real MCP server calls when integration is ready.

export const MOCK_FLEET_DATA = {
  vehicles: [
    { id: "V001", name: "Truck-01",  speed: 65, fuel: 78, location: "Colombo",  status: "moving", mileage: 42300, engine: "normal"  },
    { id: "V002", name: "Van-02",    speed: 0,  fuel: 45, location: "Kandy",    status: "idle",   mileage: 31200, engine: "normal"  },
    { id: "V003", name: "Truck-03",  speed: 80, fuel: 90, location: "Galle",    status: "moving", mileage: 56700, engine: "normal"  },
    { id: "V004", name: "Van-04",    speed: 55, fuel: 30, location: "Colombo",  status: "moving", mileage: 18900, engine: "warning" },
    { id: "V005", name: "Car-05",    speed: 0,  fuel: 60, location: "Negombo",  status: "parked", mileage: 9200,  engine: "normal"  }
  ],
  summary: {
    total: 5,
    moving: 3,
    idle: 1,
    parked: 1,
    avg_speed_kmh: 40,
    avg_fuel_percent: 60.6
  }
};

export const MOCK_WEATHER_DATA: Record<string, {
  condition: string;
  temperature_c: number;
  humidity_percent: number;
  rain_probability_percent: number;
  wind_speed_kmh: number;
  forecast: string;
}> = {
  colombo: {
    condition: "Partly Cloudy",
    temperature_c: 29,
    humidity_percent: 78,
    rain_probability_percent: 25,
    wind_speed_kmh: 18,
    forecast: "Chance of light showers in the evening"
  },
  kandy: {
    condition: "Overcast",
    temperature_c: 24,
    humidity_percent: 85,
    rain_probability_percent: 60,
    wind_speed_kmh: 12,
    forecast: "Rain expected in the afternoon"
  },
  galle: {
    condition: "Sunny",
    temperature_c: 31,
    humidity_percent: 70,
    rain_probability_percent: 10,
    wind_speed_kmh: 20,
    forecast: "Clear skies throughout the day"
  },
  negombo: {
    condition: "Sunny",
    temperature_c: 30,
    humidity_percent: 72,
    rain_probability_percent: 15,
    wind_speed_kmh: 22,
    forecast: "Sunny with a gentle sea breeze"
  },
  jaffna: {
    condition: "Hot and Dry",
    temperature_c: 34,
    humidity_percent: 55,
    rain_probability_percent: 5,
    wind_speed_kmh: 15,
    forecast: "Very hot; stay hydrated"
  }
};

export const MOCK_HISTORY_DATA = {
  messages: [
    { role: "user",      content: "Show me fleet status",                 timestamp: "2025-04-26T09:00:00Z" },
    { role: "assistant", content: "5 vehicles total — 3 moving, 1 idle, 1 parked.", timestamp: "2025-04-26T09:00:05Z" },
    { role: "user",      content: "What is the fuel level of Truck-03?",  timestamp: "2025-04-26T09:05:00Z" },
    { role: "assistant", content: "Truck-03 has 90% fuel, currently in Galle.", timestamp: "2025-04-26T09:05:03Z" },
    { role: "user",      content: "Generate a fleet report",              timestamp: "2025-04-26T09:10:00Z" },
    { role: "assistant", content: "Fleet report generated with speed trends and fuel level charts.", timestamp: "2025-04-26T09:10:08Z" }
  ],
  summary: "The previous session covered fleet status overview, a fuel level query for Truck-03, and fleet report generation."
};

export const MOCK_AGRICULTURE_DATA = {
  crops: [
    { zone: "Zone A", crop: "Rice",  soil_moisture_percent: 65, temperature_c: 28, ph: 6.5, status: "healthy",   harvest_ready: false },
    { zone: "Zone B", crop: "Tea",   soil_moisture_percent: 72, temperature_c: 22, ph: 5.8, status: "healthy",   harvest_ready: true  },
    { zone: "Zone C", crop: "Maize", soil_moisture_percent: 45, temperature_c: 30, ph: 6.8, status: "dry_alert", harvest_ready: false }
  ],
  summary: {
    total_zones: 3,
    healthy: 2,
    alerts: 1,
    avg_moisture_percent: 60.7
  }
};
