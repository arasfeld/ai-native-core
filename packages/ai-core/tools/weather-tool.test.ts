import { describe, it, expect } from "vitest";
import { weatherTool, registerWeatherTool } from "./weather-tool";
import { getToolByName } from "./tool-registry";

describe("weatherTool", () => {
  it("has the correct name", () => {
    expect(weatherTool.name).toBe("get_weather");
  });

  it("schema validates a location string", () => {
    expect(weatherTool.schema.safeParse({ location: "Tokyo" }).success).toBe(
      true,
    );
  });

  it("schema defaults unit to celsius", () => {
    const result = weatherTool.schema.safeParse({ location: "Tokyo" });
    expect(result.success && result.data.unit).toBe("celsius");
  });

  it("schema accepts fahrenheit", () => {
    expect(
      weatherTool.schema.safeParse({ location: "NYC", unit: "fahrenheit" })
        .success,
    ).toBe(true);
  });

  it("schema rejects an invalid unit", () => {
    expect(
      weatherTool.schema.safeParse({ location: "NYC", unit: "kelvin" }).success,
    ).toBe(false);
  });

  it("schema rejects missing location", () => {
    expect(weatherTool.schema.safeParse({}).success).toBe(false);
  });

  it("execute returns weather data with the correct shape", async () => {
    const result = await weatherTool.execute({
      location: "Tokyo",
      unit: "celsius",
    });
    expect(result.location).toBe("Tokyo");
    expect(result.unit).toBe("celsius");
    expect(typeof result.temperature).toBe("number");
    expect(result.condition).toBe("Sunny");
  });
});

describe("registerWeatherTool", () => {
  it("makes get_weather available in the registry", () => {
    registerWeatherTool();
    expect(getToolByName("get_weather")).toBeDefined();
  });
});
