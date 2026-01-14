import argparse
import json

from config import JSON_FILE, SQL_FILE
from generator import Generator


# for only run type, we use the same logic as garmin_sync
def run_strava_sync(
    client_id,
    client_secret,
    refresh_token,
    sync_types: list = [],
    only_run=False,
):
    generator = Generator(SQL_FILE)
    generator.set_strava_config(client_id, client_secret, refresh_token)
    # judge sync types is only running or not
    if not only_run and len(sync_types) == 1 and sync_types[0] == "running":
        only_run = True
    # if you want to refresh data change False to True
    generator.only_run = only_run
    generator.sync(False)

    activities_list = generator.load()
    
    #调试：打印所有活动（无论类型）的 ID 和本地日期
    print("=== 调试：同步后的所有活动 ===")
    for act in activities_list:
        act_id = act.get('run_id')          # 实际是 activity ID
        start_date_local = act.get('start_date_local')
        act_type = act.get('type', 'Unknown')
        print(f"ID: {act_id} | 类型: {act_type} | 日期: {start_date_local}")
    print("==================================\n")

    with open(JSON_FILE, "w") as f:
        json.dump(activities_list, f)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("client_id", help="strava client id")
    parser.add_argument("client_secret", help="strava client secret")
    parser.add_argument("refresh_token", help="strava refresh token")
    parser.add_argument(
        "--only-run",
        dest="only_run",
        action="store_true",
        help="if is only for running",
    )
    options = parser.parse_args()
    run_strava_sync(
        options.client_id,
        options.client_secret,
        options.refresh_token,
        only_run=options.only_run,
    )
