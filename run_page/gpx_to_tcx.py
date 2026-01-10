import xml.etree.ElementTree as ET

def gpx_to_tcx_with_uniform_distance(gpx_path, tcx_path, total_distance_m):
    ns = {"gpx": "http://www.topografix.com/GPX/1/1"}
    gpx = ET.parse(gpx_path)
    root = gpx.getroot()

    trkpts = root.findall(".//gpx:trkpt", ns)
    if len(trkpts) < 2:
        raise ValueError("Not enough trackpoints")

    tcx = ET.Element(
        "TrainingCenterDatabase",
        {
            "xmlns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
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

    ET.ElementTree(tcx).write(tcx_path, encoding="utf-8", xml_declaration=True)
