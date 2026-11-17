# Temperature and weather

Milestone 7 adds a small, deterministic climate model. It uses the saved tick, world seed, and terrain height. No weather timer, random-generator stream, or temperature grid is stored in memory or in snapshots.

At sea level, air temperature is 17°C at midnight and 27°C at midday, following a smooth daily curve centered on 22°C. Higher terrain cools by 0.08°C per metre above sea level. The current day's weather then adds an offset:

| Weather | Seeded share of days | Temperature change | Vision |
| --- | ---: | ---: | ---: |
| Clear | 50% | 0°C | unchanged |
| Rain | 25% | −2°C | 15% shorter range |
| Heatwave | 13% | +5°C | unchanged |
| Cold front | 12% | −5°C | unchanged |

One weather type applies to the whole world for one simulated day. The type is selected by a fixed hash of seed and day number, so it remains the same after a restart and does not consume simulation PRNG draws. Rain currently changes air temperature and sight; it does not raise water levels, grow food, or create precipitation art. There are no regional fronts or seasons yet.

Below 15°C, cold raises hunger gain by 1.5% per degree, capped at 20%. Above 28°C, heat raises thirst gain by 2.5% per degree, also capped at 20%. Ordinary temperatures leave baseline metabolism unchanged. Temperature does not directly kill an agent. Survival decisions use the temperature-adjusted rates when comparing urgent hunger and thirst deadlines. Agents still rest according to the daily rhythm and can seek terrain water on any day.

`GET /api/simulation/status` exposes the weather type and a representative sea-level temperature. Agent summaries and details expose local `temperatureC` based on their current cell. These fields are read-only and additive for existing web and mobile viewers. The web simulation panel shows both global values and local temperature for a selected agent; mobile shows weather in the status and local temperature in agent details.

New snapshots pin `climateModelVersion: 1`. Snapshots from earlier milestones have no climate marker and load without resetting the world; their next save adds the marker. A snapshot pinned to another model version fails restoration with an explicit error. Changing the formula later requires a versioned migration or an intentional world reset. No new deployment variable or volume is needed. Monitor the [milestone 7 baseline](baselines/survival-m7.md) against the [milestone 6 baseline](baselines/survival-m6.md) before releasing to `main`.
