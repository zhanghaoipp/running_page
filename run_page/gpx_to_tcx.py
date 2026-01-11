# gpx_to_tcx.py
import xml.etree.ElementTree as ET

def gpx_to_tcx_with_uniform_distance(gpx_path, tcx_path, total_distance_m, calories=0):
    ns = {
        "gpx": "http://www.topografix.com/GPX/1/1",
        "gpxtpx": "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
    }
    
    gpx = ET.parse(gpx_path)
    root = gpx.getroot()
    trkpts = root.findall(".//gpx:trkpt", ns)
    if len(trkpts) < 2:
        raise ValueError("Not enough trackpoints")

    tcx = ET.Element("TrainingCenterDatabase", {
        "xmlns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xmlns:ns3": "http://www.garmin.com/xmlschemas/ActivityExtension/v2",
        "xsi:schemaLocation": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
    })

    activities = ET.SubElement(tcx, "Activities")
    activity = ET.SubElement(activities, "Activity", Sport="running")
    first_time = trkpts[0].find("gpx:time", ns).text
    ET.SubElement(activity, "Id").text = first_time

    lap = ET.SubElement(activity, "Lap", StartTime=first_time)
    ET.SubElement(lap, "TotalTimeSeconds").text = "0"
    ET.SubElement(lap, "DistanceMeters").text = f"{total_distance_m:.2f}"
    ET.SubElement(lap, "Calories").text = str(int(calories))
    ET.SubElement(lap, "Intensity").text = "Active"
    ET.SubElement(lap, "TriggerMethod").text = "Manual"

    track = ET.SubElement(lap, "Track")
    n = len(trkpts)
    for i, pt in enumerate(trkpts):
        tp = ET.SubElement(track, "Trackpoint")
        ET.SubElement(tp, "Time").text = pt.find("gpx:time", ns).text

        pos = ET.SubElement(tp, "Position")
        ET.SubElement(pos, "LatitudeDegrees").text = pt.attrib["lat"]
        ET.SubElement(pos, "LongitudeDegrees").text = pt.attrib["lon"]

        dist = total_distance_m * i / (n - 1)
        ET.SubElement(tp, "DistanceMeters").text = f"{dist:.2f}"

        # 心率
        hr_elem = pt.find(".//{http://www.garmin.com/xmlschemas/TrackPointExtension/v1}hr")
        if hr_elem is not None and hr_elem.text:
            try:
                hr_value = int(float(hr_elem.text))
                hr_bpm = ET.SubElement(tp, "HeartRateBpm")
                ET.SubElement(hr_bpm, "Value").text = str(hr_value)
            except ValueError:
                pass

        # ✅ 步频（从 GPX 读取，直接使用原始值）
        cad_elem = pt.find(".//{http://www.garmin.com/xmlschemas/TrackPointExtension/v1}cad")
        if cad_elem is not None and cad_elem.text:
            try:
                cad_value = int(float(cad_elem.text))
                # 创建 Extensions
                extensions = ET.SubElement(tp, "Extensions")
                # 创建 TPX（带命名空间）
                tpx = ET.Element(
                    "TPX", 
                    {"xmlns": "http://www.garmin.com/xmlschemas/ActivityExtension/v2"}
                )
                extensions.append(tpx)
                # 在 TPX 内创建 RunCadence
                run_cadence = ET.Element("RunCadence")
                run_cadence.text = str(cad_value)
                tpx.append(run_cadence)
            except ValueError:
                pass

    tree = ET.ElementTree(tcx)
    tree.write(tcx_path, encoding="utf-8", xml_declaration=True)