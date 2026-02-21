import { z } from "zod";
import { Tool, registerTool } from "./tool-registry";

export const weatherTool: Tool = {
  name: "get_weather",
  description: "Get the current weather for a location",
  schema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
  }),
  execute: async ({ location, unit }) => {
    // Simulated weather data
    const temp = Math.floor(Math.random() * 30);
    return {
      location,
      temperature: temp,
      unit,
      condition: "Sunny",
    };
  },
};

export function registerWeatherTool() {
  registerTool(weatherTool);
}
