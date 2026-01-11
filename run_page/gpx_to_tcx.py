import xml.etree.ElementTree as ET

def gpx_to_tcx_with_uniform_distance(gpx_path, tcx_path, total_distance_m):
    # GPX 命名空间（含 TrackPointExtension）
    ns = {
        "gpx": "http://www.topografix.com/GPX/1/1",
        "gpxtpx": "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
    }
    
    gpx = ET.parse(gpx_path)
    root = gpx.getroot()

    trkpts = root.findall(".//gpx:trkpt", ns)
    if len(trkpts) < 2:
        raise ValueError("Not enough trackpoints")

    # 创建 TCX 根节点
    tcx = ET.Element(
        "TrainingCenterDatabase",
        {
            "xmlns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xsi:schemaLocation": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
        },
    )

    activities = ET.SubElement(tcx, "Activities")
    activity = ET.SubElement(activities, "Activity", Sport="Running")
    ET.SubElement(activity, "Id").text = trkpts[0].find("gpx:time", ns).text

    lap = ET.SubElement(
        activity,
        "Lap",
        StartTime=trkpts[0].find("gpx:time", ns).text,
    )

    ET.SubElement(lap, "TotalTimeSeconds").text = "0"
    ET.SubElement(lap, "DistanceMeters").text = f"{total_distance_m:.2f}"

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

        # ✅ 新增：提取并写入心率
        hr_value = None
        extensions = pt.find("gpx:extensions", ns)
        if extensions is not None:
            # 查找 <gpxtpx:TrackPointExtension>
            tpx = extensions.find("gpxtpx:TrackPointExtension", ns)
            if tpx is not None:
                hr_elem = tpx.find("gpxtpx:hr", ns)
                if hr_elem is not None and hr_elem.text:
                    try:
                        hr_value = int(float(hr_elem.text))
                    except ValueError:
                        pass
        
        if hr_value is not None:
            hr_bpm = ET.SubElement(tp, "HeartRateBpm")
            ET.SubElement(hr_bpm, "Value").text = str(hr_value)

    # 写入文件（格式化 XML）
    tree = ET.ElementTree(tcx)
    tree.write(tcx_path, encoding="utf-8", xml_declaration=True)