# test_strava.py
from stravalib.client import Client
import time

CLIENT_ID = "194994"
CLIENT_SECRET = "4bc37245a7b20bb06be35c03832f67c6901dbae7"
REFRESH_TOKEN = "189d22d660a375bf476d0856cab84a988fcc1e1d"

client = Client()

# 使用 Refresh Token 获取新 Access Token
token_response = client.refresh_access_token(
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    refresh_token=REFRESH_TOKEN
)

# 设置新令牌
client.access_token = token_response['access_token']
client.refresh_token = token_response['refresh_token']
client.token_expires_at = token_response['expires_at']

# 现在可以安全调用 API
activities = list(client.get_activities(after="2026-01-01"))
print(f"Total activities in Jan 2026: {len(activities)}")

for act in activities:
    if "2026-01-11" in str(act.start_date):
        print(f"ID: {act.id}, Name: {act.name}, Date: {act.start_date}")