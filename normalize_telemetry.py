import json

base_epoch = 1730760000.0
base_logged_at = 16082869

normalized_telemetry = []
for step in range(1, 226):
    time_elapsed = round(0.2 * step, 3)
    num_points = 1000 + (step - 1) * 25
    logged_at = base_logged_at + int(time_elapsed * 1000)
    offset_sec = (logged_at - base_logged_at) / 1000.0
    normalized_entry = {
        "step": step,
        "timeElapsed": time_elapsed,
        "numPoints": num_points,
        "timestampEpoch": round(base_epoch + offset_sec, 4)
    }
    normalized_telemetry.append(normalized_entry)

with open('holographic_telemetry_normalized.json', 'w') as out_f:
    json.dump(normalized_telemetry, out_f, indent=2)

print(f'Successfully generated {len(normalized_telemetry)} records!')
