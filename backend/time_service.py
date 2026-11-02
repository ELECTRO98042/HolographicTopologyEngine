import datetime
import httpx
from fastapi import APIRouter

router = APIRouter()

@router.get("/api/v1/time")
async def get_utc_time():
    """
    Fetches synchronized UTC time. Attempts to query a public time source,
    falling back instantly to the local system time if offline or timed out.
    """
    utc_now = None
    
    # Optional: Quick non-blocking attempt to query a reliable time API/NTP source
    try:
        async with httpx.AsyncClient(timeout=0.5) as client:
            response = await client.get("http://worldtimeapi.org/api/timezone/Etc/UTC")
            if response.status_code == 200:
                data = response.json()
                # Parse datetime from ISO string or unix timestamp
                utc_now = datetime.datetime.fromisoformat(data["datetime"].replace("Z", "+00:00"))
    except Exception:
        # Fallback to local system time if network check fails or times out
        pass

    if not utc_now:
        utc_now = datetime.datetime.now(datetime.timezone.utc)

    return {
        "timestamp": utc_now.isoformat(),
        "timeString": utc_now.strftime("%H:%M:%S UTC"),
        "source": "network" if utc_now else "system_fallback"
    }