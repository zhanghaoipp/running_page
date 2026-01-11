# keep_sync.py
import argparse
import base64
import json
import os
import time
import zlib
from collections import namedtuple
from datetime import datetime, timedelta, timezone
from xml.dom import minidom
import eviltransform
import gpxpy
import polyline
import requests
from config import (
    GPX_FOLDER,
    JSON_FILE,
    SQL_FILE,
    TCX_FOLDER,
    run_map,
    start_point,
)
from Crypto.Cipher import AES
from generator import Generator
from utils import adjust_time
import xml.etree.ElementTree as ET

KEEP_SPORT_TYPES = ["running", "hiking", "cycling"]
KEEP2STRAVA = {
    "outdoorWalking": "Walk",
    "outdoorRunning": "Run",
    "outdoorCycling": "Ride",
    "indoorRunning": "VirtualRun",
    "mountaineering": "Hiking",
}
KEEP2TCX = {
    "outdoorWalking": "Walking",
    "outdoorRunning": "Running",
    "outdoorCycling": "Biking",
    "indoorRunning": "Running",
    "mountaineering": "Hiking",
}

LOGIN_API = "https://api.gotokeep.com/v1.1/users/login"
RUN_DATA_API = "https://api.gotokeep.com/pd/v3/stats/detail?dateUnit=all&type={sport_type}&lastDate={last_date}"
RUN_LOG_API = "https://api.gotokeep.com/pd/v3/{sport_type}log/{run_id}"

HR_FRAME_THRESHOLD_IN_DECISECOND = 100
TIMESTAMP_THRESHOLD_IN_DECISECOND = 3_600_000
TRANS_GCJ02_TO_WGS84 = True


def login(session, mobile, password):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0",
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    }
    data = {"mobile": mobile, "password": password}
    r = session.post(LOGIN_API, headers=headers, data=data)
    if r.ok:
        token = r.json()["data"]["token"]
        headers["Authorization"] = f"Bearer {token}"
        return session, headers
    else:
        raise Exception(f"Login failed: {r.text}")


def get_to_download_runs_ids(session, headers, sport_type):
    last_date = 0
    result = []

    while True:
        r = session.get(
            RUN_DATA_API.format(sport_type=sport_type, last_date=last_date),
            headers=headers,
        )
        if r.ok:
            data = r.json()
            if not data.get("data"):
                break
            run_logs = data["data"]["records"]
            for i in run_logs:
                logs = [j["stats"] for j in i["logs"]]
                result.extend(k["id"] for k in logs if not k["isDoubtful"])
            last_date = data["data"]["lastTimestamp"]
            since_time = datetime.fromtimestamp(last_date // 1000, tz=timezone.utc)
            print(f"pares keep ids data since {since_time}")
            time.sleep(1)
            if not last_date:
                break
        else:
            print(f"API error: {r.status_code} - {r.text}")
            break
    return result


def get_single_run_data(session, headers, run_id, sport_type):
    r = session.get(
        RUN_LOG_API.format(sport_type=sport_type, run_id=run_id), headers=headers
    )
    if r.ok:
        return r.json()
    else:
        print(f"Failed to fetch run {run_id}: {r.status_code}")
        return None


def decode_runmap_data(text, is_geo=False):
    _bytes = base64.b64decode(text)
    key = "NTZmZTU5OzgyZzpkODczYw=="
    iv = "MjM0Njg5MjQzMjkyMDMwMA=="
    if is_geo:
        cipher = AES.new(base64.b64decode(key), AES.MODE_CBC, base64.b64decode(iv))
        _bytes = cipher.decrypt(_bytes)
    run_points_data = zlib.decompress(_bytes, 16 + zlib.MAX_WBITS)
    run_points_data = json.loads(run_points_data)
    return run_points_data


def assign_cadence_to_points(run_points_data, cadence_by_distance):
    """
    为每个轨迹点分配对应的步频（基于累计距离匹配公里段）
    cadence_by_distance: [(totalDistance_m, stepFrequency), ...] 按距离升序排列
    """
    if not cadence_by_distance or len(run_points_data) <= 1:
        return run_points_data

    # 确保按距离升序排列
    cadence_by_distance.sort(key=lambda x: x[0])
    
    # 提取所有公里段距离
    km_distances = [item[0] for item in cadence_by_distance]
    km_cadences = [item[1] for item in cadence_by_distance]
    
    total_points = len(run_points_data)
    total_distance = km_distances[-1]  # 最后一公里的累计距离

    for i, point in enumerate(run_points_data):
        # 计算当前点的累计距离（线性插值）
        if total_points > 1:
            current_dist = (i / (total_points - 1)) * total_distance
        else:
            current_dist = 0.0

        # 找到当前距离所属的公里段（二分查找更高效，这里用简单遍历）
        assigned_cadence = km_cadences[0]  # 默认第一公里
        for j in range(len(km_distances)):
            if km_distances[j] <= current_dist:
                assigned_cadence = km_cadences[j]
            else:
                break
        
        point["cad"] = assigned_cadence
    
    return run_points_data


def parse_raw_data_to_nametuple(
    run_data, old_gpx_ids, old_tcx_ids, with_gpx=False, with_tcx=False
):
    if not isinstance(run_data, dict) or "data" not in run_data:
        print(f"Invalid response format: {run_data}")
        return None
    
    run_data = run_data["data"]
    if not run_data:
        print("Empty run data")
        return None

    keep_id = run_data["id"].split("_")[1]
    start_time = run_data["startTime"]

    avg_heart_rate = None
    elevation_gain = None
    decoded_hr_data = []

    if run_data.get("heartRate"):
        avg_heart_rate = run_data["heartRate"].get("averageHeartRate")
        heart_rate_data = run_data["heartRate"].get("heartRates")
        if heart_rate_data:
            decoded_hr_data = decode_runmap_data(heart_rate_data)
        if avg_heart_rate and avg_heart_rate < 0:
            avg_heart_rate = None

    total_calories = run_data.get("calorie", 0)

    if run_data.get("geoPoints"):
        run_points_data = decode_runmap_data(run_data["geoPoints"], True)
        run_points_data_gpx = run_points_data
        
        # 👇 构建步频映射表（使用原始 stepFrequency，不除以2）
        cadence_by_distance = []
        cross_km_points = run_data.get("crossKmPoints", [])
        for point in cross_km_points:
            total_dist = point.get("totalDistance", 0)
            step_freq = point.get("stepFrequency")
            if step_freq is not None:
                # ✅ 关键：直接使用原始值（左右脚合计）
                cadence_by_distance.append((total_dist, int(step_freq / 2)))
        
        run_points_data_gpx = assign_cadence_to_points(run_points_data_gpx, cadence_by_distance)

        if TRANS_GCJ02_TO_WGS84:
            run_points_data = [
                list(eviltransform.gcj2wgs(p["latitude"], p["longitude"]))
                for p in run_points_data
            ]
            for i, p in enumerate(run_points_data_gpx):
                p["latitude"] = run_points_data[i][0]
                p["longitude"] = run_points_data[i][1]

        for p in run_points_data_gpx:
            if "timestamp" not in p:
                p["timestamp"] = p.get("unixTimestamp", 0)
            p_hr = find_nearest_hr(decoded_hr_data, int(p["timestamp"]), start_time)
            if p_hr:
                p["hr"] = p_hr

        if (
            run_data["dataType"].startswith("outdoor")
            or run_data["dataType"] == "mountaineering"
        ):
            if with_gpx:
                gpx_data = parse_points_to_gpx(
                    run_points_data_gpx, start_time, KEEP2STRAVA[run_data["dataType"]]
                )
                elevation_gain = gpx_data.get_uphill_downhill().uphill
                if str(keep_id) not in old_gpx_ids:
                    download_keep_gpx(gpx_data.to_xml(), str(keep_id))
            if with_tcx:
                tcx_data = parse_points_to_tcx(
                    run_data, run_points_data_gpx, KEEP2TCX[run_data["dataType"]]
                )
                if str(keep_id) not in old_tcx_ids:
                    download_keep_tcx(tcx_data.toprettyxml(), str(keep_id))
    else:
        print(f"ID {keep_id} no gps data")
        return None

    polyline_str = polyline.encode(run_points_data) if run_points_data else ""
    start_latlng = start_point(*run_points_data[0]) if run_points_data else None
    start_date = datetime.fromtimestamp(start_time // 1000, tz=timezone.utc)
    tz_name = run_data.get("timezone", "")
    start_date_local = adjust_time(start_date, tz_name)
    end = datetime.fromtimestamp(run_data["endTime"] // 1000, tz=timezone.utc)
    end_local = adjust_time(end, tz_name)
    
    if not run_data.get("duration"):
        print(f"ID {keep_id} has no total time")
        return None

    d = {
        "id": int(keep_id),
        "name": f"{KEEP2STRAVA[run_data['dataType']]} from keep",
        "type": f"{KEEP2STRAVA[(run_data['dataType'])]}",
        "subtype": f"{KEEP2STRAVA[(run_data['dataType'])]}",
        "start_date": datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S"),
        "end": datetime.strftime(end, "%Y-%m-%d %H:%M:%S"),
        "start_date_local": datetime.strftime(start_date_local, "%Y-%m-%d %H:%M:%S"),
        "end_local": datetime.strftime(end_local, "%Y-%m-%d %H:%M:%S"),
        "length": run_data["distance"],
        "average_heartrate": int(avg_heart_rate) if avg_heart_rate else None,
        "map": run_map(polyline_str),
        "start_latlng": start_latlng,
        "distance": run_data["distance"],
        "moving_time": timedelta(seconds=run_data["duration"]),
        "elapsed_time": timedelta(
            seconds=int((run_data["endTime"] - run_data["startTime"]) // 1000)
        ),
        "average_speed": run_data["distance"] / run_data["duration"],
        "elevation_gain": elevation_gain,
        "location_country": str(run_data.get("region", "")),
        "calories": int(total_calories),
    }
    return namedtuple("x", d.keys())(*d.values())


def get_all_keep_tracks(
    email,
    password,
    old_tracks_ids,
    keep_sports_data_api,
    with_gpx=False,
    with_tcx=False,
):
    if with_gpx and not os.path.exists(GPX_FOLDER):
        os.mkdir(GPX_FOLDER)
    if with_tcx and not os.path.exists(TCX_FOLDER):
        os.mkdir(TCX_FOLDER)
    s = requests.Session()
    s, headers = login(s, email, password)
    tracks = []
    for api in keep_sports_data_api:
        runs = get_to_download_runs_ids(s, headers, api)
        runs = [run for run in runs if run.split("_")[1] not in old_tracks_ids]
        print(f"{len(runs)} new keep {api} data to generate")
        old_gpx_ids = []
        if with_gpx:
            old_gpx_ids = os.listdir(GPX_FOLDER)
            old_gpx_ids = [
                i.split(".")[0] for i in old_gpx_ids if not i.startswith(".")
            ]
        old_tcx_ids = []
        if with_tcx:
            old_tcx_ids = os.listdir(TCX_FOLDER)
            old_tcx_ids = [
                i.split(".")[0] for i in old_tcx_ids if not i.startswith(".")
            ]
        for run in runs:
            print(f"parsing keep id {run}")
            try:
                run_data = get_single_run_data(s, headers, run, api)
                if run_data is None:
                    continue
                track = parse_raw_data_to_nametuple(
                    run_data, old_gpx_ids, old_tcx_ids, with_gpx, with_tcx
                )
                if track:
                    tracks.append(track)
            except Exception as e:
                print(f"Something wrong parsing keep id {run}: {str(e)}")
    return tracks


def parse_points_to_gpx(run_points_data, start_time, sport_type):
    points_dict_list = []
    if (
        run_points_data
        and run_points_data[0]["timestamp"] > TIMESTAMP_THRESHOLD_IN_DECISECOND
    ):
        start_time = 0

    for point in run_points_data:
        points_dict = {
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            "time": datetime.fromtimestamp(
                (start_time // 1000 + point["timestamp"] // 10),
                tz=timezone.utc,
            ),
            "elevation": point.get("altitude"),
            "hr": point.get("hr"),
            "cad": point.get("cad"),  # 步频（原始值）
        }
        points_dict_list.append(points_dict)
    gpx = gpxpy.gpx.GPX()
    gpx.nsmap["gpxtpx"] = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
    gpx_track = gpxpy.gpx.GPXTrack()
    gpx_track.name = "gpx from keep"
    gpx_track.type = sport_type
    gpx.tracks.append(gpx_track)

    gpx_segment = gpxpy.gpx.GPXTrackSegment()
    gpx_track.segments.append(gpx_segment)
    for p in points_dict_list:
        point = gpxpy.gpx.GPXTrackPoint(
            latitude=p["latitude"],
            longitude=p["longitude"],
            time=p["time"],
            elevation=p.get("elevation"),
        )
        if p.get("hr") is not None or p.get("cad") is not None:
            ext_content = ""
            if p.get("hr") is not None:
                ext_content += f"<gpxtpx:hr>{p['hr']}</gpxtpx:hr>"
            if p.get("cad") is not None:
                ext_content += f"<gpxtpx:cad>{p['cad']}</gpxtpx:cad>"
            
            gpx_extension = ET.fromstring(
                f"""<gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
                        {ext_content}
                    </gpxtpx:TrackPointExtension>"""
            )
            point.extensions.append(gpx_extension)
        gpx_segment.points.append(point)
    return gpx


def parse_points_to_tcx(run_data, run_points_data, sport_type):
    fit_start_time = datetime.fromtimestamp(
        run_data.get("startTime") // 1000, tz=timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    training_center_database = ET.Element(
        "TrainingCenterDatabase",
        {
            "xmlns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xsi:schemaLocation": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd",
        },
    )
    activities = ET.Element("Activities")
    training_center_database.append(activities)
    activity = ET.Element("Activity", {"Sport": sport_type})
    activities.append(activity)
    activity_id = ET.Element("Id")
    activity_id.text = fit_start_time
    activity.append(activity_id)
    activity_lap = ET.Element("Lap", {"StartTime": fit_start_time})
    activity.append(activity_lap)
    activity_total_time = ET.Element("TotalTimeSeconds")
    activity_total_time.text = str(run_data.get("duration", 0))
    activity_lap.append(activity_total_time)
    activity_distance = ET.Element("DistanceMeters")
    activity_distance.text = str(run_data.get("distance", 0))
    activity_lap.append(activity_distance)
    activity_calories = ET.Element("Calories")
    activity_calories.text = str(run_data.get("calorie", 0))
    activity_lap.append(activity_calories)

    track = ET.Element("Track")
    activity_lap.append(track)
    for point in run_points_data:
        tp = ET.Element("Trackpoint")
        track.append(tp)
        time_stamp = datetime.fromtimestamp(
            (run_data.get("startTime") // 1000 + point.get("timestamp") // 10),
            tz=timezone.utc,
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        time_label = ET.Element("Time")
        time_label.text = time_stamp
        tp.append(time_label)
        try:
            position = ET.Element("Position")
            tp.append(position)
            lati = ET.Element("LatitudeDegrees")
            lati.text = str(point["latitude"])
            position.append(lati)
            longi = ET.Element("LongitudeDegrees")
            longi.text = str(point["longitude"])
            position.append(longi)
            altitude_meters = ET.Element("AltitudeMeters")
            altitude_meters.text = str(point.get("altitude", 0))
            tp.append(altitude_meters)
        except KeyError:
            pass
        if point.get("hr") is not None:
            bpm = ET.Element("HeartRateBpm")
            bpm_value = ET.Element("Value")
            bpm_value.text = str(point["hr"])
            bpm.append(bpm_value)
            tp.append(bpm)
    xml_str = minidom.parseString(ET.tostring(training_center_database))
    return xml_str


def find_nearest_hr(
    hr_data_list, target_time, start_time, threshold=HR_FRAME_THRESHOLD_IN_DECISECOND
):
    closest_element = None
    min_difference = float("inf")
    if target_time > TIMESTAMP_THRESHOLD_IN_DECISECOND:
        target_time = target_time - start_time // 100

    for item in hr_data_list:
        timestamp = item.get("timestamp")
        if not timestamp:
            continue
        difference = abs(timestamp - target_time)
        if difference <= threshold and difference < min_difference:
            closest_element = item
            min_difference = difference

    if closest_element:
        hr = closest_element.get("beatsPerMinute")
        if hr and hr > 0:
            return hr
    return None


def download_keep_gpx(gpx_data, keep_id):
    try:
        print(f"downloading keep_id {str(keep_id)} gpx")
        file_path = os.path.join(GPX_FOLDER, str(keep_id) + ".gpx")
        with open(file_path, "w") as fb:
            fb.write(gpx_data)
        return file_path
    except Exception as e:
        print(f"Something wrong to download keep gpx {str(e)}")
        print(f"wrong id {keep_id}")


def download_keep_tcx(tcx_data, keep_id):
    try:
        print(f"downloading keep_id {str(keep_id)} tcx")
        file_path = os.path.join(TCX_FOLDER, str(keep_id) + ".tcx")
        with open(file_path, "w") as fb:
            fb.write(tcx_data)
        return file_path
    except Exception as e:
        print(f"Something wrong to download keep tcx {str(e)}")
        print(f"wrong id {keep_id}")


def run_keep_sync(
    email, password, keep_sports_data_api, with_download_gpx=False
):
    if not os.path.exists(KEEP2STRAVA_BK_PATH):
        file = open(KEEP2STRAVA_BK_PATH, "w")
        file.close()
        content = []
    else:
        with open(KEEP2STRAVA_BK_PATH) as f:
            try:
                content = json.loads(f.read())
            except json.JSONDecodeError as e:
                print(f"Error reading JSON file {KEEP2STRAVA_BK_PATH}: {e}")
                content = []
    old_tracks_ids = [str(a["run_id"]) for a in content]
    
    # 👇 启用 GPX 生成
    _new_tracks = get_all_keep_tracks(
        email, password, old_tracks_ids, keep_sports_data_api,
        with_gpx=True,   # 必须为 True
        with_tcx=False
    )
    
    new_tracks = []
    for track in _new_tracks:
        if track.start_latlng is not None:
            file_path = namedtuple("x", "gpx_file_path")(
                os.path.join(GPX_FOLDER, str(track.id) + ".gpx")
            )
        else:
            file_path = namedtuple("x", "gpx_file_path")(None)
        track = namedtuple("y", track._fields + file_path._fields)(*(track + file_path))
        new_tracks.append(track)

    return new_tracks