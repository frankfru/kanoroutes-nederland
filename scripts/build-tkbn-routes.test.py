import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("build_tkbn_routes", Path(__file__).with_name("build-tkbn-routes.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class TkbnRoutesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.gpx = self.folder / "tkbn-test-route1.gpx"

    def test_dummy_track_and_real_replacement(self):
        self.gpx.write_text(
            '<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="TKBN dummyroute">'
            '<trk><trkseg><trkpt lat="52" lon="5"/><trkpt lat="52.1" lon="5.1"/>'
            '</trkseg></trk></gpx>', encoding="utf-8"
        )
        segments, dummy = builder.parse_gpx(self.gpx)
        self.assertTrue(dummy)
        self.assertEqual(segments, [[[52, 5], [52.1, 5.1]]])
        self.gpx.write_text(
            '<gpx creator="real"><rte><rtept lat="52" lon="5"/>'
            '<rtept lat="52.2" lon="5.2"/></rte></gpx>', encoding="utf-8"
        )
        segments, dummy = builder.parse_gpx(self.gpx)
        self.assertFalse(dummy)
        self.assertEqual(segments, [[[52, 5], [52.2, 5.2]]])

    def test_collection_keeps_route_links_and_dummy_center(self):
        self.gpx.write_text(
            '<gpx creator="TKBN dummyroute"><trk><trkseg>'
            '<trkpt lat="52" lon="5"/><trkpt lat="52.1" lon="5.1"/>'
            '</trkseg></trk></gpx>', encoding="utf-8"
        )
        row = {
            "gpx_bestand": self.gpx.name, "instappunt": "NH 1 Plaats, centrum",
            "routeveld": "Kanoroute1", "bron_url": "https://example.org/broken.pdf",
            "controle_url": "https://example.org/route.pdf", "breedtegraad": "52",
            "lengtegraad": "5"
        }
        with (self.folder / "bronlinks.csv").open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=row)
            writer.writeheader()
            writer.writerow(row)
        routes = builder.build_collection(self.folder, "tkbn-divers")
        self.assertEqual(routes[0]["name"], "NH 1 Plaats, centrum - route 1")
        self.assertEqual(routes[0]["folder"], "Noord-Holland")
        self.assertEqual(routes[0]["pdf"], "https://example.org/route.pdf")
        self.assertEqual(routes[0]["startPoint"], [52, 5])
        self.assertEqual(routes[0]["sourcePath"], "../collecties/tkbn-divers/tkbn-test-route1.gpx")

    def test_invalid_coordinates_are_rejected(self):
        self.gpx.write_text(
            '<gpx><trk><trkseg><trkpt lat="NaN" lon="5"/>'
            '<trkpt lat="52" lon="5"/></trkseg></trk></gpx>', encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "Ongeldige GPS-coordinaten"):
            builder.parse_gpx(self.gpx)


if __name__ == "__main__":
    unittest.main()
